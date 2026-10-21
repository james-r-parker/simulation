// The slow drift that keeps static HUD pixels from sitting on the same OLED cells: a Lissajous path of at most 4 px per
// axis with periods of 7 and 11 minutes. `pixelShiftAt` is the path; the view applies it rounded to whole pixels.

/** The most the offset reaches on each axis, in px. */
export const SHIFT_AMPLITUDE_PX = 4;
/** The periods of the two axes, in seconds. */
export const SHIFT_PERIODS_S = Object.freeze([7 * 60, 11 * 60]);

/**
 * @param {number} seconds time since the page started
 * @returns {{x: number, y: number}} the offset in px, not rounded
 */
export function pixelShiftAt(seconds) {
    const tau = 2 * Math.PI;
    return {
        x: SHIFT_AMPLITUDE_PX * Math.sin((tau * seconds) / SHIFT_PERIODS_S[0]),
        y: SHIFT_AMPLITUDE_PX * Math.sin((tau * seconds) / SHIFT_PERIODS_S[1] + Math.PI / 2),
    };
}

/**
 * Moves each node by the offset at `seconds`, rounded to whole pixels, writing only when the offset changed.
 * @param {{style: {transform: string}}[]} nodes the persistent nodes
 * @param {number} seconds time since the page started
 * @param {{x: number, y: number}} last the offset last written, updated
 * @returns {boolean} whether the nodes were rewritten
 */
export function applyPixelShift(nodes, seconds, last) {
    const { x, y } = pixelShiftAt(seconds);
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx === last.x && ry === last.y) {
        return false;
    }
    last.x = rx;
    last.y = ry;
    for (const node of nodes) {
        node.style.transform = rx === 0 && ry === 0 ? '' : `translate(${rx}px, ${ry}px)`;
    }
    return true;
}
