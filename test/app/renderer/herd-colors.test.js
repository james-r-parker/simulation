import { describe, expect, it } from 'vitest';
import { herdColor } from '../../../js/app/renderer/herd-colors.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from '../../../js/app/renderer/colors.js';
import { colorDistance, luminance, MACHADO } from './helpers/color-metrics.js';

const ROCKS = [PALETTE.rockBody, PALETTE.rockRim, PALETTE.rockContact];
const SEMANTIC = [PALETTE.food, PALETTE.alarmRing, PALETTE.eatenFlash];

describe('herdColor', () => {
    it('cycles through four stable earth tones and reuses the output array', () => {
        const out = [0, 0, 0];
        expect(herdColor(4, out)).toBe(out);
        expect(out).toEqual(herdColor(0));
        expect(herdColor(-1)).toEqual(herdColor(3));
        expect(new Set([0, 1, 2, 3].map((group) => herdColor(group).join(','))).size).toBe(4);
    });

    it('keeps every group within the scenery luminance ceiling', () => {
        for (let group = 0; group < 4; group++) {
            expect(luminance(herdColor(group))).toBeLessThanOrEqual(SCENERY_MAX_LUMINANCE + 1e-6);
        }
    });

    it('keeps herd colours distinct from rocks, food and alarm or eaten reds', () => {
        for (let group = 0; group < 4; group++) {
            const color = herdColor(group);
            for (const [index, reference] of [...ROCKS, ...SEMANTIC].entries()) {
                expect(colorDistance(color, reference), `group ${group}, reference ${index}`).toBeGreaterThanOrEqual(
                    15,
                );
            }
            for (const matrix of Object.values(MACHADO)) {
                for (const reference of SEMANTIC) {
                    expect(colorDistance(color, reference, matrix)).toBeGreaterThanOrEqual(10);
                }
            }
        }
    });
});
