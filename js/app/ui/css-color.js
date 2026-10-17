// CSS colours for the DOM: a lineage's hue as an `hsl()` string, and fixed colours for the specialisations and the
// causes the charts draw. The renderer's linear colours are for shaders; these match their hues for the page.

import { slotOf } from '../family-slots.js';
import { FAMILY_PALETTES, NEUTRAL_FAMILY } from '../renderer/colors.js';

/** Specialisation colours for lines and icons. */
export const SPEC_CSS = Object.freeze({
    predator: '#ff5d73',
    forager: '#5ee6a8',
    reproducer: '#ffb454',
    scout: '#6cc6ff',
    defender: '#b48cff',
});

/** The colour of anything with no colour of its own. */
export const NEUTRAL_CSS = '#8a9bb0';

/** Cause colours, used in order for the births, deaths and combat bars. */
export const CAUSE_CSS = Object.freeze(['#5ee6a8', '#6cc6ff', '#ffb454', '#ff5d73', '#b48cff', '#8a9bb0']);

/**
 * @param {string} name a specialisation name
 * @returns {string} its colour, neutral for an unknown name
 */
export function specCss(name) {
    return /** @type {Record<string, string>} */ (SPEC_CSS)[name] ?? NEUTRAL_CSS;
}

/**
 * @param {ArrayLike<number>} linear a linear RGB colour
 * @returns {string} the colour as a CSS `rgb()` string (sRGB encoded)
 */
export function rgbCss(linear) {
    const encode = (/** @type {number} */ c) => {
        const v = Math.min(Math.max(c, 0), 1);
        return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    };
    return `rgb(${encode(linear[0])}, ${encode(linear[1])}, ${encode(linear[2])})`;
}

/**
 * @param {import('../family-slots.js').FamilySlots} slots the family colour slots and the palette
 * @param {number} lineageId a lineage id
 * @returns {string} the family's colour as CSS: its slot's colour, or the neutral colour for a family with no slot
 */
export function familyCss(slots, lineageId) {
    const slot = slotOf(slots, lineageId);
    return rgbCss(slot >= 0 ? FAMILY_PALETTES[slots.palette][slot] : NEUTRAL_FAMILY[slots.palette]);
}
