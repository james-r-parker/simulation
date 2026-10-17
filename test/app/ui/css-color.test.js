import { describe, expect, it } from 'vitest';
import { assignSlots, createFamilySlots } from '../../../js/app/family-slots.js';
import { FAMILY_PALETTES, NEUTRAL_FAMILY } from '../../../js/app/renderer/colors.js';
import { CAUSE_CSS, familyCss, NEUTRAL_CSS, rgbCss, SPEC_CSS, specCss } from '../../../js/app/ui/css-color.js';
import { ICON_PATHS } from '../../../js/app/ui/silhouette-icons.js';

describe('css colours', () => {
    it('has a colour for every silhouette, and neutral for an unknown name', () => {
        for (const name of Object.keys(ICON_PATHS)) {
            expect(specCss(name), name).toBe(/** @type {Record<string, string>} */ (SPEC_CSS)[name]);
        }
        expect(specCss('mystery')).toBe(NEUTRAL_CSS);
    });

    it('encodes linear RGB as sRGB', () => {
        expect(rgbCss([0, 0, 0])).toBe('rgb(0, 0, 0)');
        expect(rgbCss([1, 1, 1])).toBe('rgb(255, 255, 255)');
        expect(rgbCss([0.22, 0.22, 0.22])).toBe('rgb(129, 129, 129)');
        expect(rgbCss([2, -1, 0.5])).toBe('rgb(255, 0, 188)');
    });

    it('gives a family its slot colour in the palette in force, else the neutral colour', () => {
        const slots = createFamilySlots();
        assignSlots(slots, [{ id: 7 }]);
        expect(familyCss(slots, 7)).toBe(rgbCss(FAMILY_PALETTES.default[0]));
        expect(familyCss(slots, 8)).toBe(rgbCss(NEUTRAL_FAMILY.default));
        slots.palette = 'high-contrast';
        expect(familyCss(slots, 7)).toBe(rgbCss(FAMILY_PALETTES['high-contrast'][0]));
    });

    it('lists distinct cause colours', () => {
        expect(new Set(CAUSE_CSS).size).toBe(CAUSE_CSS.length);
    });
});
