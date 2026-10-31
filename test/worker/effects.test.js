import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, clearEvents, pushEvent } from '../../js/sim/events.js';
import { TIMER_CAP } from '../../js/sim/world.js';
import {
    EFFECT_CAPACITY,
    EFFECT_HEADER_WORDS,
    EFFECT_KIND,
    EFFECT_WORDS,
    collectEffects,
    createEffectLog,
    primeEffects,
    writeEffects,
} from '../../js/worker/effects.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * Puts an alive agent in a slot by hand.
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} slot the slot
 * @param {Record<string, number>} fields world arrays to set, by name
 * @returns {void}
 */
function place(world, slot, fields) {
    world.alive[slot] = 1;
    for (const [name, value] of Object.entries(fields)) {
        world[name][slot] = value;
    }
}

/**
 * Pushes an event record with its fields from offset 2.
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} type an `EVENT_TYPE`
 * @param {number[]} fields the record's fields 2 and up
 * @returns {void}
 */
function event(world, type, fields) {
    const o = pushEvent(world.events, type, world.tick);
    fields.forEach((value, i) => {
        world.events.data[o + 2 + i] = value;
    });
}

/**
 * Writes the log and reads it back.
 * @param {ReturnType<typeof createEffectLog>} log the log
 * @returns {{count: number, dropped: number, records: number[][], floats: number[][]}} the header and each record's
 *   words as integers and as floats
 */
function drain(log) {
    const u32 = new Uint32Array(2 + EFFECT_CAPACITY * EFFECT_WORDS);
    writeEffects(log, u32, 0);
    const f32 = new Float32Array(u32.buffer);
    const records = [];
    const floats = [];
    for (let i = 0; i < u32[0]; i++) {
        const w = EFFECT_HEADER_WORDS + i * EFFECT_WORDS;
        records.push(Array.from(u32.subarray(w, w + EFFECT_WORDS)));
        floats.push(Array.from(f32.subarray(w, w + EFFECT_WORDS)));
    }
    return { count: u32[0], dropped: u32[1], records, floats };
}

/** The tick's collect with the observer's map empty unless given. */
const NO_SLOTS = new Map();

