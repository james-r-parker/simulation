import { describe, expect, it } from 'vitest';
import { pooledInterval } from '../../js/evo/compare-pooled.js';
import { pooledStat, pooledStudentisedInterval } from '../../js/evo/pooled-t.js';
import { createRng, fork } from '../../js/sim/rng.js';

const BEFORE = [
    { num: 1, den: 4 },
    { num: 5, den: 5 },
    { num: 0, den: 7 },
    { num: 2, den: 3 },
    { num: 6, den: 9 },
];
const AFTER = [
    { num: 2, den: 4 },
    { num: 1, den: 5 },
    { num: 3, den: 6 },
    { num: 3, den: 3 },
    { num: 4, den: 8 },
];
const draw = (resamples = 2000, level = 0.95) => ({ rng: fork(createRng(3), 'pt'), resamples, level });

/** @returns {{ diff: number, se: number }} the delta-method difference and standard error, computed the long way */
function naive(/** @type {number[]} */ chosen) {
    const n = chosen.length;
    const sum = (/** @type {typeof BEFORE} */ arm, /** @type {'num' | 'den'} */ key) =>
        chosen.reduce((t, k) => t + arm[k][key], 0);
    const ra = sum(AFTER, 'num') / sum(AFTER, 'den');
    const rb = sum(BEFORE, 'num') / sum(BEFORE, 'den');
    const mad = sum(AFTER, 'den') / n;
    const mbd = sum(BEFORE, 'den') / n;
    const z = chosen.map((k) => (AFTER[k].num - ra * AFTER[k].den) / mad - (BEFORE[k].num - rb * BEFORE[k].den) / mbd);
    const mz = z.reduce((t, v) => t + v, 0) / n;
    const sd = Math.sqrt(z.reduce((t, v) => t + (v - mz) ** 2, 0) / (n - 1));
    return { diff: ra - rb, se: sd / Math.sqrt(n) };
}

describe('pooledStat against a naive reference', () => {
    it.each([[[0, 1, 2, 3, 4]], [[0, 0, 3, 4, 4, 2]], [[1, 2]]])('matches the long way on %j', (chosen) => {
        const got = pooledStat(BEFORE, AFTER, Int32Array.from(chosen));
        const want = naive(chosen);
        expect(got?.diff).toBeCloseTo(want.diff, 12);
        expect(got?.se).toBeCloseTo(want.se, 12);
    });

    it('is null when an arm has no exposure in the chosen seeds', () => {
        const empty = [{ num: 0, den: 0 }, ...AFTER.slice(1)];
        expect(pooledStat(BEFORE, empty, [0, 0])).toBeNull();
        expect(pooledStat(empty, AFTER, [0])).toBeNull();
    });

    it('has no standard error when every seed has the same ratio in both arms', () => {
        const same = [
            { num: 1, den: 2 },
            { num: 2, den: 4 },
            { num: 3, den: 6 },
        ];
        expect(pooledStat(same, same, [0, 1, 2])).toEqual({ diff: 0, se: 0 });
    });
});

describe('pooledStudentisedInterval', () => {
    it('brackets the pooled difference, replays from the seed and widens with the level', () => {
        const a = pooledStudentisedInterval(BEFORE, AFTER, draw());
        const diff = naive([0, 1, 2, 3, 4]).diff;
        expect(a.low).toBeLessThan(diff);
        expect(a.high).toBeGreaterThan(diff);
        expect(pooledStudentisedInterval(BEFORE, AFTER, draw())).toEqual(a);
        const narrow = pooledStudentisedInterval(BEFORE, AFTER, draw(2000, 0.5));
        expect(narrow.high - narrow.low).toBeLessThan(a.high - a.low);
    });

    it('is the point interval when the observed standard error is 0', () => {
        const same = BEFORE.map((c) => ({ ...c }));
        expect(pooledStudentisedInterval(BEFORE, same, draw())).toEqual({ low: 0, high: 0 });
    });

    it('is the point interval when no resample has exposure and a standard error', () => {
        const lone = [{ num: 1, den: 2 }, ...Array.from({ length: 4 }, () => ({ num: 0, den: 0 }))];
        const other = [{ num: 3, den: 4 }, ...Array.from({ length: 4 }, () => ({ num: 0, den: 0 }))];
        const { low, high } = pooledStudentisedInterval(lone, other, draw(1));
        expect(low).toBe(high);
        expect(low).toBeCloseTo(0.25, 12);
    });

    it('drops resamples with no exposure and still gives an interval', () => {
        const some = [{ num: 0, den: 0 }, ...BEFORE.slice(1)];
        const { low, high } = pooledStudentisedInterval(some, AFTER, draw(400));
        expect(low).toBeLessThan(high);
    });

    it('is what pooledInterval returns at every arm size, from the bootstrap stream', () => {
        const rng = fork(createRng(1), 'bootstrap');
        expect(pooledInterval(BEFORE, AFTER, { level: 0.95, resamples: 500 })).toEqual(
            pooledStudentisedInterval(BEFORE, AFTER, { rng, resamples: 500, level: 0.95 }),
        );
        const big = Array.from({ length: 40 }, (_, i) => ({ num: (i % 7) + 1, den: 10 + (i % 5) }));
        const bigAfter = big.map((c) => ({ num: c.num + 1, den: c.den }));
        const rngBig = fork(createRng(1), 'bootstrap');
        expect(pooledInterval(big, bigAfter, { level: 0.95, resamples: 500 })).toEqual(
            pooledStudentisedInterval(big, bigAfter, { rng: rngBig, resamples: 500, level: 0.95 }),
        );
    });
});
