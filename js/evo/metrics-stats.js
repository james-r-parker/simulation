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

/**
 * @param {number} part the numerator
 * @param {number} whole the denominator
 * @param {string} reason the reason when `whole` is 0
 * @returns {MetricResult} `part / whole`, or `null` with the reason
 */
export function share(part, whole, reason) {
    return whole > 0 ? ok(part / whole) : none(reason);
}

/**
 * @param {ArrayLike<number>} values values to rank
 * @returns {Float64Array} the ranks from 1, tied values sharing the mean of their positions
 */
export function ranks(values) {
    const order = Array.from({ length: values.length }, (_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
    const out = new Float64Array(values.length);
    for (let i = 0; i < order.length;) {
        let j = i;
        while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) {
            j += 1;
        }
        for (let k = i; k <= j; k++) {
            out[order[k]] = (i + j) / 2 + 1;
        }
        i = j + 1;
    }
    return out;
}

/** Relative spread below which a sample counts as constant: the rounding of a mean that is not representable. */
const CONSTANT_SPREAD = 1e-12;

/**
 * @param {ArrayLike<number>} x the sample
 * @returns {number} the largest magnitude in the sample
 */
function maxAbs(x) {
    let m = 0;
    for (let i = 0; i < x.length; i++) {
        m = Math.max(m, Math.abs(x[i]));
    }
    return m;
}

/**
 * @param {number} sumSquares the sum of squared deviations from the mean
 * @param {ArrayLike<number>} x the sample
 * @returns {boolean} whether the deviations are no more than rounding of the mean
 */
function isConstant(sumSquares, x) {
    const bound = CONSTANT_SPREAD * maxAbs(x);
    return sumSquares <= x.length * bound * bound;
}

/**
 * @param {ArrayLike<number>} x the first sample
 * @param {ArrayLike<number>} y the second sample, as long as the first
 * @returns {number} Pearson's correlation, NaN when either sample is constant to within rounding
 */
export function pearson(x, y) {
    const mx = mean(x);
    const my = mean(y);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < x.length; i++) {
        cov += (x[i] - mx) * (y[i] - my);
        vx += (x[i] - mx) * (x[i] - mx);
        vy += (y[i] - my) * (y[i] - my);
    }
    if (isConstant(vx, x) || isConstant(vy, y)) {
        return NaN;
    }
    return cov / Math.sqrt(vx * vy);
}

/**
 * @param {ArrayLike<number>} x the first sample
 * @param {ArrayLike<number>} y the second sample, as long as the first
 * @returns {number} Spearman's rank correlation (Pearson on the ranks), NaN when either sample is constant
 */
export function spearman(x, y) {
    const rx = ranks(x);
    const ry = ranks(y);
    const mx = mean(rx);
    const my = mean(ry);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < rx.length; i++) {
        cov += (rx[i] - mx) * (ry[i] - my);
        vx += (rx[i] - mx) * (rx[i] - mx);
        vy += (ry[i] - my) * (ry[i] - my);
    }
    return cov / Math.sqrt(vx * vy);
}
