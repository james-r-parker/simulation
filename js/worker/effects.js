// Render effects: turns each tick's event records and the alive slots into bite, birth, death, call and smoke effects,
// and writes the pending ones into a snapshot's effects part. Reads the world and never changes it.

import { BORN_CAUSE, DEATH_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { TIMER_CAP } from '../sim/world.js';

/** Effect kinds; the `kind` word of a record. */
export const EFFECT_KIND = Object.freeze({
    BORN: 1,
    DIED: 2,
    BITE: 3,
    ALARM: 4,
    PACK_CALL: 5,
    SMOKE: 6,
    ESCAPED: 7,
    MATED: 8,
});

/** Records the log holds; when full the oldest are dropped. */
export const EFFECT_CAPACITY = 512;

/** Words per record: `kind`, `tick`, `x`, `y`, then `a`, `b`, `c` and `d`. */
export const EFFECT_WORDS = 8;

/** Words of the header in the snapshot: `count` and `dropped`. */
export const EFFECT_HEADER_WORDS = 2;

/** `bittenTimer` after the tick in which `feed` reset it. */
const BITTEN_THIS_TICK = 1;
const SPEC_SHIFT = 8;
const PACK_FLAG = 65536;
const DEATH_CAUSE_SHIFT = 256;

/**
 * @typedef {object} EffectLog
 * @property {Uint32Array} u32 `EFFECT_CAPACITY` records of `EFFECT_WORDS` words, as a ring
 * @property {Float32Array} f32 the same words as floats
 * @property {number} start the ring index of the oldest record
 * @property {number} count records held
 * @property {number} dropped records pushed out since the last `writeEffects`
 * @property {Float32Array} cacheX each slot's x at the end of the last collected tick
 * @property {Float32Array} cacheY each slot's y
 * @property {Uint32Array} cacheGenome the genome that was in each slot, 0 when empty
 * @property {Uint32Array} cacheLineage that genome's lineage
 * @property {Uint8Array} cacheSpec that genome's specialisation
 * @property {Uint16Array} cachePregnancy that genome's pregnancy count at the start of the tick
 */

/**
 * @param {number} maxAgents the world's slot count
 * @returns {EffectLog} an empty log
 */
export function createEffectLog(maxAgents) {
    const buffer = new ArrayBuffer(EFFECT_CAPACITY * EFFECT_WORDS * 4);
    return {
        u32: new Uint32Array(buffer),
        f32: new Float32Array(buffer),
        start: 0,
        count: 0,
        dropped: 0,
        cacheX: new Float32Array(maxAgents),
        cacheY: new Float32Array(maxAgents),
        cacheGenome: new Uint32Array(maxAgents),
        cacheLineage: new Uint32Array(maxAgents),
        cacheSpec: new Uint8Array(maxAgents),
        cachePregnancy: new Uint16Array(maxAgents),
    };
}

/**
 * Starts a record, dropping the oldest when the log is full, and writes its kind and tick.
 * @param {EffectLog} log the log
 * @param {number} kind an `EFFECT_KIND`
 * @param {number} tick the tick it happened in
 * @returns {number} the word offset of the record; the caller writes `x` and `y` at `+ 2` and `+ 3` and words `a` to `d`
 *   at `+ 4` to `+ 7`
 */
function begin(log, kind, tick) {
    let index;
    if (log.count === EFFECT_CAPACITY) {
        index = log.start;
        log.start = (log.start + 1) % EFFECT_CAPACITY;
        log.dropped += 1;
    } else {
        index = (log.start + log.count) % EFFECT_CAPACITY;
        log.count += 1;
    }
    const o = index * EFFECT_WORDS;
    log.u32[o] = kind;
    log.u32[o + 1] = tick;
    return o;
}

/**
 * @param {EffectLog} log the log
 * @param {number} o a record's word offset
 * @param {number} x the x
 * @param {number} y the y
 * @returns {void}
 */
function place(log, o, x, y) {
    log.f32[o + 2] = x;
    log.f32[o + 3] = y;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @param {number} genomeId the genome that was in it
 * @returns {boolean} whether that genome is alive in the slot now
 */
function aliveIn(world, slot, genomeId) {
    return world.alive[slot] === 1 && world.genomeId[slot] === genomeId;
}

/**
 * The lineage of a genome that was in a slot: from the world while it is alive, else from the last tick's cache.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {number} genomeId the genome
 * @returns {number} the lineage id, 0 when unknown
 */
function lineageOf(log, world, slot, genomeId) {
    if (aliveIn(world, slot, genomeId)) {
        return world.lineageId[slot];
    }
    return log.cacheGenome[slot] === genomeId ? log.cacheLineage[slot] : 0;
}

/**
 * Emits MATED when pregnancyTicks is 1, where mating and birth occur on the same tick.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} o the event record offset
 * @param {Map<number, number> | undefined} slotOf genome id to slot map
 * @returns {void}
 */
function addMatedSingleTick(log, world, o, slotOf) {
    const d = world.events.data;
    const motherGenome = d[o + 6];
    const fatherGenome = d[o + 7];
    const motherSlot = slotOf?.get(motherGenome);
    let x;
    let y;
    let spec = d[o + 5];
    let lineage = d[o + 4];
    if (motherSlot !== undefined && aliveIn(world, motherSlot, motherGenome)) {
        x = world.x[motherSlot];
        y = world.y[motherSlot];
        spec = world.spec[motherSlot];
        lineage = world.lineageId[motherSlot];
    } else if (motherSlot !== undefined && log.cacheGenome[motherSlot] === motherGenome) {
        x = log.cacheX[motherSlot];
        y = log.cacheY[motherSlot];
        spec = log.cacheSpec[motherSlot];
        lineage = log.cacheLineage[motherSlot];
    } else {
        const childSlot = d[o + 2];
        x = world.x[childSlot];
        y = world.y[childSlot];
    }
    const m = begin(log, EFFECT_KIND.MATED, d[o + 1]);
    place(log, m, x, y);
    log.u32[m + 4] = motherGenome;
    log.u32[m + 5] = fatherGenome;
    log.u32[m + 6] = spec;
    log.u32[m + 7] = lineage;
}

/**
 * A newborn that is still alive yields `BORN`; one that was born and died within the tick yields nothing.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} o the event record offset
 * @param {Map<number, number> | undefined} slotOf genome id to slot map
 * @returns {void}
 */
function addBorn(log, world, o, slotOf) {
    const d = world.events.data;
    const slot = d[o + 2];
    if (aliveIn(world, slot, d[o + 3])) {
        const w = begin(log, EFFECT_KIND.BORN, d[o + 1]);
        place(log, w, world.x[slot], world.y[slot]);
        log.u32[w + 4] = d[o + 3];
        log.u32[w + 5] = d[o + 4];
        log.u32[w + 6] = d[o + 5];
        log.u32[w + 7] = d[o + 8];
    }
    if (world.config.pregnancyTicks === 1 && d[o + 8] === BORN_CAUSE.MATE) {
        addMatedSingleTick(log, world, o, slotOf);
    }
}

/**
 * A death yields `DIED` at the agent's place at the end of the previous tick; an agent the log never saw (born and
 * dead within one tick) yields nothing.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} o the event record offset
 * @returns {void}
 */
function addDied(log, world, o) {
    const d = world.events.data;
    const slot = d[o + 2];
    if (log.cacheGenome[slot] !== d[o + 3]) {
        return;
    }
    const w = begin(log, EFFECT_KIND.DIED, d[o + 1]);
    place(log, w, log.cacheX[slot], log.cacheY[slot]);
    const pack = d[o + 4] === DEATH_CAUSE.EATEN && d[o + 11] !== 0 ? PACK_FLAG : 0;
    log.u32[w + 4] = d[o + 3];
    log.u32[w + 5] = d[o + 5];
    log.u32[w + 6] = d[o + 6] + d[o + 4] * DEATH_CAUSE_SHIFT + pack;
    log.u32[w + 7] = d[o + 7];
}

/**
 * A call or a smoke release yields its effect at the caller's position in the record.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @param {number} o the event record offset
 * @returns {void}
 */
function addCall(log, world, o) {
    const d = world.events.data;
    const type = d[o];
    const slot = d[o + 2];
    const genomeId = d[o + 3];
    const kind = type === EVENT_TYPE.ALARM_CALLED ? EFFECT_KIND.ALARM : EFFECT_KIND.PACK_CALL;
    const smoke = type === EVENT_TYPE.SMOKE_RELEASED;
    const w = begin(log, smoke ? EFFECT_KIND.SMOKE : kind, d[o + 1]);
    place(log, w, d[o + 5], d[o + 6]);
    log.u32[w + 4] = genomeId;
    log.u32[w + 5] = 0;
    if (smoke) {
        const bitten = aliveIn(world, slot, genomeId) && world.bittenTimer[slot] < TIMER_CAP ? 1 : 0;
        log.u32[w + 6] = d[o + 4] + bitten * (1 << SPEC_SHIFT);
        log.u32[w + 7] = d[o + 7];
    } else {
        log.u32[w + 6] = d[o + 4];
        log.u32[w + 7] = lineageOf(log, world, slot, genomeId);
    }
}

/**
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world just stepped
 * @param {Map<number, number> | undefined} slotOf genome to slot map
 * @returns {void}
 */
function addEventEffects(log, world, slotOf) {
    const d = world.events.data;
    for (let i = 0; i < world.events.count; i++) {
        const o = i * EVENT_STRIDE;
        switch (d[o]) {
            case EVENT_TYPE.AGENT_BORN:
                addBorn(log, world, o, slotOf);
                break;
            case EVENT_TYPE.AGENT_DIED:
                addDied(log, world, o);
                break;
            case EVENT_TYPE.ALARM_CALLED:
            case EVENT_TYPE.PACK_CALLED:
            case EVENT_TYPE.SMOKE_RELEASED:
                addCall(log, world, o);
                break;
            default:
                break;
        }
    }
}

/**
 * Yields a `BITE` for each alive agent bitten this tick (`bittenTimer` 1), with `lastBiter` as the biter.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world just stepped
 * @param {Map<number, number>} slotOf genome id to slot for the agents alive at the end of the previous tick
 * @returns {void}
 */
function addBites(log, world, slotOf) {
    const { alive, bittenTimer, lastBiter, genomeId, lineageId, spec, x, y } = world;
    const tick = world.tick > 0 ? world.tick - 1 : 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && bittenTimer[slot] === BITTEN_THIS_TICK) {
            const biter = lastBiter[slot];
            const biterSlot = slotOf.get(biter);
            const biterSpec =
                biterSlot !== undefined && log.cacheGenome[biterSlot] === biter ? log.cacheSpec[biterSlot] : 0;
            const w = begin(log, EFFECT_KIND.BITE, tick);
            place(log, w, x[slot], y[slot]);
            log.u32[w + 4] = biter;
            log.u32[w + 5] = genomeId[slot];
            log.u32[w + 6] = biterSpec + spec[slot] * (1 << SPEC_SHIFT);
            log.u32[w + 7] = lineageId[slot];
        }
    }
}

