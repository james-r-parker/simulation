// Small easing curves shared by the smoke, ring and spark code.

/**
 * @param {number} t 0 to 1
 * @returns {number} a cubic ease-out: fast at first, settling at 1
 */
export function easeOut(t) {
    const u = 1 - t;
    return 1 - u * u * u;
}

/**
 * @param {number} edge0 the value where the curve leaves 0
 * @param {number} edge1 the value where it reaches 1
 * @param {number} x the input
 * @returns {number} the Hermite smooth step of `x` between the edges, clamped to 0..1
 */
export function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}
