import { describe, expect, it } from 'vitest';
import { rewardMetrics } from '../../js/evo/metrics-reward.js';
import { directionOf, namesOf } from './helpers/metric-registry.js';

describe('the reward event metrics', () => {
    it('reads the rewards per 1,000 hunter agent-ticks, by source', () => {
        const world = { rewardCounts: Float64Array.of(3, 10, 2) };
        const m = rewardMetrics({ combat: { hunterAgentTicks: 2000 } }, world);
        expect(m['eval.reward_events.kill'].value).toBe(1.5);
        expect(m['eval.reward_events.bite'].value).toBe(5);
        expect(m['eval.reward_events.scavenge'].value).toBe(1);
    });

    it('is null with a reason when no hunter lived', () => {
        const m = rewardMetrics({ combat: { hunterAgentTicks: 0 } }, { rewardCounts: new Float64Array(3) });
        expect(m['eval.reward_events.kill']).toEqual({ value: null, reason: 'no agent-ticks' });
    });

    it('names exactly the metrics it returns, all watch', () => {
        const m = rewardMetrics({ combat: { hunterAgentTicks: 1 } }, { rewardCounts: new Float64Array(3) });
        expect(Object.keys(m).sort()).toEqual(namesOf('js/evo/metrics-reward.js').sort());
        expect(new Set(namesOf('js/evo/metrics-reward.js').map(directionOf))).toEqual(new Set(['watch']));
    });
});
