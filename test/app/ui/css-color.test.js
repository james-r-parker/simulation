import { describe, expect, it } from 'vitest';
import { assignSlots, createFamilySlots } from '../../../js/app/family-slots.js';
import { FAMILY_PALETTES, NEUTRAL_FAMILY } from '../../../js/app/renderer/colors.js';
import { BORN_CAUSES, DEATH_CAUSES } from '../../../js/sim/events.js';
import {
    CAUSE_CSS,
    causeCss,
    familyCss,
    NEUTRAL_CSS,
    rgbCss,
    SPEC_CSS,
    specCss,
} from '../../../js/app/ui/css-color.js';
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

    it('reads a flow series colour from the cause lists, and a series that names no cause from the palette', () => {
        expect(causeCss('born.mate', 0)).toBe(BORN_CAUSES[1].colour);
        expect(causeCss('died.old age', 3)).toBe(DEATH_CAUSES[3].colour);
        expect(causeCss('died.disease', 6)).toBe(DEATH_CAUSES[0].colour);
        expect(causeCss('died.unknown', 8)).toBe(CAUSE_CSS[8 % CAUSE_CSS.length]);
    });

    it('keeps the six palette colours the charts drew from before the lists carried them', () => {
        expect(CAUSE_CSS).toEqual(['#5ee6a8', '#6cc6ff', '#ffb454', '#ff5d73', '#b48cff', '#8a9bb0']);
    });
});
