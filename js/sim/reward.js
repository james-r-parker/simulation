// Reward-gated learning (hunter-learning.md, Phase 2). An agent's `rewardTrace` rises when it stores energy from a source the
// `rewardSource` option admits. Nothing here runs unless `rewardedHebb` is on, except the per-source counts the eval reads,
// which rise in every arm.
//
// The trace is an agent row zeroed by `freeAgent`; the counts are derived and outside `worldHash`. Nothing here allocates per
// tick.
//
// The shuffled-reward control (`rewardShuffle`) keeps each life's count and size of rewards but moves their time: a reward is
// queued (4 entries per slot) and delivered `rewardShuffleMin` to `rewardShuffleMax` ticks later, the delay drawn from the
// stream `reward-shuffle`, which nothing else draws from. A full queue drops the new reward; a death drops the queued ones.

import { EVENT_TYPE, pushEvent } from './events.js';
import { nextFloat } from './rng.js';

/** The reward sources, as `noteReward` takes them and as `rewardCounts` is indexed. */
export const REWARD_SOURCE = Object.freeze({ KILL: 0, BITE: 1, SCAVENGE: 2 });

/** The source names of `eval.reward_events.<source>`, in `REWARD_SOURCE` order. */
export const REWARD_NAMES = Object.freeze(['kill', 'bite', 'scavenge']);

/** Why a shuffled reward was dropped, in the `RewardShuffleDropped` record. */
export const DROP_CAUSE = Object.freeze({ QUEUE_FULL: 0, DEATH: 1 });

/** Entries in a slot's delivery queue. */
export const QUEUE_SIZE = 4;

/** The sources each `rewardSource` value admits, in `REWARD_SOURCE` order. */
/** @type {Readonly<Record<string, readonly number[]>>} */
const ADMITS = Object.freeze({ kill: [1, 0, 0], 'kill-bite': [1, 1, 0], meat: [1, 1, 1] });

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {[any, string, number][]} the allocation specs for the world's agent rows: the trace with `rewardedHebb`, and the
 *   delivery queue (due tick plus one, 0 for empty; magnitude) with `rewardShuffle` as well
 */
export function rewardSpecs(config) {
    if (!config.rewardedHebb) {
        return [];
    }
    /** @type {[any, string, number][]} */
    const specs = [[Float32Array, 'rewardTrace', 1]];
    if (config.rewardShuffle) {
        specs.push([Uint32Array, 'rewardDue', QUEUE_SIZE], [Float32Array, 'rewardMag', QUEUE_SIZE]);
    }
    return specs;
}

/**
 * Clears a slot's trace and queue; call it when the slot's genes are applied.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetReward(world, slot) {
    if (world.rewardTrace === undefined) {
        return;
    }
    world.rewardTrace[slot] = 0;
    if (world.rewardDue !== undefined) {
        world.rewardDue.fill(0, slot * QUEUE_SIZE, (slot + 1) * QUEUE_SIZE);
        world.rewardMag.fill(0, slot * QUEUE_SIZE, (slot + 1) * QUEUE_SIZE);
    }
}

/**
 * Pushes a `RewardShuffleDropped` record: fields 2 to 4 are the slot's genome id, the magnitude and a `DROP_CAUSE`.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot whose reward was dropped
 * @param {{magnitude: number, cause: number}} drop what was dropped, and why
 * @returns {void}
 */
function pushDropped(world, slot, { magnitude, cause }) {
    const o = pushEvent(world.events, EVENT_TYPE.REWARD_SHUFFLE_DROPPED, world.tick);
    const d = world.events.data;
    d[o + 2] = world.genomeId[slot];
    d[o + 3] = magnitude;
    d[o + 4] = cause;
    world.rewardDropped += 1;
}

/**
 * Queues a reward for later delivery, or drops it when the slot's queue is full.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @param {number} magnitude the reward
 * @returns {void}
 */
function enqueue(world, slot, magnitude) {
    const { rewardDue, rewardMag, config } = world;
    const base = slot * QUEUE_SIZE;
    for (let k = 0; k < QUEUE_SIZE; k++) {
        if (rewardDue[base + k] === 0) {
            const span = config.rewardShuffleMax - config.rewardShuffleMin + 1;
            const delay = config.rewardShuffleMin + Math.floor(nextFloat(world.rng['reward-shuffle']) * span);
            rewardDue[base + k] = world.tick + delay + 1;
            rewardMag[base + k] = magnitude;
            return;
        }
    }
    pushDropped(world, slot, { magnitude, cause: DROP_CAUSE.QUEUE_FULL });
}

/**
 * Notes that `slot` stored `stored` energy from a source. The source's count rises whether or not `rewardSource` admits it;
 * when it does (and `rewardedHebb` is on), the trace gains `min(1, stored / foodEnergy)`, capped at 1 (queued instead under
 * `rewardShuffle`). Calls with nothing
 * stored are ignored.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent that stored the energy
 * @param {number} source a `REWARD_SOURCE`
 * @param {number} stored the energy it stored
 * @returns {void}
 */
export function noteReward(world, slot, source, stored) {
    if (!(stored > 0)) {
        return;
    }
    world.rewardCounts[source] += 1;
    if (world.rewardTrace === undefined || ADMITS[world.config.rewardSource][source] === 0) {
        return;
    }
    const magnitude = Math.min(1, stored / world.config.foodEnergy);
    if (world.rewardDue === undefined) {
        world.rewardTrace[slot] = Math.min(1, world.rewardTrace[slot] + magnitude);
    } else {
        enqueue(world, slot, magnitude);
    }
}

/**
 * Drops a dying slot's queued rewards, counting each. Call it before the slot is freed.
 * @param {Record<string, any>} world the world
 * @param {number} slot the dying slot
 * @returns {void}
 */
export function dropQueuedRewards(world, slot) {
    if (world.rewardDue === undefined) {
        return;
    }
    const base = slot * QUEUE_SIZE;
    for (let k = 0; k < QUEUE_SIZE; k++) {
        if (world.rewardDue[base + k] !== 0) {
            pushDropped(world, slot, { magnitude: world.rewardMag[base + k], cause: DROP_CAUSE.DEATH });
        }
    }
}

/**
 * Delivers the queued rewards due this tick into the trace.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {void}
 */
function deliverDue(world, slot) {
    const { rewardDue, rewardMag, rewardTrace } = world;
    const base = slot * QUEUE_SIZE;
    for (let k = 0; k < QUEUE_SIZE; k++) {
        const due = rewardDue[base + k];
        if (due !== 0 && due - 1 <= world.tick) {
            rewardTrace[slot] = Math.min(1, rewardTrace[slot] + rewardMag[base + k]);
            rewardDue[base + k] = 0;
            rewardMag[base + k] = 0;
        }
    }
}

/**
 * The factor `hebbianStep` multiplies its rate by this tick: `rewardBase + rewardGain x trace`, after the due shuffled rewards
 * join the trace. The trace then decays by `rewardDecay`.
 * @param {Record<string, any>} world the world, with `rewardedHebb` on
 * @param {number} slot the alive slot
 * @returns {number} the factor
 */
export function rewardScale(world, slot) {
    const { rewardBase, rewardGain, rewardDecay } = world.config;
    if (world.rewardDue !== undefined) {
        deliverDue(world, slot);
    }
    const trace = world.rewardTrace[slot];
    world.rewardTrace[slot] = trace * (1 - rewardDecay);
    return rewardBase + rewardGain * trace;
}
