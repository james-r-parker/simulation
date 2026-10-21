import { describe, expect, it } from 'vitest';
import { assignSlots, createFamilySlots } from '../../../js/app/family-slots.js';
import {
    familyColor,
    familyName,
    FAMILY_PALETTES,
    NEUTRAL_FAMILY,
    PALETTE,
    temperatureBands,
    temperatureColor,
    temperatureRamp,
} from '../../../js/app/renderer/colors.js';
import { ciede2000, colorDistance, MACHADO, toLab } from './helpers/color-metrics.js';

const bands = { cold: 0.3, optimalMin: 0.4, optimalMax: 0.65, heat: 0.85 };

describe('PALETTE', () => {
    it('holds linear triples, the background is black, and the doc colours are exact', () => {
        for (const rgb of Object.values(PALETTE)) {
            expect(rgb).toHaveLength(3);
            expect(rgb.every((v) => v >= 0 && v <= 1)).toBe(true);
        }
        expect(PALETTE.background).toEqual([0, 0, 0]);
        expect(PALETTE.food).toEqual([0.35, 0.9, 0.7]);
        expect(PALETTE.huntScent).toEqual([1.0, 0.74, 0.2]);
        expect(PALETTE.dangerScent).toEqual([0.75, 0.03, 0.04]);
        expect(PALETTE.attackScent).toEqual([0.5, 0.18, 1.0]);
        expect(PALETTE.smoke).toEqual([0.03, 0.04, 0.06]);
        expect(PALETTE.obstacleBody).toEqual([0.012, 0.016, 0.024]);
        expect(PALETTE.obstacleRim).toEqual([0.09, 0.12, 0.18]);
    });
});

/** The colours the families must stay apart from: food, the three scents, the alarm and the eaten reds. */
const SEMANTIC = {
    food: PALETTE.food,
    huntScent: PALETTE.huntScent,
    dangerScent: PALETTE.dangerScent,
    attackScent: PALETTE.attackScent,
    alarm: PALETTE.alarmRing,
    eaten: PALETTE.eatenFlash,
};

describe('meat', () => {
    it('is told from plant food by at least 30, and by 15 under each colour-vision simulation', () => {
        expect(colorDistance(PALETTE.meat, PALETTE.food)).toBeGreaterThanOrEqual(30);
        for (const [kind, matrix] of Object.entries(MACHADO)) {
            expect(colorDistance(PALETTE.meat, PALETTE.food, matrix), kind).toBeGreaterThanOrEqual(15);
        }
    });
});

const CVD = Object.entries(MACHADO);

