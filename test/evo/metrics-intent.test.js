import { describe, expect, it } from 'vitest';
import { metricDirection } from '../../js/evo/compare.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { intentMetrics } from '../../js/evo/metrics-intent.js';
import { bareObserver, EMPTY_WORLD } from './helpers/metrics-observer.js';

const NAMES = [
    'eval.deliberate_food_share',
    'eval.deliberate_food_per_1k',
    'eval.chance_food_per_1k',
    'eval.pursuit_bite_share',
    'eval.pursuit_kill_share',
    'eval.pack_convergence',
    'eval.hunt_call_answer',
    'eval.evasion_skill',
    'eval.group_cohesion_under_threat',
    'eval.alarm_precision',
    'eval.hunt_call_precision',
    'eval.smoke_precision',
    'eval.idle_signals_per_1k',
    'eval.undefended_bite_share',
    'eval.unseen_bite_share',
];

const REASONS = {
    'eval.deliberate_food_share': 'no food eaten',
    'eval.deliberate_food_per_1k': 'no agent-ticks',
    'eval.chance_food_per_1k': 'no agent-ticks',
    'eval.pursuit_bite_share': 'no bite energy gained by hunters',
    'eval.pursuit_kill_share': 'no hunter kill',
    'eval.pack_convergence': 'no pack kill',
    'eval.hunt_call_answer': 'no resolved hunt call',
    'eval.evasion_skill': 'no escaped bite episode',
    'eval.group_cohesion_under_threat': 'no threatened agent in a grouping sample',
    'eval.alarm_precision': 'no alarm call',
    'eval.hunt_call_precision': 'no hunt call',
    'eval.smoke_precision': 'no smoke release',
    'eval.idle_signals_per_1k': 'no agent-ticks',
    'eval.undefended_bite_share': 'no classified bite episode',
    'eval.unseen_bite_share': 'no classified bite episode',
};

describe('intentMetrics', () => {
    it('is null with its reason for every metric on an empty observer', () => {
        const m = intentMetrics(bareObserver());
        expect(Object.keys(m)).toEqual(NAMES);
        for (const name of NAMES) {
            expect(m[name], name).toEqual({ value: null, reason: REASONS[/** @type {keyof typeof REASONS} */ (name)] });
        }
    });

    it('computes every metric from the run totals and the combat counters', () => {
        const o = bareObserver();
        o.agentTicks = 4000;
        Object.assign(o.intent.run, {
            foodDeliberate: 30,
            foodChance: 10,
            huntBiteDeliberate: 6,
            huntBiteChance: 18,
            huntKillsDeliberate: 3,
            packKillsConvergent: 1,
            escapedResponded: 2,
            groupThreatSum: 9,
            groupThreatN: 3,
            groupCalmSum: 4,
            groupCalmN: 4,
            alarms: 8,
            alarmsPrecise: 6,
            huntCalls: 5,
            huntCallsPrecise: 1,
            smokes: 4,
            smokesPrecise: 3,
            idleSignals: 8,
            episodesClassified: 10,
            undefendedEpisodes: 3,
            unseenEpisodes: 1,
        });
        Object.assign(o.intent.calls, { resolved: 4, answeredCalls: 3 });
        Object.assign(o.combat, { huntKills: 4, packKills: 2, escapedEpisodes: 8 });
        const v = Object.fromEntries(Object.entries(intentMetrics(o)).map(([name, r]) => [name, r.value]));
        expect(v).toEqual({
            'eval.deliberate_food_share': 0.75,
            'eval.deliberate_food_per_1k': 7.5,
            'eval.chance_food_per_1k': 2.5,
            'eval.pursuit_bite_share': 0.25,
            'eval.pursuit_kill_share': 0.75,
            'eval.pack_convergence': 0.5,
            'eval.hunt_call_answer': 0.75,
            'eval.evasion_skill': 0.25,
            'eval.group_cohesion_under_threat': 2,
            'eval.alarm_precision': 0.75,
            'eval.hunt_call_precision': 0.2,
            'eval.smoke_precision': 0.75,
            'eval.idle_signals_per_1k': 2,
            'eval.undefended_bite_share': 0.3,
            'eval.unseen_bite_share': 0.1,
        });
    });

    it('gives call precision as the precise share minus the callers base rate, from finished and live slots', () => {
        const o = bareObserver();
        const { intent } = o;
        Object.assign(intent.run, { alarms: 10, alarmsPrecise: 8, alarmsBase: 2, huntCalls: 4, huntCallsPrecise: 4 });
        intent.aliveTicks[0] = 100;
        intent.threatCueTicks[0] = 50;
        intent.alarmCalls[0] = 4;
        intent.preyCueTicks[0] = 25;
        intent.huntCallCount[0] = 4;
        const m = intentMetrics(o);
        expect(m['eval.alarm_precision'].value).toBeCloseTo((8 - (2 + 4 * 0.5)) / 10, 10);
        expect(m['eval.hunt_call_precision'].value).toBeCloseTo((4 - 4 * 0.25) / 4, 10);
    });

    it('is null for the group metric when there is a threatened agent but no unthreatened one', () => {
        const o = bareObserver();
        Object.assign(o.intent.run, { groupThreatSum: 2, groupThreatN: 1 });
        expect(intentMetrics(o)['eval.group_cohesion_under_threat']).toEqual({
            value: null,
            reason: 'no unthreatened agent in a grouping sample',
        });
    });

    it('is merged into computeMetrics with the directions of the design', () => {
        const m = computeMetrics(bareObserver(), EMPTY_WORLD);
        for (const name of NAMES) {
            expect(m[name], name).toBeDefined();
        }
        const lower = ['eval.idle_signals_per_1k', 'eval.undefended_bite_share'];
        // Moved to watch on eval:power's false-positive rate (world-balance T41, T42, T70); `deliberate_food_share` and
        // `diversity` returned to `higher` on E35's rates (fitness-and-selection T13).
        const watch = [
            'eval.deliberate_food_per_1k',
            'eval.chance_food_per_1k',
            'eval.unseen_bite_share',
            'eval.pursuit_bite_share',
            'eval.evasion_skill',
            'eval.alarm_precision',
            'eval.smoke_precision',
            'eval.hunt_call_answer',
        ];
        for (const name of NAMES) {
            const expected = lower.includes(name) ? 'lower' : 'higher';
            expect(metricDirection(name), name).toBe(watch.includes(name) ? 'watch' : expected);
        }
    });
});
