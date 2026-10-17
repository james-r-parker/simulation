// The canvas size in device pixels, from a `ResizeObserver` entry.

/** The device pixel ratio is capped here: beyond it the cost grows and nothing is gained. */
export const MAX_PIXEL_RATIO = 2;

/**
 * @param {{devicePixelContentBoxSize?: ArrayLike<{inlineSize: number, blockSize: number}>}} entry the observer entry
 * @param {{clientWidth: number, clientHeight: number}} element the observed element
 * @param {number} devicePixelRatio `window.devicePixelRatio`
 * @returns {{width: number, height: number}} the size in device pixels: the entry's `devicePixelContentBoxSize` when it
 *   has one (exact, no rounding), else the client size times the ratio capped at 2, rounded; at least 1 x 1
 */
export function canvasPixelSize(entry, element, devicePixelRatio) {
    const box = entry.devicePixelContentBoxSize?.[0];
    if (box !== undefined && box.inlineSize > 0 && box.blockSize > 0) {
        return { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) };
    }
    const ratio = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_PIXEL_RATIO);
    return {
        width: Math.max(1, Math.round(element.clientWidth * ratio)),
        height: Math.max(1, Math.round(element.clientHeight * ratio)),
    };
}
