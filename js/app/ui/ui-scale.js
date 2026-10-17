// The HUD's size. Every HUD length is in `rem`, so the root font size scales it all; this module chooses that size from
// the `uiScale` preference and the canvas width, so a 4K panel draws type a person can read from a sofa.

/** The preference values: `auto`, or a fixed factor. */
export const UI_SCALES = Object.freeze(['auto', 1, 1.25, 1.5, 2]);

/** The root font size at scale 1, in CSS px. */
export const BASE_FONT_PX = 16;

/**
 * @param {number} canvasWidth the canvas width in CSS px
 * @returns {number} the automatic factor: the width over 1920, kept between 1 and 2 and rounded down to a multiple of 0.25
 */
export function autoScale(canvasWidth) {
    const raw = Math.min(Math.max(canvasWidth / 1920, 1), 2);
    return Math.floor(raw * 4) / 4;
}

/**
 * @param {number} canvasWidth the canvas width in CSS px
 * @param {string | number} pref the `uiScale` preference; anything else counts as `auto`
 * @returns {number} the root font size in CSS px: 16 times the factor
 */
export function uiScaleFor(canvasWidth, pref) {
    const factor = typeof pref === 'number' && UI_SCALES.includes(pref) ? pref : autoScale(canvasWidth);
    return BASE_FONT_PX * factor;
}
