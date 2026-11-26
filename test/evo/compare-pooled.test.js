import { describe, expect, it } from 'vitest';
import { compareReports } from '../../js/evo/compare.js';
import { pooledDiff, pooledInterval } from '../../js/evo/compare-pooled.js';
import { pooledEstimate } from '../../js/evo/report-pooled.js';
import { configHash } from '../../js/sim/config.js';

/** @param {number} count @returns {number[]} count seeds */
const seeds = (count) => Array.from({ length: count }, (_, i) => i + 1);

/**
 * @param {{ num: number, den: number }[]} cells one cell per seed
 * @returns {Record<string, any>} a report metric with sufficient statistics
 */
function metric(cells) {
    const values = cells.map((c) => (c.den > 0 ? c.num / c.den : null));
    return {
        values,
        reasons: values.map((v) => (v === null ? 'none' : null)),
        mean: pooledEstimate(cells),
        sd: 0,
        pooled: cells,
    };
}

/**
 * @param {Record<string, any>} metrics report metrics by name
 * @param {number} count seeds
 * @returns {Record<string, any>} a report
 */
function report(metrics, count) {
    const config = { maxAgents: 100 };
    return {
        version: 1,
        policy: 'p',
        fitnessName: 'v6',
        config,
        configHash: configHash(config),
        ticks: 1000,
        seeds: seeds(count),
        sha: 'abc',
        metrics,
    };
}

/** 16 seeds, the denominators uneven by a factor of 40, the rate the same on every seed. */
const BEFORE = Array.from({ length: 16 }, (_, i) => ({ num: (1 + (i % 4)) * 2, den: (1 + (i % 4)) * 20 }));

describe('pooledDiff', () => {
    it('is the difference of the two ratios of sums over the chosen seeds', () => {
        const before = [
            { num: 1, den: 1 },
            { num: 1, den: 9 },
        ];
        const after = [
            { num: 3, den: 4 },
            { num: 0, den: 0 },
        ];
        expect(pooledDiff(before, after, [0, 1])).toBe(3 / 4 - 2 / 10);
        expect(pooledDiff(before, after, [0, 0])).toBe(6 / 8 - 2 / 2);
    });

    it('is null when a chosen set has no opportunities in an arm', () => {
        expect(pooledDiff([{ num: 1, den: 2 }], [{ num: 0, den: 0 }], [0])).toBeNull();
    });
});

describe('pooledInterval', () => {
    it('does not change when every event count is multiplied: events are not independent draws', () => {
        const after = BEFORE.map(({ num, den }, i) => ({ num: num + (i % 3), den }));
        const scaled = (/** @type {typeof after} */ arm) =>
            arm.map(({ num, den }) => ({ num: num * 100, den: den * 100 }));
        const one = pooledInterval(BEFORE, after, { level: 0.95, resamples: 2000 });
        const many = pooledInterval(scaled(BEFORE), scaled(after), { level: 0.95, resamples: 2000 });
        expect(many.low).toBeCloseTo(one.low, 12);
        expect(many.high).toBeCloseTo(one.high, 12);
    });

    it('brackets the pooled difference, and is narrow when the seeds agree and wide when they do not', () => {
        const after = BEFORE.map(({ num, den }) => ({ num: num + den * 0.1, den }));
        const tight = pooledInterval(BEFORE, after, { level: 0.95, resamples: 2000 });
        expect(tight.low).toBeLessThanOrEqual(0.1);
        expect(tight.high).toBeGreaterThanOrEqual(0.1);
        const noisy = after.map((c, i) => ({ num: c.num + (i % 2 === 0 ? c.den * 0.5 : -c.den * 0.09), den: c.den }));
        const wide = pooledInterval(BEFORE, noisy, { level: 0.95, resamples: 2000 });
        expect(wide.high - wide.low).toBeGreaterThan(tight.high - tight.low);
    });

    it('is the degenerate interval when every resample gives the same difference', () => {
        const same = [
            { num: 1, den: 2 },
            { num: 1, den: 2 },
            { num: 1, den: 2 },
        ];
        expect(pooledInterval(same, same, { level: 0.95, resamples: 500 })).toEqual({ low: 0, high: 0 });
    });
});

