// The intent state's constants, per-slot arrays, run totals and slot reset. `observer-intent.js` updates it each
// tick; see docs/designs/world-balance.md (Intent state, Intent counters).

import { hunterTable } from './hunter-table.js';
import { ALARM_MATCH_CAP, createAlarmQueue } from './observer-intent-alarms.js';
import { createHuntCalls } from './observer-intent-calls.js';
import {
    arcRays,
    CLOSING_BITS,
    CLOSING_MIN,
    CLOSING_SPEED,
    FLEE_SPEED,
    INTENT_WINDOW,
    RESPONSE_WINDOW,
} from '../sim/merit-state.js';
import { SCAN, SCAN_SIZE } from './ray-summary.js';

// These constants and `arcRays` live in the sim's merit tracker, which ports this state's target tracking exactly.
export { arcRays, CLOSING_BITS, CLOSING_MIN, CLOSING_SPEED, FLEE_SPEED, INTENT_WINDOW, RESPONSE_WINDOW };

/** Proximity of a channel-2 ("can bite me") hit that makes an agent threatened for the grouping sample. */
export const THREAT_PROXIMITY = 0.5;

/** Ticks between grouping samples. */
export const GROUP_SAMPLE_TICKS = 10;

/** The response share, over the unthreatened share, that an episode needs to count as responded. */
export const RESPONSE_LIFT = 0.25;

/** Unthreatened ticks needed before the unthreatened response share is used; below it the share is 0. */
export const CALM_MIN_TICKS = 30;

/** An output above this counts as sprinting, calling, releasing smoke or biting for the response. */
export const SIGNAL_LEVEL = 0.5;

/** A heard alarm louder than this (body input `alarmLoud`) makes an agent threatened for the flee sample. */
export const ALARM_HEARD_LEVEL = 0.2;

const NEVER = -Infinity;

/** Per-slot arrays as `[type, value a reset slot holds]`; the counters are the last sixteen. */
const SLOT_FIELDS = {
    lastFood: [Float64Array, NEVER],
    lastPrey: [Float64Array, NEVER],
    lastThreat: [Float64Array, NEVER],
    lastResponse: [Float64Array, NEVER],
    foodBits: [Uint16Array, 0],
    preyBits: [Uint16Array, 0],
    foodTurn: [Float64Array, NEVER],
    preyTurn: [Float64Array, NEVER],
    foodOff: [Float64Array, NEVER],
    preyOff: [Float64Array, NEVER],
    foodStart: [Float64Array, NEVER],
    preyStart: [Float64Array, NEVER],
    foodProx: [Float64Array, -1],
    preyProx: [Float64Array, -1],
    threatSide: [Int8Array, 0],
    threatArc: [Uint8Array, 0],
    thrTicks: [Uint32Array, 0],
    thrResp: [Uint32Array, 0],
    calmTicks: [Uint32Array, 0],
    calmResp: [Uint32Array, 0],
    threatProx: [Float32Array, 0],
    foodMark: [Float64Array, 0],
    biteMark: [Float64Array, 0],
    aliveTicks: [Uint32Array, 0],
    threatCueTicks: [Uint32Array, 0],
    preyCueTicks: [Uint32Array, 0],
    alarmCalls: [Uint32Array, 0],
    huntCallCount: [Uint32Array, 0],
    biterId: [Uint32Array, 0],
    lastBiteDeliberate: [Uint8Array, 0],
    prevBiteDeliberate: [Uint8Array, 0],
    heardCall: [Uint32Array, 0],
    episodeOpen: [Uint8Array, 0],
    episodeClassified: [Uint8Array, 0],
    episodeFirst: [Float64Array, 0],
    threatAtFirst: [Uint8Array, 0],
    responded: [Uint8Array, 0],
    deliberateFood: [Float64Array, 0],
    chanceFood: [Float64Array, 0],
    deliberateBite: [Float64Array, 0],
    chanceBite: [Float64Array, 0],
    respondedEscape: [Uint32Array, 0],
    preciseSignal: [Uint32Array, 0],
    idleSignal: [Uint32Array, 0],
    undefendedBite: [Uint32Array, 0],
    unseenBite: [Uint32Array, 0],
    deliberateKills: [Uint32Array, 0],
    convergedKills: [Uint32Array, 0],
    alarmCredits: [Uint32Array, 0],
    huntCredits: [Uint32Array, 0],
    threatSamples: [Uint32Array, 0],
    fleeSamples: [Uint32Array, 0],
    alarmMatches: [Uint8Array, 0],
};

const SLOT_NAMES = Object.keys(SLOT_FIELDS);
const SLOT_RESETS = Object.values(SLOT_FIELDS).map(([, value]) => value);

