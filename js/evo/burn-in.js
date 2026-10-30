// The first tick the after-burn-in metrics count. A leaf module so the scene detectors can read it without importing
// the observer, which imports the metrics that import them.

/** The first tick counted by the after-burn-in metrics. */
export const BURN_IN_TICKS = 10000;
