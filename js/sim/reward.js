// Reward-gated learning (realistic-keepers.md, T5). An agent's `rewardTrace` rises by the energy of each meal it stores from
// meat (a kill, a bite or a carcass: the `meat` source). Nothing here changes the trace unless `rewardedHebb` is on; the
// per-source counts the eval reads rise in every arm.
//
// The trace is an agent row zeroed by `freeAgent` and allocated only with the switch on; the counts are derived and outside
// `worldHash`. Nothing here allocates per tick.

/** The reward sources, as `noteReward` takes them and as `rewardCounts` is indexed. */
export const REWARD_SOURCE = Object.freeze({ KILL: 0, BITE: 1, SCAVENGE: 2 });

/** The source names of `eval.reward_events.<source>`, in `REWARD_SOURCE` order. */
export const REWARD_NAMES = Object.freeze(['kill', 'bite', 'scavenge']);

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {[any, string, number][]} the allocation specs for the world's agent rows: the trace with `rewardedHebb`
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
 * Notes that `slot` stored `stored` energy from meat. The source's count rises whether or not `rewardedHebb` is on; with it on,
 * the trace gains `min(1, stored / foodEnergy)`, capped at 1. Calls with nothing stored are ignored.
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
    if (world.rewardTrace !== undefined) {
        const magnitude = Math.min(1, stored / world.config.foodEnergy);
        world.rewardTrace[slot] = Math.min(1, world.rewardTrace[slot] + magnitude);
    }
}

/**
 * The factor `hebbianStep` multiplies its rate by this tick: `rewardBase + rewardGain x trace`. The trace then decays by
 * `rewardDecay`.
 * @param {Record<string, any>} world the world, with `rewardedHebb` on
 * @param {number} slot the alive slot
 * @returns {number} the factor
 */
export function rewardScale(world, slot) {
    const { rewardBase, rewardGain, rewardDecay } = world.config;
    const trace = world.rewardTrace[slot];
    world.rewardTrace[slot] = trace * (1 - rewardDecay);
    return rewardBase + rewardGain * trace;
}
