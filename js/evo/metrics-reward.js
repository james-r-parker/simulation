// Reward events (realistic-keepers.md, T5): the rewards earned per 1,000 hunter agent-ticks by source. The sim counts them at
// the call to `noteReward` (`world.rewardCounts`), so the reading is the same in every
// arm. Both the counts and the hunter agent-ticks run from the first tick.

import { REWARD_NAMES } from '../sim/reward.js';
import { bySuffix, none, per1k } from './metrics-stats.js';

/**
 * @param {Record<string, any>} observer the observer (`combat.hunterAgentTicks`)
 * @param {Record<string, any>} world the world at the run's last tick
 * @returns {import('./metrics-stats.js').MetricRecord} the rewards earned per 1,000 hunter agent-ticks, by source
 */
export function rewardMetrics(observer, world) {
    const ticks = observer.combat.hunterAgentTicks;
    if (world.rewardCounts === undefined) {
        return bySuffix('eval.reward_events', REWARD_NAMES, () => none('no reward counts'));
    }
    return bySuffix('eval.reward_events', REWARD_NAMES, (i) => per1k(world.rewardCounts[i], ticks));
}