describe('compareReports on a pooled metric', () => {
    const name = 'pool.rate';
    const options = {
        status: () => 'verified',
        direction: () => /** @type {'lower'} */ ('lower'),
        minSeedsFor: () => 16,
    };

    it('reads each arm as the ratio of sums, which differs from the mean of the seed ratios', () => {
        const before = report({ [name]: metric(BEFORE) }, 16);
        const skew = BEFORE.map((c, i) => (i === 0 ? { num: c.den, den: c.den } : c));
        const after = report({ [name]: metric(skew) }, 16);
        const [row] = compareReports(before, after, options).rows;
        expect(row.before).toBe(pooledEstimate(BEFORE));
        expect(row.after).toBe(pooledEstimate(skew));
        const meanOfRatios = skew.reduce((t, c) => t + c.num / c.den, 0) / 16;
        expect(row.after).not.toBeCloseTo(meanOfRatios, 3);
        expect(row.diff).toBe(
            /** @type {number} */ (pooledEstimate(skew)) - /** @type {number} */ (pooledEstimate(BEFORE)),
        );
    });

    it('gives a verdict a seed with no opportunities cannot veto, and the same interval on every call', () => {
        const rate = (/** @type {number} */ p) =>
            BEFORE.map((c, i) => (i === 3 ? { num: 0, den: 0 } : { num: c.num * p, den: c.den }));
        const before = report({ [name]: metric(rate(1)) }, 16);
        const after = report({ [name]: metric(rate(0.5)) }, 16);
        const [row] = compareReports(before, after, options).rows;
        expect(row.note).toBeUndefined();
        expect(row.verdict).toBe('better');
        expect(compareReports(before, after, options).rows[0]).toEqual(row);
    });

    it('stays null with a note when a whole arm had no opportunities', () => {
        const empty = BEFORE.map(() => ({ num: 0, den: 0 }));
        const [row] = compareReports(
            report({ [name]: metric(BEFORE) }, 16),
            report({ [name]: metric(empty) }, 16),
            options,
        ).rows;
        expect(row).toMatchObject({ verdict: '-', diff: null, low: null, high: null, after: null });
        expect(row.note).toMatch(/no opportunities/);
    });

    it('refuses to mix a pooled report with one that has no sufficient statistics', () => {
        const plain = { ...metric(BEFORE) };
        delete plain.pooled;
        const [row] = compareReports(
            report({ [name]: metric(BEFORE) }, 16),
            report({ [name]: plain }, 16),
            options,
        ).rows;
        expect(row.verdict).toBe('-');
        expect(row.note).toMatch(/pooled in one report only/);
    });
});

describe('pooledInterval at the edges', () => {
    it('reads a zero effect as no effect without dividing by the reference', () => {
        const zero = BEFORE.map((c) => ({ num: 0, den: c.den }));
        const options = {
            status: () => 'verified',
            direction: () => /** @type {'lower'} */ ('lower'),
            minSeedsFor: () => 16,
        };
        const [row] = compareReports(
            report({ 'pool.rate': metric(zero) }, 16),
            report({ 'pool.rate': metric(zero) }, 16),
            options,
        ).rows;
        expect(row).toMatchObject({ effect: null, verdict: 'no-difference', diff: 0 });
    });
});

describe('a metric without pooled cells still refuses a null seed', () => {
    it('gives no verdict and says so', () => {
        const plain = (/** @type {(number | null)[]} */ values) => ({
            values,
            reasons: values.map((v) => (v === null ? 'none' : null)),
            mean: 1,
            sd: 0,
        });
        const withNull = plain(BEFORE.map((_, i) => (i === 0 ? null : 1)));
        const options = {
            status: () => 'verified',
            direction: () => /** @type {'lower'} */ ('lower'),
            minSeedsFor: () => 16,
        };
        const [row] = compareReports(
            report({ 'plain.rate': withNull }, 16),
            report({ 'plain.rate': plain(BEFORE.map(() => 1)) }, 16),
            options,
        ).rows;
        expect(row).toMatchObject({ verdict: '-', note: 'null in a seed' });
    });
});
