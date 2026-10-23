// The direction a `watch` metric would count as better if it earned one. `eval:power --include-watch` uses it to plant
// the change in the right direction when it measures a `watch` metric's detectable change. It is not a verdict
// direction: `DIRECTIONS` in `js/evo/compare.js` is. A `watch` metric not listed here is treated as `higher`.

/** `watch` metrics whose intended direction is lower (fewer stressed agents, fewer unseen bites, a more even sex ratio). */
export const WATCH_INTENDED_LOWER = new Set(['eval.heat_stress_share', 'eval.unseen_bite_share', 'eval.sex_balance']);

/**
 * @param {string} metric a `watch` metric name
 * @returns {'higher' | 'lower'} the direction used for its planted change
 */
export function intendedDirection(metric) {
    return WATCH_INTENDED_LOWER.has(metric) ? 'lower' : 'higher';
}
