// The first tick the after-burn-in metrics count, re-exported from the sim (which needs it for the input-activity
// sample). A leaf module so the scene detectors can read it without importing the observer, which imports the metrics
// that import them.

export { BURN_IN_TICKS } from '../sim/burn-in.js';
