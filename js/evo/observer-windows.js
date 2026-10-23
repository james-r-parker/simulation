// Cumulative intent totals at the ends of equal windows after burn-in, for the trend metrics. A window's value is the
// difference of two snapshots. The snapshot columns are allocated once at `createWindows`; `noteWindows` only writes
// into them, and only at the 9 boundary ticks of a run (burn-in, then each window end).

import { BURN_IN_TICKS } from './observer-events.js';

/** Windows the span from burn-in to the run end is cut into. */
export const WINDOW_COUNT = 8;

/** The cumulative totals snapshotted at each boundary, as `[source, field]`. */
export const WINDOW_FIELDS = Object.freeze([
    ['run', 'foodDeliberate'],
    ['run', 'foodChance'],
    ['run', 'huntKillsDeliberate'],
    ['combat', 'huntKills'],
    ['run', 'escapedResponded'],
    ['combat', 'escapedEpisodes'],
    ['combat', 'hunterAgentTicks'],
]);

/**
 * @param {number} runTicks the run length in ticks; 0, or at most `BURN_IN_TICKS`, leaves the windows empty
 * @returns {Record<string, any>} the window state: boundary ticks, the filled count and one snapshot row per boundary
 */
export function createWindows(runTicks) {
    const enabled = runTicks > BURN_IN_TICKS;
    const boundaries = new Float64Array(enabled ? WINDOW_COUNT + 1 : 0);
    for (let k = 0; k < boundaries.length; k++) {
        boundaries[k] = BURN_IN_TICKS + Math.ceil((k * (runTicks - BURN_IN_TICKS)) / WINDOW_COUNT);
    }
    return {
        runTicks,
        boundaries,
        filled: 0,
        snapshots: new Float64Array(boundaries.length * WINDOW_FIELDS.length),
    };
}

/**
 * Snapshots the totals when the tick reaches the next boundary. Per tick it is one comparison; no allocation.
 * @param {Record<string, any>} windows the window state
 * @param {Record<string, any>} observer the observer
 * @param {number} tick the tick just observed
 * @returns {void}
 */
export function noteWindows(windows, observer, tick) {
    const { boundaries, snapshots } = windows;
    while (windows.filled < boundaries.length && tick >= boundaries[windows.filled]) {
        const base = windows.filled * WINDOW_FIELDS.length;
        for (let f = 0; f < WINDOW_FIELDS.length; f++) {
            const [source, field] = WINDOW_FIELDS[f];
            snapshots[base + f] = source === 'run' ? observer.intent.run[field] : observer.combat[field];
        }
        windows.filled += 1;
    }
}

/**
 * @param {Record<string, any>} windows the window state
 * @param {number} k the window, 0 to `WINDOW_COUNT - 1`
 * @param {number} f a column of `WINDOW_FIELDS`
 * @returns {number} the field's growth over window `k`
 */
export function windowDelta(windows, k, f) {
    const width = WINDOW_FIELDS.length;
    return windows.snapshots[(k + 1) * width + f] - windows.snapshots[k * width + f];
}

/**
 * @param {Record<string, any>} windows the window state
 * @returns {boolean} whether every boundary was reached, so the run reached its end
 */
export function windowsComplete(windows) {
    return windows.boundaries.length > 0 && windows.filled === windows.boundaries.length;
}
