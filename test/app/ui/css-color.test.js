import { describe, expect, it } from 'vitest';
import { lineageHue } from '../../../js/app/renderer/colors.js';
import { CAUSE_CSS, lineageCss, NEUTRAL_CSS, SPEC_CSS, specCss } from '../../../js/app/ui/css-color.js';
import { ICON_PATHS } from '../../../js/app/ui/silhouette-icons.js';

describe('css colours', () => {
    it('has a colour for every silhouette, and neutral for an unknown name', () => {
        for (const name of Object.keys(ICON_PATHS)) {
            expect(specCss(name), name).toBe(/** @type {Record<string, string>} */ (SPEC_CSS)[name]);
        }
        expect(specCss('mystery')).toBe(NEUTRAL_CSS);
    });

    it('gives a lineage the hue the renderer gives it', () => {
        const hue = Math.round(lineageHue(7) * 360);
        expect(lineageCss(7)).toBe(`hsl(${hue} 70% 56%)`);
        expect(lineageCss(7)).not.toBe(lineageCss(8));
    });

    it('lists distinct cause colours', () => {
        expect(new Set(CAUSE_CSS).size).toBe(CAUSE_CSS.length);
    });
});
