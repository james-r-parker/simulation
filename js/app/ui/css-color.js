// CSS colours for the DOM: a lineage's hue as an `hsl()` string, and fixed colours for the specialisations and the
// causes the charts draw. The renderer's linear colours are for shaders; these match their hues for the page.

import { lineageHue } from '../renderer/colors.js';

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
 * @param {number} lineageId a lineage id
 * @returns {string} the lineage's colour: its hue at the renderer's saturation and a mid lightness
 */
export function lineageCss(lineageId) {
    return `hsl(${Math.round(lineageHue(lineageId) * 360)} 70% 56%)`;
}
