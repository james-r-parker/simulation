import { describe, expect, it } from 'vitest';
import { configHash, createConfig } from '../../js/sim/config.js';
import { buildReport, validateReport } from '../../js/evo/report.js';

const config = createConfig({ seed: 7, maxAgents: 600 });
const perSeed = [
    { 'eval.a': { value: 1 }, 'eval.b': { value: null, reason: 'no archive' } },
    { 'eval.a': { value: 3 }, 'eval.b': { value: null, reason: 'no archive' } },
    { 'eval.a': { value: null, reason: 'no deaths' }, 'eval.b': { value: null, reason: 'no archive' } },
];

/** @returns {Record<string, any>} a fresh valid report */
function sample() {
    return buildReport({ policy: 'p', fitnessName: 'v5', config, ticks: 100, seeds: [1, 2, 3], sha: 'abc', perSeed });
}

describe('buildReport with ragged metrics', () => {
    it('reports "not computed" for a metric a seed lacks or leaves without a reason', () => {
        const report = buildReport({
            policy: 'p',
            fitnessName: 'v5',
            config,
            ticks: 100,
            seeds: [1, 2],
            sha: 'abc',
            perSeed: [{ 'eval.a': { value: 1 } }, { 'eval.a': { value: null }, 'eval.b': { value: 2 } }],
        });
        expect(report.metrics['eval.a'].reasons).toEqual([null, 'not computed']);
        expect(report.metrics['eval.b'].reasons).toEqual(['not computed', null]);
    });
});

describe('buildReport', () => {
    it('stores the config without its seed and hashes that object', () => {
        const report = sample();
        expect(report.config).not.toHaveProperty('seed');
        expect(report.config.maxAgents).toBe(600);
        expect(report.configHash).toBe(configHash(report.config));
        expect(report).toMatchObject({
            version: 1,
            policy: 'p',
            fitnessName: 'v5',
            ticks: 100,
            seeds: [1, 2, 3],
            sha: 'abc',
        });
    });

    it('keeps values and reasons in seed order and summarises the non-null values', () => {
        const { metrics } = sample();
        expect(metrics['eval.a']).toEqual({
            values: [1, 3, null],
            reasons: [null, null, 'no deaths'],
            mean: 2,
            sd: Math.sqrt(2),
        });
        expect(metrics['eval.b']).toEqual({
            values: [null, null, null],
            reasons: ['no archive', 'no archive', 'no archive'],
            mean: null,
            sd: null,
        });
    });

    it('gives sd 0 for a single value and sorts the metric keys', () => {
        const report = buildReport({
            policy: 'p',
            fitnessName: 'v5',
            config,
            ticks: 1,
            seeds: [1],
            sha: 's',
            perSeed: [{ z: { value: 4 }, a: { value: 5 } }],
        });
        expect(Object.keys(report.metrics)).toEqual(['a', 'z']);
        expect(report.metrics.z.sd).toBe(0);
        expect(report.metrics.z.mean).toBe(4);
    });

    it('survives a JSON round trip and validates', () => {
        const report = sample();
        expect(() => validateReport(JSON.parse(JSON.stringify(report)))).not.toThrow();
    });
});

