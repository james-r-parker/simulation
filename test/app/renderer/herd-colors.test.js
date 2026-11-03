import { describe, expect, it } from 'vitest';
import { herdColor } from '../../../js/app/renderer/herd-colors.js';
import { BRIGHTNESS_FLOOR, RIM_GAIN } from '../../../js/app/renderer/agents-shader.js';
import {
    AURORA_MAX_LUMINANCE,
    ENERGY_FLOOR,
    HERD_FILL_SHARE,
    HERD_RIM_LUMINANCE,
    NEUTRAL_FAMILY,
    PALETTE,
    SCENERY_MAX_LUMINANCE,
} from '../../../js/app/renderer/colors.js';
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

    it('draws every group at the herd outline luminance, above the scenery and below the dimmest agent membrane', () => {
        // An agent's brightest pixel is on its outline: the full fill (1.0) at half cover plus the membrane line.
        const dimmestMembrane = Math.min(
            ...Object.values(NEUTRAL_FAMILY).map((neutral) =>
                luminance(neutral.map((c) => c * ENERGY_FLOOR * BRIGHTNESS_FLOOR * (0.5 + RIM_GAIN))),
            ),
        );
        const herdPeak = HERD_RIM_LUMINANCE * (1 + 0.5 * HERD_FILL_SHARE);
        expect(HERD_RIM_LUMINANCE * HERD_FILL_SHARE).toBeGreaterThan(AURORA_MAX_LUMINANCE + SCENERY_MAX_LUMINANCE);
        expect(herdPeak).toBeLessThan(dimmestMembrane);
        for (let group = 0; group < 4; group++) {
            expect(luminance(herdColor(group))).toBeCloseTo(HERD_RIM_LUMINANCE, 6);
        }
    });

    it('keeps the four group tones apart from each other', () => {
        for (let a = 0; a < 4; a++) {
            for (let b = a + 1; b < 4; b++) {
                expect(colorDistance(herdColor(a), herdColor(b)), `groups ${a} and ${b}`).toBeGreaterThanOrEqual(10);
            }
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
