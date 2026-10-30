import { describe, expect, it } from 'vitest';
import { RIBBON_GLSL, ribbonCentre } from '../../../js/app/renderer/aurora-ribbon.js';
import { auroraPhase } from '../../../js/app/renderer/aurora-tint.js';

const COLUMNS = 51;

/**
 * @param {number} index the ribbon
 * @param {number} t seconds
 * @param {number} u position across the canvas
 * @returns {number} the centre line's height at that time
 */
function centreAt(index, t, u) {
    return ribbonCentre(u, index, auroraPhase(t)[index]);
}

describe('ribbonCentre', () => {
    it('stays on the canvas, in order, for every ribbon over ten minutes', () => {
        for (let t = 0; t <= 600; t += 7) {
            for (let u = 0; u <= 1; u += 0.05) {
                const c = [0, 1, 2].map((i) => centreAt(i, t, u));
                for (const h of c) {
                    expect(h).toBeGreaterThan(0.05);
                    expect(h).toBeLessThan(0.95);
                }
            }
        }
    });

    it('moves every ribbon by at least 0.5% of the canvas height per second on average over 60 s', () => {
        for (let index = 0; index < 3; index++) {
            let path = 0;
            for (let u = 0; u <= 1; u += 1 / (COLUMNS - 1)) {
                for (let t = 0; t < 60; t++) {
                    path += Math.abs(centreAt(index, t + 1, u) - centreAt(index, t, u));
                }
            }
            const perSecond = path / COLUMNS / 60;
            expect(perSecond, `ribbon ${index}`).toBeGreaterThanOrEqual(0.005);
        }
    });

    it('does not return to the same line within ten minutes', () => {
        for (let index = 0; index < 3; index++) {
            let same = 0;
            for (let u = 0; u <= 1; u += 0.1) {
                same += Math.abs(centreAt(index, 0, u) - centreAt(index, 600, u)) < 1e-3 ? 1 : 0;
            }
            expect(same).toBeLessThan(3);
        }
    });

    it('is the line the shader draws: the GLSL carries the same constants', () => {
        expect(RIBBON_GLSL).toContain('0.27');
        expect(RIBBON_GLSL).toContain('0.73');
        expect(RIBBON_GLSL).toContain('ribbonCentre');
    });
});
