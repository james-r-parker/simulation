import { describe, expect, it } from 'vitest';
import {
    FAMILY_PALETTES,
    familyColor,
    lineageColor,
    temperatureBands,
    temperatureColor,
} from '../../../js/app/renderer/colors.js';
import { floraColor } from '../../../js/app/renderer/flora-colors.js';
import { herdColor } from '../../../js/app/renderer/herd-colors.js';
import {
    FILL_SHARE,
    NEON,
    NEON_LIGHTNESS,
    RIM_PX,
    roleColor,
    SPEC_ROLE,
    toDisplay,
} from '../../../js/app/renderer/palette.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';

/** @param {ArrayLike<number>} c display RGB @returns {number} HSL lightness */
const lightness = (c) => (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 2;

/** @param {ArrayLike<number>} c RGB @returns {number} hue 0 to 1, NaN for grey */
function hue(c) {
    const max = Math.max(c[0], c[1], c[2]);
    const d = max - Math.min(c[0], c[1], c[2]);
    if (d < 1e-6) {
        return NaN;
    }
    const h = max === c[0] ? (c[1] - c[2]) / d : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    return (h / 6 + 1) % 1;
}

describe('palette', () => {
    it('keeps the background exactly black and every role in 0 to 1', () => {
        expect(NEON.background).toEqual([0, 0, 0]);
        for (const [role, c] of Object.entries(NEON)) {
            for (const v of c) {
                expect(v, role).toBeGreaterThanOrEqual(0);
                expect(v, role).toBeLessThanOrEqual(1);
            }
        }
    });

    it('maps every specialisation to a role and fails loudly on an unknown role', () => {
        for (const role of Object.values(SPEC_ROLE)) {
            expect(roleColor(/** @type {any} */ (role))).toHaveLength(3);
        }
        expect(() => roleColor(/** @type {any} */ ('nope'))).toThrow(/unknown role/);
    });

    it('has rim and fill settings for every family palette', () => {
        for (const name of Object.keys(FAMILY_PALETTES)) {
            expect(RIM_PX[/** @type {keyof typeof RIM_PX} */ (name)]).toBeGreaterThan(1);
            expect(FILL_SHARE[/** @type {keyof typeof FILL_SHARE} */ (name)]).toBeGreaterThan(0.1);
        }
    });
});

describe('toDisplay', () => {
    it('lifts a dim linear colour to the neon lightness at the same hue, clamped to 0 to 1', () => {
        const out = toDisplay([0.02, 0.01, 0]);
        expect(lightness(out)).toBeCloseTo(NEON_LIGHTNESS, 5);
        expect(hue(out)).toBeCloseTo(hue([1, Math.pow(0.5, 1 / 2.4) * 1.055 - 0.055, 0]), 2);
        out.forEach((v) => expect(v).toBeLessThanOrEqual(1));
    });

    it('normalises an over-1 colour and keeps grey grey and black black', () => {
        const hot = toDisplay([3, 0, 0]);
        expect(hot[0]).toBeGreaterThan(hot[1]);
        expect(hot[1]).toBeCloseTo(hot[2]);
        const grey = toDisplay([0.2, 0.2, 0.2]);
        expect(grey[0]).toBeCloseTo(NEON_LIGHTNESS);
        expect(grey[1]).toBeCloseTo(NEON_LIGHTNESS);
        expect(toDisplay([0, 0, 0])).toEqual([0, 0, 0]);
    });

    it('converts every kept colour source and family palette into the display range', () => {
        const sources = [
            lineageColor(7),
            floraColor(0.3, [0, 0, 0]),
            herdColor(2),
            temperatureColor(
                0.9,
                temperatureBands({
                    temperatureMax: 1,
                    temperatureColdStress: 0.2,
                    temperatureOptimalMin: 0.4,
                    temperatureOptimalMax: 0.6,
                    temperatureHeatStress: 0.8,
                }),
            ),
            ...Object.keys(FAMILY_PALETTES).map((p) => familyColor(createFamilySlots(p), 1, 1)),
        ];
        for (const c of sources) {
            const out = toDisplay(c);
            expect(lightness(out)).toBeCloseTo(NEON_LIGHTNESS, 4);
        }
    });

    it('may write in place', () => {
        const c = [0.1, 0.2, 0.05];
        expect(toDisplay(c, c)).toBe(c);
    });
});

describe('toDisplay at a dark lightness', () => {
    it('lifts to any lightness asked for, below half as well as above', () => {
        const out = toDisplay([0.3, 0.1, 0], [0, 0, 0], 0.3);
        expect(lightness(out)).toBeCloseTo(0.3, 4);
    });
});
