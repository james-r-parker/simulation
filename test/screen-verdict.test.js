import { describe, expect, it } from 'vitest';
import {
    armVerdict,
    hunterGate,
    largestSpecShare,
    screenVerdicts,
    seedChecks,
    shareAbove,
    summerSeeds,
    targetDeltas,
    WATCH_METRICS,
    watchMeans,
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
            'eval.hunter_catches_per_1k': metric(0.01),
            'eval.predators_at_end': metric(5),
            'eval.hunter_ticks_last_quarter': metric(4000),
            'eval.hunter_kills_per_life_p50': metric(2),
            'eval.chase_catch_share': metric(0.3),
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
            metrics: { ...base.metrics, 'eval.hunter_catches_per_1k': metric(0, [0.01, 0]) },
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

    it('fails a report that lacks the catch rate metric', () => {
        const r = report();
        delete r.metrics['eval.hunter_catches_per_1k'];
        expect(seedChecks(r).catchRate.pass).toEqual([false, false]);
    });

    it('fails a null catch rate, and throws without traces', () => {
        const r = report();
        r.metrics['eval.hunter_catches_per_1k'] = { mean: null, values: [null, null] };
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

    it('keeps hunters on 6 of 8 seeds at the end, not on one seed with a hunter alive', () => {
        const eight = (/** @type {number[]} */ ends) => {
            const r = report({ seeds: ends.map((_, i) => i + 1), traces: ends.map(() => report().traces[0]) });
            r.metrics['eval.predators_at_end'] = metric(0, ends);
            r.metrics['eval.hunter_ticks_last_quarter'] = metric(
                0,
                ends.map(() => 4000),
            );
            return hunterGate(r, report());
        };
        expect(eight([0, 0, 5, 5, 5, 5, 5, 5])).toMatchObject({ aliveShare: 0.75, pass: true });
        expect(eight([0, 0, 0, 5, 5, 5, 5, 9])).toMatchObject({ aliveShare: 0.625, pass: false });
    });

    it('fails an arm with more seeds under 80 agents than the reference, and passes it at the same count', () => {
        const low = trace([], { spec: [10, 10, 10, 10, 10] });
        const one = report({ traces: [low, report().traces[0]] });
        expect(hunterGate(one, report())).toMatchObject({ lowSeeds: 1, pass: false });
        expect(hunterGate(one, one).pass).toBe(true);
    });

    it('fails when the headcount or last-quarter hunter-ticks median falls below the reference, not on kills', () => {
        const at = (/** @type {string} */ name, /** @type {number[]} */ values) => {
            const r = report();
            r.metrics[name] = metric(0, values);
            return hunterGate(r, report());
        };
        expect(at('eval.predators_at_end', [4, 5]).pass).toBe(false);
        expect(at('eval.hunter_ticks_last_quarter', [3000, 4000]).pass).toBe(false);
        // Kills per life is reported beside the gate: a typical hunter life expects well under one kill.
        const sparse = at('eval.hunter_kills_per_life_p50', [0.1, 0.2]);
        expect(sparse.pass).toBe(true);
        expect(sparse.kills).toBeCloseTo(0.15);
        expect(hunterGate(report(), report())).toEqual({
            predators: 5,
            ticks: 4000,
            kills: 2,
            chaseCatch: 0.3,
            aliveShare: 1,
            lowSeeds: 0,
            pass: true,
        });
        const bare = report();
        delete bare.metrics['eval.predators_at_end'];
        expect(hunterGate(bare, report())).toMatchObject({ predators: null, aliveShare: 0, pass: false });
        expect(armVerdict('a', bare, report()).pass).toBe(false);
    });

    it('passes the medians when the reference lacks them', () => {
        const ref = report();
        delete ref.metrics['eval.predators_at_end'];
        delete ref.metrics['eval.hunter_ticks_last_quarter'];
        expect(hunterGate(report(), ref).pass).toBe(true);
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

describe('watchMeans', () => {
    it('gives each watch metric its mean, and null where the report lacks it', () => {
        const r = report();
        r.metrics['eval.skill_trend'] = metric(0.25);
        r.metrics['eval.migration_index'] = { mean: null, values: [null, null] };
        const w = watchMeans(r);
        expect(Object.keys(w)).toEqual(WATCH_METRICS);
        expect(w['eval.skill_trend']).toBe(0.25);
        expect(w['eval.migration_index']).toBeNull();
        expect(w['eval.predator_presence']).toBeNull();
    });

    it('is carried on each arm verdict, reference included', () => {
        const ref = report();
        ref.metrics['eval.child_survival'] = metric(0.5);
        expect(armVerdict('ref', ref, ref).watch['eval.child_survival']).toBe(0.5);
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

describe('summerSeeds', () => {
    const arm = (/** @type {(number | null)[]} */ values) => ({
        seeds: values.map((_, i) => i + 1),
        metrics: { 'eval.prey_summer_min': { mean: 0, values } },
    });

    it('counts the seeds that keep 100 prey through every summer; a seed with no summer is not above', () => {
        expect(summerSeeds(arm([100, 99, 250, 80, null]))).toEqual({ above: 2, of: 5 });
    });

    it('reads zero of the seeds run when the report lacks the metric', () => {
        expect(summerSeeds({ seeds: [1, 2], metrics: {} })).toEqual({ above: 0, of: 2 });
    });
});
