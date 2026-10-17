// The seeds a metric needs before `compareReports` gives a verdict on it. Pure data and one lookup.

/** The seed minimum for a metric with no entry in `METRIC_MIN_SEEDS`. */
export const DEFAULT_MIN_SEEDS = 16;

/**
 * Metrics whose per-seed values are too noisy for 16 seeds: counts of rare episodes, lineage counts and a
 * coefficient of variation. Each needs 32 seeds.
 */
export const METRIC_MIN_SEEDS = Object.freeze({
    'eval.floor_episodes': 32,
    'eval.lineages_alive': 32,
    'eval.lineage_turnover': 32,
    'eval.predator_share_cv': 32,
});

/**
 * @param {string} metric a metric name
 * @returns {number} the fewest seeds a verdict on it needs: its `METRIC_MIN_SEEDS` entry, else `DEFAULT_MIN_SEEDS`
 */
export function minSeedsFor(metric) {
    return Object.hasOwn(METRIC_MIN_SEEDS, metric)
        ? METRIC_MIN_SEEDS[/** @type {keyof typeof METRIC_MIN_SEEDS} */ (metric)]
        : DEFAULT_MIN_SEEDS;
}
