import { describe, expect, it } from 'vitest';
import { REWARD_DIRECTIONS, rewardMetrics } from '../../js/evo/metrics-reward.js';

describe('the reward event metrics', () => {
    it('reads the rewards per 1,000 hunter agent-ticks, by source', () => {
        const world = { rewardCounts: Float64Array.of(3, 10, 2), rewardDropped: 4 };
        const m = rewardMetrics({ combat: { hunterAgentTicks: 2000 } }, world);
        expect(m['eval.reward_events.kill'].value).toBe(1.5);
        expect(m['eval.reward_events.bite'].value).toBe(5);
        expect(m['eval.reward_events.scavenge'].value).toBe(1);
        expect(m['eval.reward_events.shuffle_dropped'].value).toBe(2);
    });

    it('is null with a reason when no hunter lived', () => {
        const m = rewardMetrics(
            { combat: { hunterAgentTicks: 0 } },
            { rewardCounts: new Float64Array(3), rewardDropped: 0 },
        );
        expect(m['eval.reward_events.kill']).toEqual({ value: null, reason: 'no agent-ticks' });
    });

    it('names exactly the metrics it returns, all watch', () => {
        const m = rewardMetrics(
            { combat: { hunterAgentTicks: 1 } },
            { rewardCounts: new Float64Array(3), rewardDropped: 0 },
        );
        expect(Object.keys(m).sort()).toEqual(Object.keys(REWARD_DIRECTIONS).sort());
        expect(new Set(Object.values(REWARD_DIRECTIONS))).toEqual(new Set(['watch']));
    });
});
