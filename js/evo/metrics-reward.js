// Reward events (realistic-keepers.md, T5): the rewards earned per 1,000 hunter agent-ticks by source. The sim counts them at
// the call to `noteReward` (`world.rewardCounts`), whether or not `rewardedHebb` is on, so the reading is the same in every
// arm. Both the counts and the hunter agent-ticks run from the first tick.

import { REWARD_NAMES } from '../sim/reward.js';
import { none, per1k } from './metrics-stats.js';

/** The direction of each metric of this module. */
/** @type {Readonly<Record<string, string>>} */
export const REWARD_DIRECTIONS = Object.freeze(
    Object.fromEntries(REWARD_NAMES.map((name) => [`eval.reward_events.${name}`, 'watch'])),
);

/**
 * @param {Record<string, any>} observer the observer (`combat.hunterAgentTicks`)
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {Record<string, import('./metrics-stats.js').MetricResult>} the rewards earned per 1,000 hunter agent-ticks, by source
 */
export function rewardMetrics(observer, world) {
    const ticks = observer.combat.hunterAgentTicks;
    if (world.rewardCounts === undefined) {
        return Object.fromEntries(REWARD_NAMES.map((name) => [`eval.reward_events.${name}`, none('no reward counts')]));
    }
    return Object.fromEntries(
        REWARD_NAMES.map((name, i) => [`eval.reward_events.${name}`, per1k(world.rewardCounts[i], ticks)]),
    );
}
