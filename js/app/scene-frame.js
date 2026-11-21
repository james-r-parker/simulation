// The scene signals that come from the frame, not from an effect (`scene-counters.js` counts them): a pursuit begun, a
// pursuit dropped without a bite (the abort), a refuge that prey stack into, and a blob that crosses the wall. Each
// reads the frame's agents and the renderer's pursuit table, like the drawing cues do, so it is a reading of what is on
// screen and not a sim fact. Preallocated: a frame allocates nothing, and the occupancy and crossing scans run every
// `CHECK_MS`, not every frame.

import { MAX_PURSUITS, pursuitRules } from './pursuit.js';

/** A pursuit that has been out of the table this long has ended, ms. */
export const ENDED_MS = 1500;
/** Milliseconds between the refuge and wall scans. */
export const CHECK_MS = 250;
/** Prey inside a refuge that make a stack, and the count it has to fall to before it can stack again. */
export const STACK_ENTER = 3;
export const STACK_LEAVE = 1;

/** What a frame signal reports, as the scene it counts for. */
export const FRAME_EVENT = Object.freeze({ CHASE: 0, ABORT: 1, REFUGE: 2, CROSS: 3 });

/**
 * @typedef {object} FrameSignals
 * @property {Uint32Array} epGenome the hunter of each tracked pursuit, 0 for a free slot
 * @property {Float64Array} epStartMs when it began, wall ms
 * @property {Float64Array} epLastMs when it was last in the table, wall ms
 * @property {Float64Array} epStartTick the sim tick it began
 * @property {Float64Array} epLastTick the sim tick it was last in the table
 * @property {Uint8Array} epBitten 1 once the hunter has bitten during it
 * @property {Uint8Array} epSeen scratch: 1 when this frame's table holds it
 * @property {{ticks: number, genome: number}} longest the longest pursuit of this world in sim ticks, with its hunter
 * @property {Uint8Array} canHunt 1 for the specs that hunt
 * @property {readonly {x: number, y: number, radius: number}[]} refuges the refuge discs
 * @property {Uint8Array} stacked 1 for a refuge that is stacked now
 * @property {number} wallX the wall's x, NaN when there is none
 * @property {Uint32Array} prevGenome the genome seen in each slot at the last scan
 * @property {Uint8Array} prevSide which side of the wall it was on
 * @property {number} lastCheckMs when the last scan ran
 */

/** @returns {FrameSignals} signals with nothing tracked */
export function createFrameSignals() {
    return {
        epGenome: new Uint32Array(MAX_PURSUITS),
        epStartMs: new Float64Array(MAX_PURSUITS),
        epLastMs: new Float64Array(MAX_PURSUITS),
        epStartTick: new Float64Array(MAX_PURSUITS),
        epLastTick: new Float64Array(MAX_PURSUITS),
        epBitten: new Uint8Array(MAX_PURSUITS),
        epSeen: new Uint8Array(MAX_PURSUITS),
        longest: { ticks: 0, genome: 0 },
        canHunt: new Uint8Array(0),
        refuges: [],
        stacked: new Uint8Array(0),
        wallX: NaN,
        prevGenome: new Uint32Array(0),
        prevSide: new Uint8Array(0),
        lastCheckMs: -Infinity,
    };
}

/**
 * Forgets everything for a new world and reads its terrain.
 * @param {FrameSignals} f the signals
 * @param {Record<string, any>} info `ready.info`
 * @returns {void}
 */
export function resetFrameSignals(f, info) {
    f.epGenome.fill(0);
    f.longest.ticks = 0;
    f.longest.genome = 0;
    f.canHunt = pursuitRules(info).canHunt;
    f.refuges = info.terrain?.refuges ?? [];
    f.stacked = new Uint8Array(f.refuges.length);
    f.wallX = info.terrain?.wallX ?? NaN;
    f.prevGenome = new Uint32Array(info.maxAgents ?? 0);
    f.prevSide = new Uint8Array(info.maxAgents ?? 0);
    f.lastCheckMs = -Infinity;
}

/**
 * @param {FrameSignals} f the signals
 * @param {number} genome the genome that bit
 * @returns {void} marks its pursuit, if tracked, as having bitten
 */
export function noteBite(f, genome) {
    for (let k = 0; k < MAX_PURSUITS; k++) {
        if (f.epGenome[k] === genome) {
            f.epBitten[k] = 1;
        }
    }
}

/**
 * @typedef {(event: number, genome: number, x: number, y: number) => void} Emit
 */

/**
 * @param {FrameSignals} f the signals
 * @param {number} genome a hunter
 * @returns {number} its tracked pursuit's slot, -1 when it has none
 */
function slotOfHunter(f, genome) {
    for (let k = 0; k < MAX_PURSUITS; k++) {
        if (f.epGenome[k] === genome) {
            return k;
        }
    }
    return -1;
}

