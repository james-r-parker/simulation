// Small statistics and the metric result shape shared by the eval metric modules.

/** @typedef {{value: number | null, reason?: string}} MetricResult a metric's value, or `null` with the reason */

/**
 * @param {number} value a finite number
 * @returns {MetricResult} the value as a result
 */
export function ok(value) {
    return { value };
}

/**
 * @param {string} reason why the metric cannot be computed
 * @returns {MetricResult} a `null` result carrying the reason
 */
export function none(reason) {
    return { value: null, reason };
}

/**
 * @param {ArrayLike<number>} values at least one value
 * @returns {number} the arithmetic mean
 */
export function mean(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum / values.length;
}

/**
 * The population standard deviation (divisor n).
 * @param {ArrayLike<number>} values at least one value
 * @returns {number} the standard deviation
 */
export function stddev(values) {
    const m = mean(values);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        const d = values[i] - m;
        sum += d * d;
    }
    return Math.sqrt(sum / values.length);
}

/**
 * The `p`-quantile by linear interpolation between order statistics (the "type 7" method of R and NumPy): the value
 * at position `p * (n - 1)` of the sorted values.
 * @param {ArrayLike<number>} values at least one value
 * @param {number} p the quantile, 0..1
 * @returns {number} the quantile; the median for `p = 0.5`
 */
export function quantile(values, p) {
    const sorted = Float64Array.from(values).sort();
    const position = p * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, sorted.length - 1);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * @param {number} agentTicks the run's agent-ticks
 * @param {number} amount the numerator
 * @returns {MetricResult} `amount` per 1000 agent-ticks, `null` when there were none
 */
export function per1k(amount, agentTicks) {
    return agentTicks > 0 ? ok((amount / agentTicks) * 1000) : none('no agent-ticks');
}