describe('ciede2000', () => {
    it('matches the published reference pairs (Sharma, Wu and Dalal, 2005)', () => {
        const pairs = [
            [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
            [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
            [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
            [[50, 2.5, 0], [73, 25, -18], 27.1492],
            [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
        ];
        for (const [a, b, expected] of pairs) {
            expect(ciede2000(/** @type {any} */ (a), /** @type {any} */ (b))).toBeCloseTo(
                /** @type {number} */ (expected),
                3,
            );
        }
    });

    it('puts white at L 100 and black at 0, and a colour at zero distance from itself', () => {
        expect(toLab([1, 1, 1])[0]).toBeCloseTo(100, 1);
        expect(toLab([0, 0, 0])[0]).toBe(0);
        expect(colorDistance([0.3, 0.5, 0.7], [0.3, 0.5, 0.7])).toBe(0);
    });
});

describe('FAMILY_PALETTES', () => {
    it('has three palettes of eight linear colours, and a neutral colour for each', () => {
        expect(Object.keys(FAMILY_PALETTES).sort()).toEqual(['cvd-safe', 'default', 'high-contrast']);
        for (const [name, colors] of Object.entries(FAMILY_PALETTES)) {
            expect(colors, name).toHaveLength(8);
            for (const rgb of colors) {
                expect(rgb.every((v) => v >= 0 && v <= 1)).toBe(true);
            }
            expect(NEUTRAL_FAMILY[name]).toHaveLength(3);
        }
    });

    for (const [name, colors] of Object.entries(FAMILY_PALETTES)) {
        const normal = 15;
        const deficient = name === 'cvd-safe' ? 20 : 10;

        it(`${name}: every pair of slots is at least ${normal} apart, and ${deficient} under each colour-vision simulation`, () => {
            for (let i = 0; i < colors.length; i++) {
                for (let j = i + 1; j < colors.length; j++) {
                    expect(colorDistance(colors[i], colors[j]), `${i}-${j}`).toBeGreaterThanOrEqual(normal);
                    for (const [kind, matrix] of CVD) {
                        expect(colorDistance(colors[i], colors[j], matrix), `${i}-${j} ${kind}`).toBeGreaterThanOrEqual(
                            deficient,
                        );
                    }
                }
            }
        });

        it(`${name}: every slot clears the semantic colours by 15, and by 10 under each simulation`, () => {
            colors.forEach((slot, i) => {
                for (const [what, semantic] of Object.entries(SEMANTIC)) {
                    expect(colorDistance(slot, semantic), `slot ${i} vs ${what}`).toBeGreaterThanOrEqual(15);
                    for (const [kind, matrix] of CVD) {
                        expect(
                            colorDistance(slot, semantic, matrix),
                            `slot ${i} vs ${what} ${kind}`,
                        ).toBeGreaterThanOrEqual(10);
                    }
                }
            });
        });
    }
});

describe('familyColor', () => {
    /** @returns {ReturnType<typeof createFamilySlots>} slots where family 7 holds slot 0 and family 8 slot 1 */
    function slots() {
        const s = createFamilySlots();
        assignSlots(s, [{ id: 7 }, { id: 8 }]);
        return s;
    }

    it('gives a family its slot colour at full energy and the neutral colour when it has no slot', () => {
        expect(Array.from(familyColor(slots(), 8, 1))).toEqual(Array.from(FAMILY_PALETTES.default[1]));
        expect(Array.from(familyColor(slots(), 99, 1))).toEqual(Array.from(NEUTRAL_FAMILY.default));
    });

    it('follows the palette the slots name', () => {
        const s = slots();
        s.palette = 'cvd-safe';
        expect(Array.from(familyColor(s, 7, 1))).toEqual(Array.from(FAMILY_PALETTES['cvd-safe'][0]));
    });

    it('dims a little at low energy, clamps energy and fills the array it is given', () => {
        const s = slots();
        const lum = (/** @type {ArrayLike<number>} */ c) => c[0] + c[1] + c[2];
        expect(lum(familyColor(s, 7, 1))).toBeGreaterThan(lum(familyColor(s, 7, 0)));
        expect(lum(familyColor(s, 7, 0))).toBeGreaterThan(0.8 * lum(familyColor(s, 7, 1)));
        expect(familyColor(s, 7, 5)).toEqual(familyColor(s, 7, 1));
        expect(familyColor(s, 7, -2)).toEqual(familyColor(s, 7, 0));
        const out = new Float32Array(3);
        expect(familyColor(s, 8, 0.4, out)).toBe(out);
    });
});

describe('temperatureColor', () => {
    it('is deep blue at and below cold stress, cool white across the optimal band, orange at heat stress and above', () => {
        expect(temperatureColor(0, bands)).toEqual(PALETTE.coldWater);
        expect(temperatureColor(bands.cold, bands)).toEqual(PALETTE.coldWater);
        expect(temperatureColor(0.5, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.optimalMin, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.optimalMax, bands)).toEqual(PALETTE.coolWhite);
        expect(temperatureColor(bands.heat, bands)).toEqual(PALETTE.heat);
        expect(temperatureColor(1, bands)).toEqual(PALETTE.heat);
    });

    it('blends between the bands', () => {
        const mid = temperatureColor(0.35, bands);
        expect(mid[2]).toBeGreaterThan(PALETTE.coolWhite[2] - 0.5);
        expect(mid[0]).toBeCloseTo((PALETTE.coldWater[0] + PALETTE.coolWhite[0]) / 2, 6);
    });

    it('reads the bands from ready.info as shares of the maximum', () => {
        const b = temperatureBands({
            temperatureMax: 100,
            temperatureColdStress: 30,
            temperatureOptimalMin: 40,
            temperatureOptimalMax: 65,
            temperatureHeatStress: 85,
        });
        expect(b).toEqual({ cold: 0.3, optimalMin: 0.4, optimalMax: 0.65, heat: 0.85 });
    });

    it('fills a ramp whose first and last texels are the ends', () => {
        const ramp = temperatureRamp(bands, new Float32Array(64 * 4));
        expect(Array.from(ramp.slice(0, 3))).toEqual(Array.from(Float32Array.from(PALETTE.coldWater)));
        expect(Array.from(ramp.slice(63 * 4, 63 * 4 + 3))).toEqual(Array.from(Float32Array.from(PALETTE.heat)));
        expect(ramp[3]).toBe(1);
    });
});

describe('familyName', () => {
    it('is a pronounceable name that is the same for a seed and a lineage every time', () => {
        expect(familyName(3, 12)).toBe(familyName(3, 12));
        expect(familyName(3, 12)).toMatch(/^[A-Z][a-z]{5}$/);
    });

    it('differs between seeds and between lineages', () => {
        expect(familyName(3, 12)).not.toBe(familyName(4, 12));
        const names = new Set(Array.from({ length: 300 }, (_, i) => familyName(3, i)));
        expect(names.size).toBeGreaterThanOrEqual(295);
    });
});
