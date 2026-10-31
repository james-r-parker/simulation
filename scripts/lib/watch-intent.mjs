// Flora's species shares and seasonal diet shift use the default higher direction.
// The direction a `watch` metric would count as better if it earned one. `eval:power --include-watch` uses it to plant
// the change in the right direction when it measures a `watch` metric's detectable change. It is not a verdict
// direction: `DIRECTIONS` in `js/evo/compare.js` is. A `watch` metric not listed here is treated as `higher`.

/** `watch` metrics whose intended direction is lower (fewer stressed agents, fewer unseen bites, a more even sex ratio, a smaller energy bank, fewer given-up chases, fewer lineages that never cross the wall). */
export const WATCH_INTENDED_LOWER = new Set([
    'eval.heat_stress_share',
    'eval.toxic_death_share',
    'eval.sick_share',
    'eval.unseen_bite_share',
    'eval.sex_balance',
    'eval.chance_food_per_1k',
    'eval.mean_energy_share',
    'eval.energy_over_split',
    'eval.chase_giveup_share',
    'eval.gap_never_share',
]);

/**
 * @param {string} metric a `watch` metric name
 * @returns {'higher' | 'lower'} the direction used for its planted change
 */
export function intendedDirection(metric) {
    return WATCH_INTENDED_LOWER.has(metric) ? 'lower' : 'higher';
}
