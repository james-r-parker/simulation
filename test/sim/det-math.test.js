import { describe, expect, it } from 'vitest';
import { detCos, detExp, detLog, detSin, detTanh } from '../../js/sim/det-math.js';

const POINTS = 100000;
const TOLERANCE = 1e-12;

/**
 * Worst error of fn against ref over points spread by `at(i)`.
 * @param {(x: number) => number} fn Function under test.
 * @param {(x: number) => number} ref Reference.
 * @param {(i: number) => number} at Maps 0..POINTS-1 to an argument.
 * @returns {number} Max of abs(det - ref) / max(1, abs(ref)).
 */
function maxError(fn, ref, at) {
    let worst = 0;
    for (let i = 0; i < POINTS; i += 1) {
        const x = at(i);
        const want = ref(x);
        worst = Math.max(worst, Math.abs(fn(x) - want) / Math.max(1, Math.abs(want)));
    }
    return worst;
}

/**
 * @param {number} lo Start.
 * @param {number} hi End.
 * @returns {(i: number) => number} Evenly spaced argument generator.
 */
const linear = (lo, hi) => (i) => lo + ((hi - lo) * i) / (POINTS - 1);

describe('det-math accuracy', () => {
    it('detSin matches Math.sin over +-1e6', () => {
        expect(maxError(detSin, Math.sin, linear(-1e6, 1e6))).toBeLessThanOrEqual(TOLERANCE);
    });
    it('detCos matches Math.cos over +-1e6', () => {
        expect(maxError(detCos, Math.cos, linear(-1e6, 1e6))).toBeLessThanOrEqual(TOLERANCE);
    });
    it('detSin and detCos are accurate over small angles in every quadrant', () => {
        expect(maxError(detSin, Math.sin, linear(-20, 20))).toBeLessThanOrEqual(TOLERANCE);
        expect(maxError(detCos, Math.cos, linear(-20, 20))).toBeLessThanOrEqual(TOLERANCE);
    });
    it('detExp matches Math.exp over [-708, 709]', () => {
        const worst = maxError(detExp, Math.exp, linear(-708, 709));
        expect(worst).toBeLessThanOrEqual(TOLERANCE);
    });
    it('detLog matches Math.log log-spaced over the positive doubles', () => {
        const spread = linear(-744, 709);
        const at = (/** @type {number} */ i) => Math.exp(spread(i));
        expect(maxError(detLog, Math.log, at)).toBeLessThanOrEqual(TOLERANCE);
    });
    it('detLog is accurate near 1 and for subnormals', () => {
        expect(maxError(detLog, Math.log, linear(0.5, 2))).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(detLog(5e-324) - Math.log(5e-324))).toBeLessThanOrEqual(TOLERANCE * 745);
        expect(detLog(1)).toBe(0);
    });
    it('detTanh matches Math.tanh over [-25, 25]', () => {
        expect(maxError(detTanh, Math.tanh, linear(-25, 25))).toBeLessThanOrEqual(TOLERANCE);
    });
});

describe('det-math edges', () => {
    it('detTanh keeps -0 and saturates to +-1', () => {
        expect(Object.is(detTanh(-0), -0)).toBe(true);
        expect(Object.is(detTanh(0), 0)).toBe(true);
        expect(detTanh(21)).toBe(1);
        expect(detTanh(-21)).toBe(-1);
    });
    it('returns the same bits on repeat', () => {
        const fns = [detSin, detCos, detExp, detLog, detTanh];
        for (const fn of fns) {
            for (const x of [0.5, 3.7, 12.25]) {
                expect(Object.is(fn(x), fn(x))).toBe(true);
            }
        }
        expect(detExp(1)).toBe(detExp(1));
    });
    it('throws outside the domain, naming the value', () => {
        expect(() => detSin(1e6 + 1)).toThrow(/detSin.*1000001/);
        expect(() => detCos(NaN)).toThrow(/detCos/);
        expect(() => detExp(710)).toThrow(/detExp/);
        expect(() => detExp(-709)).toThrow(/detExp/);
        expect(() => detLog(0)).toThrow(/detLog/);
        expect(() => detLog(-1)).toThrow(/detLog/);
        expect(() => detLog(Infinity)).toThrow(/detLog/);
        expect(() => detTanh(Infinity)).toThrow(/detTanh/);
        expect(() => detTanh(NaN)).toThrow(/detTanh/);
    });
});

describe('det-math range reduction', () => {
    // A wrong pi/2 split stays inside the 1e-12 accuracy bound but drifts to about 1e-14 near 1e6; the fdlibm split
    // keeps every argument within a few ulps.
    it('keeps sin and cos within 1e-15 of Math at large arguments', () => {
        let worst = 0;
        for (let i = 1; i <= 2000; i++) {
            const x = (i % 2 === 0 ? 1 : -1) * 500 * i;
            worst = Math.max(worst, Math.abs(detSin(x) - Math.sin(x)), Math.abs(detCos(x) - Math.cos(x)));
        }
        expect(worst).toBeLessThan(1e-15);
    });
});
