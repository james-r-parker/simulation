// Wall-clock pacing for the sim worker: ticks owed at the requested rate, the slice cap, the drop rule, the delay to
// the next slice and the minimum gap between snapshots. Pure over the clock values it is given.

/** The most ticks one slice runs. */
export const MAX_TICKS_PER_SLICE = 8;

/** The least wall time, in ms, between two snapshots. */
export const SNAPSHOT_GAP_MS = 8;

/**
 * @typedef {object} Pacer
 * @property {number} maxTicksPerSlice ticks one slice runs at most
 * @property {number} snapshotGapMs wall time between snapshots, at least
 * @property {number} owed ticks owed and not yet run; fractional
 * @property {number} last the clock value of the last `ticksDue` or `restartClock`; NaN before the first
 * @property {number} dropped ticks given up because more than two slices were owed
 * @property {number} lastSnapshot the clock value of the last `markSnapshot`
 */

/**
 * @param {{maxTicksPerSlice?: number, snapshotGapMs?: number}} [options] the slice cap and the snapshot gap
 * @returns {Pacer} a pacer owing nothing
 */
export function createPacer({ maxTicksPerSlice = MAX_TICKS_PER_SLICE, snapshotGapMs = SNAPSHOT_GAP_MS } = {}) {
    return { maxTicksPerSlice, snapshotGapMs, owed: 0, last: NaN, dropped: 0, lastSnapshot: -Infinity };
}

/**
 * Forgets the time that passed while nothing ran (paused, or before the first slice) so it is not paid back as a burst.
 * @param {Pacer} pacer the pacer
 * @param {number} now the clock, in ms
 * @returns {void}
 */
export function restartClock(pacer, now) {
    pacer.last = now;
    pacer.owed = 0;
}

/**
 * Adds the time since the last call to the ticks owed, drops what exceeds two slices' worth and takes up to one
 * slice's worth to run now.
 * @param {Pacer} pacer the pacer
 * @param {number} now the clock, in ms
 * @param {number} ticksPerSecond the requested rate
 * @returns {number} the whole ticks to run in this slice, 0 to `maxTicksPerSlice`
 */
export function ticksDue(pacer, now, ticksPerSecond) {
    if (Number.isNaN(pacer.last)) {
        pacer.last = now;
    }
    pacer.owed += ((now - pacer.last) * ticksPerSecond) / 1000;
    pacer.last = now;
    const cap = 2 * pacer.maxTicksPerSlice;
    if (pacer.owed > cap) {
        pacer.dropped += pacer.owed - cap;
        pacer.owed = cap;
    }
    const run = Math.min(Math.floor(pacer.owed), pacer.maxTicksPerSlice);
    pacer.owed -= run;
    return run;
}

/**
 * @param {Pacer} pacer the pacer, after `ticksDue`
 * @param {number} ticksPerSecond the requested rate
 * @returns {number} 0 when a whole tick is still owed (post the next slice at once), else the ms until one is due
 */
export function nextDelay(pacer, ticksPerSecond) {
    return pacer.owed >= 1 ? 0 : ((1 - pacer.owed) * 1000) / ticksPerSecond;
}

/**
 * @param {Pacer} pacer the pacer
 * @param {number} now the clock, in ms
 * @returns {boolean} whether at least `snapshotGapMs` have passed since the last `markSnapshot`
 */
export function snapshotDue(pacer, now) {
    return now - pacer.lastSnapshot >= pacer.snapshotGapMs;
}

/**
 * Records that a snapshot was posted.
 * @param {Pacer} pacer the pacer
 * @param {number} now the clock, in ms
 * @returns {void}
 */
export function markSnapshot(pacer, now) {
    pacer.lastSnapshot = now;
}
