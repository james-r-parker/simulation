import { describe, expect, it } from 'vitest';
import { binomialTwoSidedP, exactWorse, leastDetectedLoss, wilsonInterval } from '../../js/evo/binomial.js';

/**
 * Naive reference: sum the probability of every outcome no likelier than the observed one, with exact BigInt counts.
 * @param {number} n trials
 * @param {number} k observed
 * @returns {number} the two-sided p at 0.5
 */
function naiveP(n, k) {
    /** @param {number} i @returns {bigint} C(n, i) */
    const choose = (i) => {
        let r = 1n;
        for (let j = 1; j <= i; j++) {
            r = (r * BigInt(n - i + j)) / BigInt(j);
        }
        return r;
    };
    const observed = choose(k);
    let total = 0n;
    for (let i = 0; i <= n; i++) {
        if (choose(i) <= observed) {
            total += choose(i);
        }
    }
    return Number(total) / 2 ** n;
}

describe('binomialTwoSidedP', () => {
    it('matches the naive sum for every n up to 40 and every k', () => {
        for (let n = 0; n <= 40; n++) {
            for (let k = 0; k <= n; k++) {
                expect(binomialTwoSidedP(n, k), `n=${n} k=${k}`).toBeCloseTo(naiveP(n, k), 12);
            }
        }
    });

    it('gives known values', () => {
        expect(binomialTwoSidedP(2, 2)).toBe(0.5);
        expect(binomialTwoSidedP(5, 5)).toBeCloseTo(0.0625, 12);
        expect(binomialTwoSidedP(6, 6)).toBeCloseTo(0.03125, 12);
        expect(binomialTwoSidedP(0, 0)).toBe(1);
        expect(binomialTwoSidedP(10, 5)).toBe(1);
    });

    it('stays finite for the largest seed counts', () => {
        expect(binomialTwoSidedP(128, 64)).toBe(1);
        expect(binomialTwoSidedP(128, 128)).toBeGreaterThan(0);
    });
});

describe('exactWorse and leastDetectedLoss', () => {
    it('needs more moves one way and p below 0.05', () => {
        expect(exactWorse(2, 0)).toBe(false);
        expect(exactWorse(5, 0)).toBe(false);
        expect(exactWorse(6, 0)).toBe(true);
        expect(exactWorse(10, 0)).toBe(true);
        expect(exactWorse(10, 8)).toBe(false);
        expect(exactWorse(0, 6)).toBe(false);
    });

    it('finds the least detected loss given the moves back', () => {
        expect(leastDetectedLoss(0, 32)).toBe(6);
        expect(leastDetectedLoss(1, 32)).toBe(8);
        expect(leastDetectedLoss(0, 4)).toBeNull();
        for (let c = 0; c < 6; c++) {
            const b = /** @type {number} */ (leastDetectedLoss(c, 60));
            expect(exactWorse(b, c)).toBe(true);
            expect(exactWorse(b - 1, c)).toBe(false);
        }
    });
});

describe('wilsonInterval', () => {
    it('brackets the share, stays in [0, 1] and narrows with n', () => {
        const a = wilsonInterval(24, 32);
        expect(a.low).toBeLessThan(0.75);
        expect(a.high).toBeGreaterThan(0.75);
        expect(wilsonInterval(0, 32).low).toBe(0);
        expect(wilsonInterval(32, 32).high).toBe(1);
        const b = wilsonInterval(48, 64);
        expect(b.high - b.low).toBeLessThan(a.high - a.low);
        expect(a.low).toBeCloseTo(0.5789, 3);
    });
});