describe('collectEffects', () => {
    it('yields BORN at the newborn with its genome, lineage, spec and cause', () => {
        const world = smallWorld();
        world.tick = 8;
        place(world, 2, { x: 30, y: 40, genomeId: 11, lineageId: 5, spec: 3 });
        event(world, EVENT_TYPE.AGENT_BORN, [2, 11, 5, 3, 7, 8, BORN_CAUSE.MATE]);
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        const { records, floats } = drain(log);
        expect(records).toEqual([
            [EFFECT_KIND.BORN, 8, expect.anything(), expect.anything(), 11, 5, 3, BORN_CAUSE.MATE],
        ]);
        expect(floats[0].slice(2, 4)).toEqual([30, 40]);
    });

    it('yields nothing for an agent born and dead within the tick', () => {
        const world = smallWorld();
        event(world, EVENT_TYPE.AGENT_BORN, [2, 11, 5, 3, 7, 8, BORN_CAUSE.MATE]);
        event(world, EVENT_TYPE.AGENT_DIED, [2, 11, DEATH_CAUSE.STARVED, 0, 3, 5]);
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).count).toBe(0);
    });

    it('yields DIED at the place cached from the previous tick, since the dead agent carries none', () => {
        const world = smallWorld();
        place(world, 1, { x: 100, y: 200, genomeId: 21, lineageId: 6, spec: 1 });
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        world.tick = 1;
        world.alive[1] = 0;
        world.x[1] = 0;
        event(world, EVENT_TYPE.AGENT_DIED, [1, 21, DEATH_CAUSE.OLD_AGE, 0, 1, 6]);
        collectEffects(log, world, NO_SLOTS);
        const { records, floats } = drain(log);
        expect(records[0].filter((_, i) => i !== 2 && i !== 3)).toEqual([
            EFFECT_KIND.DIED,
            1,
            21,
            0,
            1 + DEATH_CAUSE.OLD_AGE * 256,
            6,
        ]);
        expect(floats[0].slice(2, 4)).toEqual([100, 200]);
    });

    it('sets the pack bit of a DIED only for an eaten agent whose second-last biter is recorded', () => {
        const world = smallWorld();
        place(world, 1, { genomeId: 21, lineageId: 6, spec: 0 });
        place(world, 2, { genomeId: 22, lineageId: 6, spec: 0 });
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        world.alive[1] = 0;
        world.alive[2] = 0;
        event(world, EVENT_TYPE.AGENT_DIED, [1, 21, DEATH_CAUSE.EATEN, 99, 0, 6, 0, 0, 0, 55]);
        event(world, EVENT_TYPE.AGENT_DIED, [2, 22, DEATH_CAUSE.STARVED, 0, 0, 6, 0, 0, 0, 55]);
        collectEffects(log, world, NO_SLOTS);
        const { records } = drain(log);
        expect(records[0][6]).toBe(DEATH_CAUSE.EATEN * 256 + 65536);
        expect(records[0][5]).toBe(99);
        expect(records[1][6]).toBe(DEATH_CAUSE.STARVED * 256);
    });

    it('yields BITE for an agent whose bittenTimer is 1, with lastBiter as the biter', () => {
        const world = smallWorld();
        place(world, 0, { genomeId: 30, lineageId: 2, spec: 1, bittenTimer: TIMER_CAP });
        place(world, 3, { x: 5, y: 6, genomeId: 31, lineageId: 4, spec: 2, bittenTimer: TIMER_CAP });
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        world.tick = 4;
        world.bittenTimer[3] = 1;
        world.lastBiter[3] = 30;
        collectEffects(log, world, new Map([[30, 0]]));
        const { records, floats } = drain(log);
        expect(records).toEqual([[EFFECT_KIND.BITE, 3, expect.anything(), expect.anything(), 30, 31, 1 + 2 * 256, 4]]);
        expect(floats[0].slice(2, 4)).toEqual([5, 6]);
    });

    it('yields no BITE for a bittenTimer other than 1, and a biter unknown to the map has spec 0', () => {
        const world = smallWorld();
        place(world, 0, { genomeId: 30, bittenTimer: 2 });
        place(world, 1, { genomeId: 31, bittenTimer: 1, lastBiter: 77, spec: 2 });
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        const { records } = drain(log);
        expect(records).toHaveLength(1);
        expect(records[0][6]).toBe(2 * 256);
    });

    it('yields ALARM, PACK_CALL and SMOKE at the caller position with the was-bitten bit', () => {
        const world = smallWorld();
        place(world, 0, { genomeId: 40, lineageId: 9, spec: 3, bittenTimer: TIMER_CAP });
        place(world, 1, { genomeId: 41, lineageId: 9, spec: 1, bittenTimer: 4 });
        event(world, EVENT_TYPE.ALARM_CALLED, [0, 40, 3, 10, 11]);
        event(world, EVENT_TYPE.PACK_CALLED, [1, 41, 1, 12, 13]);
        event(world, EVENT_TYPE.SMOKE_RELEASED, [1, 41, 1, 14, 15, 6]);
        event(world, EVENT_TYPE.SMOKE_RELEASED, [0, 40, 3, 16, 17, 7]);
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        const { records, floats } = drain(log);
        const words = records.map((r) => [r[0], r[4], r[5], r[6], r[7]]);
        expect(words).toEqual([
            [EFFECT_KIND.ALARM, 40, 0, 3, 9],
            [EFFECT_KIND.PACK_CALL, 41, 0, 1, 9],
            [EFFECT_KIND.SMOKE, 41, 0, 1 + 256, 6],
            [EFFECT_KIND.SMOKE, 40, 0, 3, 7],
        ]);
        expect(floats.map((f) => f.slice(2, 4))).toEqual([
            [10, 11],
            [12, 13],
            [14, 15],
            [16, 17],
        ]);
    });

    it("keeps a dead caller's cached lineage and uses zero for an unknown caller", () => {
        const world = smallWorld();
        place(world, 1, { genomeId: 21, lineageId: 6, spec: 1 });
        const log = createEffectLog(world.config.maxAgents);
        primeEffects(log, world);
        world.alive[1] = 0;
        event(world, EVENT_TYPE.ALARM_CALLED, [1, 21, 1, 100, 200]);
        event(world, EVENT_TYPE.ALARM_CALLED, [1, 99, 1, 100, 200]);
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).records.map((r) => r[7])).toEqual([6, 0]);
    });

    it('ignores the event types that have no effect', () => {
        const world = smallWorld();
        event(world, EVENT_TYPE.BIRTH_BLOCKED, [0, 0]);
        event(world, EVENT_TYPE.POPULATION_FLOOR, [3]);
        event(world, EVENT_TYPE.SMOKE_REFUSED, [0, 5]);
        const log = createEffectLog(world.config.maxAgents);
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).count).toBe(0);
    });

    it('yields MATED once per mating with pregnancyTicks > 1, and ignores pregnancy held at 1', () => {
        const world = smallWorld({ pregnancyTicks: 5 });
        place(world, 1, { x: 50, y: 60, genomeId: 10, lineageId: 3, spec: 2 });
        const log = createEffectLog(world.config.maxAgents);
        primeEffects(log, world);

        world.tick = 2;
        world.pregnancy[1] = 4;
        world.fatherId[1] = 99;
        collectEffects(log, world, NO_SLOTS);
        const { records, floats } = drain(log);
        expect(records).toEqual([[EFFECT_KIND.MATED, 1, expect.anything(), expect.anything(), 10, 99, 2, 3]]);
        expect(floats[0].slice(2, 4)).toEqual([50, 60]);

        world.tick = 3;
        world.pregnancy[1] = 3;
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).count).toBe(0);

        world.tick = 4;
        world.pregnancy[1] = 1;
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).count).toBe(0);

        world.tick = 5;
        world.pregnancy[1] = 1;
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).count).toBe(0);
    });

    it('places a single-tick MATED at the cached mother when she died the same tick, else at the child', () => {
        for (const mode of ['cached', 'child']) {
            const world = smallWorld({ pregnancyTicks: 1 });
            world.tick = 4;
            place(world, 1, { x: 50, y: 60, genomeId: 10, lineageId: 3, spec: 2 });
            place(world, 2, { x: 52, y: 62, genomeId: 20, lineageId: 3, spec: 2 });
            const log = createEffectLog(world.config.maxAgents);
            primeEffects(log, world);
            event(world, EVENT_TYPE.AGENT_BORN, [2, 20, 3, 2, 10, 99, BORN_CAUSE.MATE]);
            const slotOf = new Map(mode === 'cached' ? [[10, 1]] : []);
            if (mode === 'cached') {
                world.alive[1] = 0;
            }
            collectEffects(log, world, slotOf);
            const { records, floats } = drain(log);
            const mated = records.findIndex((r) => r[0] === EFFECT_KIND.MATED);
            expect(mated).toBeGreaterThanOrEqual(0);
            expect(floats[mated].slice(2, 4)).toEqual(mode === 'cached' ? [50, 60] : [52, 62]);
        }
    });

    it('yields MATED from AGENT_BORN when pregnancyTicks is 1', () => {
        const world = smallWorld({ pregnancyTicks: 1 });
        world.tick = 4;
        place(world, 1, { x: 50, y: 60, genomeId: 10, lineageId: 3, spec: 2 });
        place(world, 2, { x: 52, y: 62, genomeId: 20, lineageId: 3, spec: 2 });
        const slotOf = new Map([
            [10, 1],
            [99, 3],
        ]);
        event(world, EVENT_TYPE.AGENT_BORN, [2, 20, 3, 2, 10, 99, BORN_CAUSE.MATE]);
        const log = createEffectLog(world.config.maxAgents);
        primeEffects(log, world);
        collectEffects(log, world, slotOf);
        const { records } = drain(log);
        expect(records).toContainEqual([EFFECT_KIND.MATED, 4, expect.anything(), expect.anything(), 10, 99, 2, 3]);
    });
});