/**
 * Starts a pursuit for each hunter new in the table and ends the ones that have been out of it for `ENDED_MS`: an
 * abort when the hunter never bit, and the record when it was the longest.
 * @param {FrameSignals} f the signals
 * @param {{agents: import('./interpolate.js').Interpolated, pursuits: {count: number, hunter: Int32Array},
 *   nowMs: number, tick: number}} frame the frame
 * @param {Emit} emit hears each begun and dropped pursuit
 * @returns {void}
 */
function trackPursuits(f, { agents, pursuits, nowMs, tick }, emit) {
    f.epSeen.fill(0);
    for (let p = 0; p < pursuits.count; p++) {
        const i = pursuits.hunter[p];
        const genome = agents.genomeId[i];
        let k = slotOfHunter(f, genome);
        if (k < 0) {
            k = slotOfHunter(f, 0);
            if (k < 0) {
                continue;
            }
            f.epGenome[k] = genome;
            f.epStartMs[k] = nowMs;
            f.epStartTick[k] = tick;
            f.epBitten[k] = 0;
            emit(FRAME_EVENT.CHASE, genome, agents.x[i], agents.y[i]);
        }
        f.epLastMs[k] = nowMs;
        f.epLastTick[k] = tick;
        f.epSeen[k] = 1;
    }
    for (let k = 0; k < MAX_PURSUITS; k++) {
        if (f.epGenome[k] !== 0 && f.epSeen[k] === 0 && nowMs - f.epLastMs[k] > ENDED_MS) {
            endPursuit(f, k, emit);
        }
    }
}

/**
 * @param {FrameSignals} f the signals
 * @param {number} k the pursuit's slot
 * @param {Emit} emit hears an abort
 * @returns {void}
 */
function endPursuit(f, k, emit) {
    const ticks = f.epLastTick[k] - f.epStartTick[k];
    if (ticks > f.longest.ticks) {
        f.longest.ticks = ticks;
        f.longest.genome = f.epGenome[k];
    }
    if (f.epBitten[k] === 0) {
        emit(FRAME_EVENT.ABORT, f.epGenome[k], NaN, NaN);
    }
    f.epGenome[k] = 0;
}

/**
 * Counts the prey inside each refuge and reports a refuge that has just stacked.
 * @param {FrameSignals} f the signals
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {Emit} emit hears each stack
 * @returns {void}
 */
function scanRefuges(f, agents, emit) {
    for (let r = 0; r < f.refuges.length; r++) {
        const disc = f.refuges[r];
        const r2 = disc.radius * disc.radius;
        let inside = 0;
        let first = 0;
        for (let i = 0; i < agents.count; i++) {
            const dx = agents.x[i] - disc.x;
            const dy = agents.y[i] - disc.y;
            if (dx * dx + dy * dy <= r2 && f.canHunt[agents.spec[i]] !== 1) {
                inside += 1;
                first = first === 0 ? agents.genomeId[i] : first;
            }
        }
        if (f.stacked[r] === 0 && inside >= STACK_ENTER) {
            f.stacked[r] = 1;
            emit(FRAME_EVENT.REFUGE, first, disc.x, disc.y);
        } else if (f.stacked[r] === 1 && inside <= STACK_LEAVE) {
            f.stacked[r] = 0;
        }
    }
}

/**
 * Reports each blob that is on the other side of the wall than at the last scan.
 * @param {FrameSignals} f the signals
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {Emit} emit hears each crossing
 * @returns {void}
 */
function scanCrossings(f, agents, emit) {
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        const genome = agents.genomeId[i];
        const side = agents.x[i] >= f.wallX ? 1 : 0;
        if (f.prevGenome[slot] === genome && f.prevSide[slot] !== side) {
            emit(FRAME_EVENT.CROSS, genome, agents.x[i], agents.y[i]);
        }
        f.prevGenome[slot] = genome;
        f.prevSide[slot] = side;
    }
}

/**
 * Reads one frame: the pursuits every frame, the refuges and the wall every `CHECK_MS`.
 * @param {FrameSignals} f the signals
 * @param {{agents: import('./interpolate.js').Interpolated, pursuits: {count: number, hunter: Int32Array} | null,
 *   nowMs: number, tick: number}} frame the frame's agents, the renderer's pursuit table (null before one), the wall
 *   clock and the newest sim tick
 * @param {Emit} emit hears each begun pursuit, abort, stack and crossing
 * @returns {void}
 */
export function noteSceneFrame(f, { agents, pursuits, nowMs, tick }, emit) {
    if (pursuits !== null) {
        trackPursuits(f, { agents, pursuits, nowMs, tick }, emit);
    }
    if (nowMs - f.lastCheckMs >= CHECK_MS) {
        f.lastCheckMs = nowMs;
        scanRefuges(f, agents, emit);
        if (Number.isFinite(f.wallX) && f.prevGenome.length > 0) {
            scanCrossings(f, agents, emit);
        }
    }
}
