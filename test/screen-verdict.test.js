import { describe, expect, it } from 'vitest';
import {
    armVerdict,
    largestSpecShare,
    screenVerdicts,
    seedChecks,
    shareAbove,
    targetDeltas,
} from '../scripts/lib/screen-verdict.mjs';

/**
 * @param {number[]} pop population every 1000 ticks
 * @param {Partial<{ spec: number[], lineages: number }>} [end] the end state
 * @returns {Record<string, any>} a trace
 */
function trace(pop, end = {}) {
    return { interval: 1000, pop, mate: [], split: [], deaths: [], spec: [20, 20, 20, 20, 20], lineages: 8, ...end };
}

/**
 * @param {number} mean a metric mean
 * @param {number[]} [values] per-seed values
 * @returns {Record<string, any>} a metric entry
 */
const metric = (mean, values = [mean, mean]) => ({ mean, values });

/**
 * @param {Record<string, any>} [over] fields to replace
 * @returns {Record<string, any>} a 2-seed report that passes every criterion
 */
function report(over = {}) {
    const good = trace([...Array(10).fill(100), ...Array(20).fill(150)]);
    return {
        seeds: [1, 2],
        config: { minAgents: 100, maxAgents: 500 },
        traces: [good, good],
        metrics: {
            'eval.catch_rate': metric(0.01),
            'eval.mating_share': metric(0.3),
            'eval.born_share': metric(0.9),
            'eval.population_mean': metric(140),
            'eval.lineages_alive': metric(10),
            'eval.births_per_1k': metric(0.2),
            'eval.food_energy_per_1k': metric(300),
            'eval.fed_median_lifespan': metric(4000),
        },
        ...over,
    };
}

describe('shareAbove', () => {
    it('counts only samples at or after the burn-in, strictly above the floor', () => {
        // ticks 1000..10000 are before or at burn-in (10000 counts), then 5 more: pop 100 is not above 100
        const t = trace([500, 500, 500, 500, 500, 500, 500, 500, 500, 100, 101, 101, 101, 100]);
        expect(shareAbove(t, 100)).toBe(3 / 5);
    });

    it('is 0 when no sample is after the burn-in', () => {
        expect(shareAbove(trace([500, 500]), 100)).toBe(0);
    });
});

describe('largestSpecShare', () => {
    it('is the largest count over the alive total, and 1 when none are alive', () => {
        expect(largestSpecShare(trace([], { spec: [1, 7, 2, 0, 0] }))).toBe(0.7);
        expect(largestSpecShare(trace([], { spec: [0, 0, 0, 0, 0] }))).toBe(1);
    });
});

describe('seedChecks', () => {
    it('decides each criterion per seed at its threshold', () => {
        const base = report();
        const r = report({
            traces: [
                trace(base.traces[0].pop, { lineages: 5, spec: [70, 10, 10, 5, 5] }),
                trace(base.traces[0].pop, { lineages: 4, spec: [71, 10, 10, 5, 4] }),
            ],
            metrics: { ...base.metrics, 'eval.catch_rate': metric(0, [0.01, 0]) },
        });
        const c = seedChecks(r);
        expect(c.lineages.pass).toEqual([true, false]);
        expect(c.specShare.pass).toEqual([true, false]);
        expect(c.catchRate.pass).toEqual([true, false]);
        expect(c.popAboveMin.pass).toEqual([true, true]);
    });

    it('fails population below max when the end population reaches maxAgents', () => {
        const full = trace([], { spec: [100, 100, 100, 100, 100] });
        const r = report({ traces: [full, trace([], { spec: [99, 100, 100, 100, 100] })] });
        expect(seedChecks(r).popBelowMax.pass).toEqual([false, true]);
    });

    it('fails a null catch rate, and throws without traces', () => {
        const r = report();
        r.metrics['eval.catch_rate'] = { mean: null, values: [null, null] };
        expect(seedChecks(r).catchRate.pass).toEqual([false, false]);
        expect(() => seedChecks({ ...r, traces: undefined })).toThrow(/no traces/);
    });
});

describe('armVerdict', () => {
    it('passes when every seed and both means pass', () => {
        expect(armVerdict('a', report(), report())).toMatchObject({ arm: 'a', pass: true });
    });

    it('fails on the mating mean at 0.19 and on the born mean at 0.49, not at the thresholds', () => {
        const at = (/** @type {number} */ mating, /** @type {number} */ born) => {
            const r = report();
            r.metrics['eval.mating_share'] = metric(mating);
            r.metrics['eval.born_share'] = metric(born);
            return armVerdict('a', r, report());
        };
        expect(at(0.2, 0.5).pass).toBe(true);
        expect(at(0.19, 0.5).means.matingShare.pass).toBe(false);
        expect(at(0.2, 0.49).means.bornShare.pass).toBe(false);
        expect(at(0.19, 0.49).pass).toBe(false);
    });

    it('fails when one seed fails one criterion', () => {
        const r = report();
        r.traces[1] = trace(Array(30).fill(100));
        const v = armVerdict('a', r, report());
        expect(v.pass).toBe(false);
        expect(v.criteria.popAboveMin.pass).toEqual([true, false]);
    });

    it('has no deltas for the reference itself', () => {
        const ref = report();
        expect(armVerdict('ref', ref, ref).deltas).toBeNull();
    });
});

describe('targetDeltas', () => {
    it('gives the difference and the relative change against the reference mean', () => {
        const arm = report();
        arm.metrics['eval.food_energy_per_1k'] = metric(450);
        arm.metrics['eval.births_per_1k'] = metric(0);
        const d = targetDeltas(arm, report());
        expect(d['eval.food_energy_per_1k']).toEqual({ mean: 450, delta: 150, rel: 0.5 });
        expect(d['eval.births_per_1k'].rel).toBe(-1);
    });

    it('gives null where a mean or a nonzero reference is missing', () => {
        const arm = report();
        arm.metrics['eval.lineages_alive'] = { mean: null, values: [null, null] };
        const ref = report();
        ref.metrics['eval.mating_share'] = metric(0);
        const d = targetDeltas(arm, ref);
        expect(d['eval.lineages_alive']).toEqual({ mean: null, delta: null, rel: null });
        expect(d['eval.mating_share'].rel).toBeNull();
    });
});

describe('screenVerdicts', () => {
    it('scores every arm against the reference, in order', () => {
        const out = screenVerdicts({ ref: report(), b: report() }, 'ref');
        expect(out.arms.map((a) => a.arm)).toEqual(['ref', 'b']);
        expect(out.arms[1].deltas).not.toBeNull();
        expect(() => screenVerdicts({ b: report() }, 'ref')).toThrow(/no report/);
    });
});
