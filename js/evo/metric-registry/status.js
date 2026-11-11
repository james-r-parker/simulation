// The status of a registry entry and the two bars it rests on. Pure: no clock, no files.

/** Most seeds that may be `null` (share of seeds) for a metric to count as live. */
export const MAX_NULL_SHARE = 0.1;
/** Fewest distinct values a live metric takes over the seeds. */
export const MIN_DISTINCT = 2;
/** Largest false-positive rate a verdict tolerates. */
export const MAX_FPR = 0.1;
/** Largest detectable change, as a fraction of the reference mean. */
export const MAX_RELATIVE_MDE = 0.2;
/** Largest detectable change for a metric of unit `share`, absolute. */
export const MAX_SHARE_MDE = 0.05;
/** Largest detectable change for a `correlation` or `trend` metric, or one whose mean is near 0, absolute. */
export const MAX_ABSOLUTE_MDE = 0.1;
/** A reference mean within this of 0 uses the absolute bar. */
export const NEAR_ZERO_MEAN = 0.01;

/**
 * @param {import('./entry.js').Liveness} liveness the entry's liveness read
 * @returns {boolean} whether the metric is `null` on at most 10% of seeds and takes at least 2 values
 */
export function meetsLivenessBar(liveness) {
    return liveness.nullShare <= MAX_NULL_SHARE && liveness.distinct >= MIN_DISTINCT;
}

/**
 * @param {string} unit the entry's unit
 * @param {number} mde the detectable change: absolute for a `share` (T29a), else a fraction of `referenceMean`
 * @param {number} referenceMean the reference mean
 * @returns {boolean} whether the detectable change is within the bar for the unit: absolute 0.05 for `share`, absolute
 *   0.10 for `correlation`, `trend` or a mean within 0.01 of 0, else 0.20 of the mean
 */
function mdeWithinBar(unit, mde, referenceMean) {
    if (unit === 'share') {
        return mde <= MAX_SHARE_MDE;
    }
    const absolute = mde * Math.abs(referenceMean);
    if (unit === 'correlation' || unit === 'trend' || Math.abs(referenceMean) <= NEAR_ZERO_MEAN) {
        return absolute <= MAX_ABSOLUTE_MDE;
    }
    return mde <= MAX_RELATIVE_MDE;
}

/**
 * @param {{unit: string, power: import('./entry.js').Power}} entry the unit and the power read of an entry
 * @param {16 | 32 | 64} seeds the seed count per arm
 * @returns {boolean} whether the false-positive rate is at most 0.10 and the detectable change is within the bar for
 *   the unit at that seed count; `false` when either was not measured (`null`, or absent for 64)
 */
export function meetsPowerBar({ unit, power }, seeds) {
    const reading = { 16: [power.fpr16, power.mde16], 32: [power.fpr32, power.mde32], 64: [power.fpr64, power.mde64] };
    const [fpr = null, mde = null] = reading[seeds];
    if (fpr === null || mde === null) {
        return false;
    }
    return fpr <= MAX_FPR && mdeWithinBar(unit, mde, power.referenceMean);
}

/**
 * @param {{unit: string, power: import('./entry.js').Power}} entry the unit and the power read of an entry
 * @returns {16 | 32 | 64 | null} the fewest seeds per arm at which the power bar holds, or `null` when none does
 */
export function minSeedsFromPower(entry) {
    return /** @type {const} */ ([16, 32, 64]).find((seeds) => meetsPowerBar(entry, seeds)) ?? null;
}

/**
 * @param {import('./entry.js').MetricEntry} entry a registry entry
 * @returns {'verified' | 'unverified' | 'deprecated'} `deprecated` when `deprecated` is set; `verified` when both
 *   tests are named, liveness meets its bar or `expectedFlat` explains it, `power` is measured and `minSeeds` is not
 *   `null`; `unverified` otherwise
 */
export function metricStatus(entry) {
    if (entry.deprecated !== null) {
        return 'deprecated';
    }
    const { tests, liveness, expectedFlat, power, minSeeds } = entry;
    const live = liveness !== null && (expectedFlat !== null || meetsLivenessBar(liveness));
    const tested = tests.arithmetic !== '' && tests.source !== '';
    return tested && live && power !== null && minSeeds !== null ? 'verified' : 'unverified';
}
