// The director's schedule rules (docs/designs/ambient-display.md, "The director on air"): no shot shorter than the
// floor or longer than the ceiling, and a wide shot at least every ten minutes. Times are simulated seconds.

/** The shortest a shot (a glide and its linger) may be. */
export const SHOT_FLOOR_S = 6;
/** The longest a shot may be. */
export const SHOT_CEILING_S = 90;
/** The longest the camera may go without a wide shot. */
export const WIDE_MAX_GAP_S = 600;

/**
 * @param {number} shotElapsedS seconds since the shot began
 * @returns {boolean} whether an early exit (a moment that went quiet) is allowed yet
 */
export function floorReached(shotElapsedS) {
    return shotElapsedS >= SHOT_FLOOR_S - 1e-6;
}

/**
 * @param {number} shotElapsedS seconds since the shot began
 * @returns {boolean} whether the shot must end now
 */
export function ceilingReached(shotElapsedS) {
    return shotElapsedS >= SHOT_CEILING_S - 1e-6;
}

/**
 * @param {number} timeS the time now
 * @param {number} lastWideS when the last wide shot began
 * @returns {boolean} whether a close shot must end so a wide shot follows
 */
export function wideDue(timeS, lastWideS) {
    return timeS - lastWideS >= WIDE_MAX_GAP_S - 1e-6;
}