describe('validateReport', () => {
    it.each([
        ['version', (/** @type {any} */ r) => (r.version = 2)],
        ['policy', (/** @type {any} */ r) => (r.policy = '')],
        ['fitnessName', (/** @type {any} */ r) => delete r.fitnessName],
        ['config', (/** @type {any} */ r) => (r.config = [])],
        ['configHash', (/** @type {any} */ r) => (r.configHash = 5)],
        ['ticks', (/** @type {any} */ r) => (r.ticks = 1.5)],
        ['seeds', (/** @type {any} */ r) => (r.seeds = [])],
        ['seeds[1]', (/** @type {any} */ r) => (r.seeds[1] = 'x')],
        ['sha', (/** @type {any} */ r) => (r.sha = null)],
        ['metrics', (/** @type {any} */ r) => (r.metrics = null)],
        ['metrics.eval.a.values', (/** @type {any} */ r) => r.metrics['eval.a'].values.pop()],
        ['metrics.eval.a.reasons', (/** @type {any} */ r) => (r.metrics['eval.a'].reasons = [])],
        ['metrics.eval.a.values[1]', (/** @type {any} */ r) => (r.metrics['eval.a'].values[1] = Number.NaN)],
        ['metrics.eval.a.values[2]', (/** @type {any} */ r) => (r.metrics['eval.a'].reasons[2] = null)],
        ['metrics.eval.a.values[0]', (/** @type {any} */ r) => (r.metrics['eval.a'].reasons[0] = 'why')],
        ['metrics.eval.a.mean', (/** @type {any} */ r) => (r.metrics['eval.a'].mean = 'x')],
    ])('throws naming %s', (path, damage) => {
        const report = sample();
        damage(report);
        expect(() => validateReport(report)).toThrow(`invalid report: ${path} must be`);
    });

    it('accepts a report without eval.born_share, as recorded before the metric existed', () => {
        const report = sample();
        expect(report.metrics['eval.born_share']).toBeUndefined();
        expect(() => validateReport(report)).not.toThrow();
    });

    it('accepts each new trend, dominance, body, environment, lineage and watch metric', () => {
        const names = [
            'deliberate_food_trend',
            'pursuit_trend',
            'evasion_trend',
            'skill_trend',
            'spec_dominance',
            'spec_effective',
            'lineage_dominance',
            'lineage_effective',
            'trait_spread',
            'body_plan_coverage',
            'sex_balance',
            'cold_stress_share',
            'heat_stress_share',
            'terrain_death_share',
            'winter_pop_ratio',
            'child_survival',
            'lineage_lifespan_p50',
            'migration_index',
            'predator_presence',
            'pred_prey_lag_corr',
        ];
        const seedMetrics = (/** @type {number} */ i) =>
            Object.fromEntries(
                names.map((name) => [
                    `eval.${name}`,
                    i === 2 ? { value: null, reason: 'no windows' } : { value: i + 0.5 },
                ]),
            );
        const report = buildReport({
            policy: 'p',
            fitnessName: 'v5',
            config,
            ticks: 100,
            seeds: [1, 2, 3],
            sha: 'abc',
            perSeed: [0, 1, 2].map(seedMetrics),
        });
        expect(Object.keys(report.metrics)).toHaveLength(names.length);
        expect(Object.keys(report.metrics)).toEqual(expect.arrayContaining(names.map((name) => `eval.${name}`)));
        expect(report.metrics['eval.skill_trend'].reasons).toEqual([null, null, 'no windows']);
        expect(() => validateReport(JSON.parse(JSON.stringify(report)))).not.toThrow();
    });

    it('rejects a non-object report', () => {
        expect(() => validateReport(null)).toThrow('invalid report: report must be');
    });
});

describe('report traces', () => {
    const trace = { interval: 1000, pop: [1, 2], mate: [1], split: [0], spec: [1], deaths: [0], lineages: 1 };
    const input = { policy: 'p', fitnessName: 'v5', config, ticks: 100, seeds: [1, 2, 3], sha: 'abc', perSeed };

    it('stores traces when given and validates them', () => {
        const report = buildReport({ ...input, traces: [trace, trace, trace] });
        expect(report.traces).toHaveLength(3);
        expect(() => validateReport(report)).not.toThrow();
        expect(() => validateReport({ ...report, traces: [trace] })).toThrow(/traces must be an array of 3/);
        expect(() => validateReport({ ...report, traces: [trace, trace, { ...trace, pop: ['x'] }] })).toThrow(
            /traces\[2\]\.pop/,
        );
    });

    it('leaves traces out when none are given', () => {
        expect(buildReport(input)).not.toHaveProperty('traces');
    });
});