describe('primeEffects', () => {
    it('caches the alive places without yielding effects, so a first-tick death has a place', () => {
        const world = smallWorld();
        place(world, 1, { x: 7, y: 8, genomeId: 21, lineageId: 6, spec: 1 });
        event(world, EVENT_TYPE.AGENT_BORN, [1, 21, 6, 1, 0, 0, BORN_CAUSE.INITIAL]);
        const log = createEffectLog(world.config.maxAgents);
        primeEffects(log, world);
        expect(drain(log).count).toBe(0);
        clearEvents(world.events);
        world.alive[1] = 0;
        event(world, EVENT_TYPE.AGENT_DIED, [1, 21, DEATH_CAUSE.STARVED, 0, 1, 6]);
        collectEffects(log, world, NO_SLOTS);
        expect(drain(log).floats[0].slice(2, 4)).toEqual([7, 8]);
    });
});

describe('the effect log', () => {
    /**
     * @param {number} births how many BORN events to push, tick-numbered by genome id
     * @returns {{world: ReturnType<typeof smallWorld>, log: ReturnType<typeof createEffectLog>}} a log after one
     *   collect of that many events
     */
    function collectBirths(births) {
        const world = smallWorld({ eventCapacity: 6 * 8 });
        const log = createEffectLog(world.config.maxAgents);
        let genome = 1;
        for (let n = 0; n < births; n++) {
            clearEvents(world.events);
            place(world, 0, { genomeId: genome, x: genome });
            event(world, EVENT_TYPE.AGENT_BORN, [0, genome, 1, 0, 0, 0, BORN_CAUSE.FLOOR]);
            collectEffects(log, world, NO_SLOTS);
            genome += 1;
        }
        return { world, log };
    }

    it('drops the oldest records when full and counts them in the header', () => {
        const { log } = collectBirths(EFFECT_CAPACITY + 5);
        const { count, dropped, records } = drain(log);
        expect(count).toBe(EFFECT_CAPACITY);
        expect(dropped).toBe(5);
        expect(records[0][4]).toBe(6);
        expect(records[EFFECT_CAPACITY - 1][4]).toBe(EFFECT_CAPACITY + 5);
    });

    it('clears after a write, so the next write is empty with nothing dropped', () => {
        const { log } = collectBirths(EFFECT_CAPACITY + 1);
        drain(log);
        expect(drain(log)).toMatchObject({ count: 0, dropped: 0 });
    });

    it('writes at the offset it is given', () => {
        const { log } = collectBirths(2);
        const u32 = new Uint32Array(40);
        writeEffects(log, u32, 10);
        expect(Array.from(u32.subarray(10, 12))).toEqual([2, 0]);
        expect(u32[12]).toBe(EFFECT_KIND.BORN);
        expect(u32[0]).toBe(0);
    });
});
