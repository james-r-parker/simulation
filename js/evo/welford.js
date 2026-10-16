// Welford's running mean and variance, kept in a Float64Array as a [n, mean, m2] triple at an offset, so many
// accumulators share one preallocated array and adding a value allocates nothing.

/** Floats one accumulator takes: `n`, `mean`, `m2` (sum of squared deviations). */
export const WELFORD_STRIDE = 3;

/**
 * Adds one value to the accumulator at `offset`.
 * @param {Float64Array} stats the backing array
 * @param {number} offset index of the accumulator's `n`
 * @param {number} x the value
 * @returns {void}
 */
export function welfordAdd(stats, offset, x) {
    const n = stats[offset] + 1;
    const delta = x - stats[offset + 1];
    const mean = stats[offset + 1] + delta / n;
    stats[offset] = n;
    stats[offset + 1] = mean;
    stats[offset + 2] += delta * (x - mean);
}

/**
 * @param {Float64Array} stats the backing array
 * @param {number} offset index of the accumulator's `n`
 * @returns {number} the mean, 0 when no value was added
 */
export function welfordMean(stats, offset) {
    return stats[offset] === 0 ? 0 : stats[offset + 1];
}

/**
 * @param {Float64Array} stats the backing array
 * @param {number} offset index of the accumulator's `n`
 * @returns {number} the sample standard deviation (divides by n - 1), 0 when fewer than two values
 */
export function welfordSd(stats, offset) {
    const n = stats[offset];
    return n < 2 ? 0 : Math.sqrt(Math.max(0, stats[offset + 2]) / (n - 1));
}
