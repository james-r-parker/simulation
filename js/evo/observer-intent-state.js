// The intent state's constants, per-slot arrays, run totals and slot reset. `observer-intent.js` updates it each
// tick; see docs/designs/world-balance.md (Intent state, Intent counters).

import { hunterTable } from './hunter-table.js';
import { createHuntCalls } from './observer-intent-calls.js';
import { SCAN_SIZE } from './ray-summary.js';

/** Ticks a sighting stays current. */
export const INTENT_WINDOW = 30;

/** Ticks of closing history read. */
export const CLOSING_BITS = 10;

/** Of those ticks, how many must show the nearest target's proximity rising. */
export const CLOSING_MIN = 6;

/** Ticks after the first bite of an episode in which a response still counts. */
export const RESPONSE_WINDOW = 30;

/** Proximity of a bigger-class hit that makes an agent threatened for the grouping sample. */
export const THREAT_PROXIMITY = 0.5;

/** Ticks between grouping samples. */
export const GROUP_SAMPLE_TICKS = 10;

/** A tick counts as closing on a target when the agent's speed towards it exceeds this share of `maxVelocity`. */
export const CLOSING_SPEED = 0.25;

/** The response share, over the unthreatened share, that an episode needs to count as responded. */
export const RESPONSE_LIFT = 0.25;

/** Unthreatened ticks needed before the unthreatened response share is used; below it the share is 0. */
export const CALM_MIN_TICKS = 30;

/** An output above this counts as sprinting, calling, releasing smoke or biting for the response. */
export const SIGNAL_LEVEL = 0.5;

const NEVER = -Infinity;

/** Per-slot arrays as `[type, value a reset slot holds]`; the counters are the last nine. */
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
    threatSide: [Int8Array, 0],
    threatArc: [Uint8Array, 0],
    thrTicks: [Uint32Array, 0],
    thrResp: [Uint32Array, 0],
    calmTicks: [Uint32Array, 0],
    calmResp: [Uint32Array, 0],
    threatProx: [Float32Array, 0],
    foodMark: [Float64Array, 0],
    biteMark: [Float64Array, 0],
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
    'huntCalls',
    'huntCallsPrecise',
    'smokes',
    'smokesPrecise',
    'idleSignals',
    'episodesClassified',
    'undefendedEpisodes',
    'unseenEpisodes',
];

/**
 * The arc rays: ray `k` points `2 pi k / rayCount` from the heading, and is an arc ray when that angle, wrapped to
 * -PI..PI, is within `biteArc + 1e-9` of 0; every ray is one when `biteArc` is at least PI.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Uint8Array} 1 for each arc ray
 */
export function arcRays(config) {
    const arc = new Uint8Array(config.rayCount);
    for (let k = 0; k < config.rayCount; k++) {
        let angle = (2 * Math.PI * k) / config.rayCount;
        angle = angle > Math.PI ? angle - 2 * Math.PI : angle;
        arc[k] = config.biteArc >= Math.PI || Math.abs(angle) <= config.biteArc + 1e-9 ? 1 : 0;
    }
    return arc;
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
        hunters: new Int32Array(config.maxAgents),
        hunterCount: 0,
        calls: createHuntCalls(),
        run: Object.fromEntries(RUN_TOTALS.map((name) => [name, 0])),
        packWindow: config.packWindow,
        callRadius: config.callRadius,
    };
    for (const [name, [Type, value]] of Object.entries(SLOT_FIELDS)) {
        intent[name] = new /** @type {any} */ (Type)(config.maxAgents).fill(value);
    }
    return intent;
}

/**
 * Clears a slot's intent state and counters, for a newborn or a reused slot.
 * @param {Record<string, any>} intent the intent state
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetIntentSlot(intent, slot) {
    for (let i = 0; i < SLOT_NAMES.length; i++) {
        intent[SLOT_NAMES[i]][slot] = SLOT_RESETS[i];
    }
}
