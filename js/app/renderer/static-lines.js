// The static lines of the world at a fixed camera: rocks, the wall column and the refuge rings. In TV mode they draw at
// `STATIC_LINE_DIM` of their brightness and drift a few device px on a slow Lissajous path, so no bright line sits on
// one OLED pixel for an hour (docs/designs/ambient-display.md, "A look that holds from across a room"). Pure.

/** The share of its brightness a static line keeps in TV mode. */
export const STATIC_LINE_DIM = 0.6;
/** The most the drift reaches on each axis, in device px. */
export const STATIC_SHIFT_PX = 3;
/** The periods of the two axes, in seconds: apart from the HUD's pixel shift (7 and 11 minutes). */
export const STATIC_SHIFT_PERIODS_S = Object.freeze([10 * 60, 14 * 60]);

/**
 * @param {boolean} tv whether TV mode is on
 * @returns {number} the brightness multiplier of the static lines
 */
export function staticLineDim(tv) {
    return tv ? STATIC_LINE_DIM : 1;
}

/**
 * @param {{tv: boolean, nowMs: number, zoom: number}} at TV mode, the wall time and the camera zoom (device px per world unit)
 * @param {{x: number, y: number}} out receives the offset in world units, zero outside TV mode
 * @returns {{x: number, y: number}} `out`
 */
export function staticLineShift({ tv, nowMs, zoom }, out) {
    if (!tv) {
        out.x = 0;
        out.y = 0;
        return out;
    }
    const tau = 2 * Math.PI;
    const seconds = nowMs / 1000;
    const scale = STATIC_SHIFT_PX / Math.max(zoom, 1e-6);
    out.x = scale * Math.sin((tau * seconds) / STATIC_SHIFT_PERIODS_S[0]);
    out.y = scale * Math.sin((tau * seconds) / STATIC_SHIFT_PERIODS_S[1] + Math.PI / 2);
    return out;
}