/** Run-wide totals the metrics read; the per-slot counters die with their slot. */
const RUN_TOTALS = [
    'foodDeliberate',
    'foodChance',
    'huntBiteDeliberate',
    'huntBiteChance',
    'huntKillsDeliberate',
    'packKillsConvergent',
    'escapedResponded',
    'groupThreatSum',
    'groupThreatN',
    'groupCalmSum',
    'groupCalmN',
    'alarms',
    'alarmsPrecise',
    'alarmsBase',
    'kinNearSum',
    'huntCalls',
    'huntCallsPrecise',
    'huntCallsBase',
    'smokes',
    'smokesPrecise',
    'idleSignals',
    'episodesClassified',
    'undefendedEpisodes',
    'unseenEpisodes',
];

/**
 * What `trackTarget` and `isDeliberate` need about one kind of target, as direct references: its state arrays (the
 * same arrays the intent state holds under their names) and its scan offsets. Named loads on one shape stay
 * monomorphic where a keyed load by a name string did not.
 * @param {Record<string, any>} intent the intent state with its slot arrays
 * @param {boolean} food true for food, false for prey
 * @returns {Record<string, any>} the target view
 */
function targetView(intent, food) {
    return {
        bits: food ? intent.foodBits : intent.preyBits,
        seen: food ? intent.lastFood : intent.lastPrey,
        turn: food ? intent.foodTurn : intent.preyTurn,
        off: food ? intent.foodOff : intent.preyOff,
        start: food ? intent.foodStart : intent.preyStart,
        prox: food ? intent.foodProx : intent.preyProx,
        at: food ? SCAN.FOOD : SCAN.PREY,
        clears: food,
        ambush: !food,
    };
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} a fresh intent state: every slot reset, every run total 0
 */
export function createIntentState(config) {
    /** @type {Record<string, any>} */
    const intent = {
        arc: arcRays(config),
        hunterSpec: hunterTable(config),
        scan: new Float64Array(SCAN_SIZE),
        groupKeys: new Float64Array(config.maxAgents + 1).fill(Infinity),
        groupKin: new Int32Array(config.maxAgents),
        calls: createHuntCalls(),
        alarmQueue: createAlarmQueue(),
        alarmMatchSlot: new Int32Array(config.maxAgents * ALARM_MATCH_CAP),
        alarmMatchId: new Uint32Array(config.maxAgents * ALARM_MATCH_CAP),
        run: Object.fromEntries(RUN_TOTALS.map((name) => [name, 0])),
        packWindow: config.packWindow,
        callRadius: config.callRadius,
    };
    for (const [name, [Type, value]] of Object.entries(SLOT_FIELDS)) {
        intent[name] = new /** @type {any} */ (Type)(config.maxAgents).fill(value);
    }
    intent.food = targetView(intent, true);
    intent.prey = targetView(intent, false);
    // The keyed stores above leave the object in dictionary mode; the spread is a fast copy (world-balance T63).
    return { ...intent };
}

/**
 * Adds one slot's calls, each weighted by the caller's own base rate (its share of alive ticks with the cue current),
 * to `bases`: the alarm calls times the threat share, then the hunt calls times the prey share.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the slot
 * @param {number[]} bases `[alarm, hunt]` sums
 * @returns {void}
 */
function addCallBases(intent, slot, bases) {
    const alive = intent.aliveTicks[slot];
    if (alive > 0) {
        bases[0] += (intent.alarmCalls[slot] * intent.threatCueTicks[slot]) / alive;
        bases[1] += (intent.huntCallCount[slot] * intent.preyCueTicks[slot]) / alive;
    }
}

/**
 * Moves a slot's call base sums into the run totals before the slot is cleared.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the slot
 * @returns {void}
 */
function flushCallBases(intent, slot) {
    const bases = [0, 0];
    addCallBases(intent, slot, bases);
    intent.run.alarmsBase += bases[0];
    intent.run.huntCallsBase += bases[1];
}

/**
 * @param {Record<string, any>} intent the intent state
 * @returns {{alarm: number, hunt: number}} the call base sums over the run: finished slots and every slot now
 */
export function callBases(intent) {
    const bases = [intent.run.alarmsBase, intent.run.huntCallsBase];
    for (let slot = 0; slot < intent.aliveTicks.length; slot++) {
        addCallBases(intent, slot, bases);
    }
    return { alarm: bases[0], hunt: bases[1] };
}

/**
 * Clears a slot's intent state and counters, for a newborn or a reused slot.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetIntentSlot(intent, slot) {
    flushCallBases(intent, slot);
    for (let i = 0; i < SLOT_NAMES.length; i++) {
        intent[SLOT_NAMES[i]][slot] = SLOT_RESETS[i];
    }
}
