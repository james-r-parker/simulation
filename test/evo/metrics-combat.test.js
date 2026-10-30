import { describe, expect, it } from 'vitest';
import { validateReport, buildReport } from '../../js/evo/report.js';
import { createConfig } from '../../js/sim/config.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { combatMetrics } from '../../js/evo/metrics-combat.js';
import { metricDirection } from '../../js/evo/compare.js';
import { bareObserver, EMPTY_WORLD } from './helpers/metrics-observer.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const NAMES = [
    'eval.catch_rate',
    'eval.escape_rate',
    'eval.pack_kill_share',
    'eval.alarm_response',
    'eval.smoke_escapes',
];

describe('combatMetrics', () => {
    it('is null with a reason for every metric on an empty observer', () => {
        const m = combatMetrics(bareObserver());
        expect(Object.keys(m)).toEqual(NAMES);
        expect(m['eval.catch_rate']).toEqual({ value: null, reason: 'no hunters' });
        expect(m['eval.escape_rate']).toEqual({ value: null, reason: 'no resolved bite episode' });
        expect(m['eval.pack_kill_share']).toEqual({ value: null, reason: 'no eaten death' });
        expect(m['eval.alarm_response']).toEqual({ value: null, reason: 'no alarm call' });
        expect(m['eval.smoke_escapes']).toEqual({ value: null, reason: 'no smoke release after a bite' });
    });

    it('computes catch rate per 1000 hunter agent-ticks, and shares from the counters', () => {
        const o = bareObserver();
        Object.assign(o.combat, {
            hunterAgentTicks: 4000,
            huntKills: 6,
            caughtEpisodes: 3,
            escapedEpisodes: 1,
            eatenDeaths: 8,
            packKills: 2,
        });
        Object.assign(o.combat.smoke, { bittenReleases: 4, escapes: 3 });
        Object.assign(o.combat.alarm, { calls: 3, matchedCalls: 2, sum: 0.5 });
        const m = combatMetrics(o);
        expect(m['eval.catch_rate']).toEqual({ value: 1.5 });
        expect(m['eval.escape_rate']).toEqual({ value: 0.25 });
        expect(m['eval.pack_kill_share']).toEqual({ value: 0.25 });
        expect(m['eval.smoke_escapes']).toEqual({ value: 0.75 });
        expect(m['eval.alarm_response']).toEqual({ value: 0.25 });
    });

    it('gives a reason when alarms were called but none had a matched hearer', () => {
        const o = bareObserver();
        o.combat.alarm.calls = 2;
        expect(combatMetrics(o)['eval.alarm_response'].reason).toMatch(/matched control/);
    });

    it('is merged into computeMetrics and ranked higher-is-better by eval:compare', () => {
        const m = computeMetrics(bareObserver(), EMPTY_WORLD);
        for (const name of NAMES) {
            expect(m[name], name).toBeDefined();
            expect(metricDirection(name)).toBe('higher');
        }
    });

    it('builds a report that validates, and an older report without the metrics still validates', () => {
        const config = createConfig({ ...SIMPLE_WORLD, seed: 1 });
        const input = { policy: 'p', fitnessName: 'f', config, ticks: 10, seeds: [1], sha: 'abc' };
        const metrics = computeMetrics(bareObserver(), EMPTY_WORLD);
        const report = buildReport({ ...input, perSeed: [metrics] });
        expect(() => validateReport(report)).not.toThrow();
        expect(report.metrics['eval.catch_rate'].reasons).toEqual(['no hunters']);
        const older = Object.fromEntries(Object.entries(metrics).filter(([name]) => !NAMES.includes(name)));
        expect(() => validateReport(buildReport({ ...input, perSeed: [older] }))).not.toThrow();
    });
});