/**
 * Adds a MATED effect for newly pregnant agents when pregnancyTicks > 1.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world just stepped
 * @returns {void}
 */
function addMatedPregnancies(log, world) {
    if ((world.config.pregnancyTicks ?? 0) <= 1) {
        return;
    }
    const { alive, pregnancy, fatherId, genomeId, lineageId, spec, x, y } = world;
    const targetPregnancy = world.config.pregnancyTicks - 1;
    const tick = world.tick > 0 ? world.tick - 1 : 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (
            alive[slot] === 1 &&
            pregnancy[slot] === targetPregnancy &&
            log.cacheGenome[slot] === genomeId[slot] &&
            log.cachePregnancy[slot] === 0
        ) {
            const w = begin(log, EFFECT_KIND.MATED, tick);
            place(log, w, x[slot], y[slot]);
            log.u32[w + 4] = genomeId[slot];
            log.u32[w + 5] = fatherId[slot];
            log.u32[w + 6] = spec[slot];
            log.u32[w + 7] = lineageId[slot];
        }
    }
}

/**
 * Remembers each alive slot's place, genome, lineage and specialisation for the next tick's deaths and bites.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world just stepped
 * @returns {void}
 */
function refreshCache(log, world) {
    const { alive, x, y, genomeId, lineageId, spec, pregnancy } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            log.cacheX[slot] = x[slot];
            log.cacheY[slot] = y[slot];
            log.cacheGenome[slot] = genomeId[slot];
            log.cacheLineage[slot] = lineageId[slot];
            log.cacheSpec[slot] = spec[slot];
            log.cachePregnancy[slot] = pregnancy ? pregnancy[slot] : 0;
        } else {
            log.cacheGenome[slot] = 0;
            log.cachePregnancy[slot] = 0;
        }
    }
}

