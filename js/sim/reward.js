// Reward-gated learning (hunter-learning.md, Phase 2). An agent's `rewardTrace` rises when it stores energy from a source the
// `rewardSource` option admits. Nothing here runs unless `rewardedHebb` is on, except the per-source counts the eval reads,
// which rise in every arm.
//
// The trace is an agent row zeroed by `freeAgent`; the counts are derived and outside `worldHash`. Nothing here allocates per
// tick.

/** The reward sources, as `noteReward` takes them and as `rewardCounts` is indexed. */
export const REWARD_SOURCE = Object.freeze({ KILL: 0, BITE: 1, SCAVENGE: 2 });

/** The source names of `eval.reward_events.<source>`, in `REWARD_SOURCE` order. */
export const REWARD_NAMES = Object.freeze(['kill', 'bite', 'scavenge']);

/** The sources each `rewardSource` value admits, in `REWARD_SOURCE` order. */
/** @type {Readonly<Record<string, readonly number[]>>} */
const ADMITS = Object.freeze({ kill: [1, 0, 0], 'kill-bite': [1, 1, 0], meat: [1, 1, 1] });

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {[any, string, number][]} the allocation specs for the world's agent rows: the trace, with `rewardedHebb`
 */
export function rewardSpecs(config) {
    return config.rewardedHebb ? [[Float32Array, 'rewardTrace', 1]] : [];
}

/**
 * Clears a slot's trace; call it when the slot's genes are applied.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetReward(world, slot) {
    if (world.rewardTrace !== undefined) {
        world.rewardTrace[slot] = 0;
    }
}

/**
 * Notes that `slot` stored `stored` energy from a source. The source's count rises whether or not `rewardSource` admits it;
 * when it does (and `rewardedHebb` is on), the trace gains `min(1, stored / foodEnergy)`, capped at 1. Calls with nothing
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
    if (world.rewardTrace !== undefined && ADMITS[world.config.rewardSource][source] === 1) {
        world.rewardTrace[slot] = Math.min(1, world.rewardTrace[slot] + stored / world.config.foodEnergy);
    }
}
