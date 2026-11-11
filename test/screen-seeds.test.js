import { describe, expect, it } from 'vitest';
import { PAIRED_CRITERIA, seedVsReference, seedsVsReference } from '../scripts/lib/screen-seeds.mjs';

/** @param {number} n seeds @param {number} failing how many of the first seeds fail @returns {{ pass: boolean[] }} a criterion */
const crit = (n, failing) => ({ pass: Array.from({ length: n }, (_, i) => i >= failing) });

describe('seedVsReference', () => {
    it('counts the seeds lost and regained and tests them exactly', () => {
        expect(seedVsReference(crit(32, 2), crit(32, 0))).toMatchObject({
            pass: 30,
            of: 32,
            lost: 2,
            regained: 0,
            p: 0.5,
            worse: false,
        });
        expect(seedVsReference(crit(32, 6), crit(32, 0))).toMatchObject({ lost: 6, worse: true });
        expect(seedVsReference(crit(32, 0), crit(32, 6))).toMatchObject({ lost: 0, regained: 6, worse: false });
        expect(seedVsReference(crit(32, 6), crit(32, 0)).diff).toBeCloseTo(-6 / 32, 12);
    });

    it('does not call an arm worse for failing the same seeds as the reference, or for a 10 v 8 exchange', () => {
        expect(seedVsReference(crit(32, 20), crit(32, 20))).toMatchObject({ lost: 0, regained: 0, p: 1, worse: false });
        const arm = { pass: Array.from({ length: 32 }, (_, i) => !(i < 10)) };
        const ref = { pass: Array.from({ length: 32 }, (_, i) => !(i >= 10 && i < 18)) };
        expect(seedVsReference(arm, ref)).toMatchObject({ lost: 10, regained: 8, worse: false });
    });
});

describe('seedsVsReference', () => {
    it('covers the four paired criteria and leaves catchRate out', () => {
        expect(PAIRED_CRITERIA).toEqual(['popAboveMin', 'lineages', 'specShare', 'popBelowMax']);
        const all = Object.fromEntries(
            ['popAboveMin', 'catchRate', 'lineages', 'specShare', 'popBelowMax'].map((k) => [k, crit(4, 0)]),
        );
        expect(Object.keys(seedsVsReference(all, all))).toEqual(PAIRED_CRITERIA);
    });
});