/**
 * Caches the alive agents' places without yielding effects, for a world just created: its initial population is not
 * announced, but its first deaths and bites need their places and specialisations.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function primeEffects(log, world) {
    refreshCache(log, world);
}

/**
 * Turns the tick's events and the alive slots into effects: `BORN`, `DIED`, calls and smoke in record order, then a
 * `BITE` for each agent bitten this tick, then refreshes the position cache. Call it right after `step` and before the
 * observer sees the tick, so `slotOf` still holds the agents alive at the start of the tick.
 * @param {EffectLog} log the log
 * @param {Record<string, any>} world the world just stepped
 * @param {Map<number, number>} slotOf the observer's genome id to slot map
 * @returns {void}
 */
export function collectEffects(log, world, slotOf) {
    addEventEffects(log, world, slotOf);
    addBites(log, world, slotOf);
    addMatedPregnancies(log, world);
    refreshCache(log, world);
}

/**
 * Writes the pending effects, oldest first, into the effects part of a snapshot: a header of `count` and `dropped`,
 * then the records. Empties the log and resets `dropped`.
 * @param {EffectLog} log the log
 * @param {Uint32Array} u32 the snapshot's word view
 * @param {number} offset the word offset of the effects part
 * @returns {void}
 */
export function writeEffects(log, u32, offset) {
    u32[offset] = log.count;
    u32[offset + 1] = log.dropped;
    let w = offset + EFFECT_HEADER_WORDS;
    for (let i = 0; i < log.count; i++) {
        const from = ((log.start + i) % EFFECT_CAPACITY) * EFFECT_WORDS;
        for (let k = 0; k < EFFECT_WORDS; k++) {
            u32[w + k] = log.u32[from + k];
        }
        w += EFFECT_WORDS;
    }
    log.start = 0;
    log.count = 0;
    log.dropped = 0;
}
