// Exact binomial tests at p = 0.5 and the Wilson interval, for 0/1 seed outcomes where a bootstrap on sparse paired
// differences is unreliable (docs/designs/sim-notes.md, "BCa on sparse paired differences"). Pure.

/**
 * @param {number} n trials (a whole number up to 1000)
 * @returns {number[]} P(X = i) for i in 0..n, X ~ Binomial(n, 0.5), by the ratio recurrence from 2^-n
 */
function pmfRow(n) {
    let start = 1;
    for (let i = 0; i < n; i++) {
        start /= 2;
    }
    const row = [start];
    for (let i = 0; i < n; i++) {
        row.push((row[i] * (n - i)) / (i + 1));
    }
    return row;
}

/**
 * Exact two-sided binomial p-value at p = 0.5 (a McNemar test on `n` discordant pairs when `k` moved one way): twice the
 * smaller tail, capped at 1.
 * @param {number} n discordant pairs
 * @param {number} k pairs that moved one way (0 to n)
 * @returns {number} the p-value; 1 when n is 0
 */
export function binomialTwoSidedP(n, k) {
    if (n === 0) {
        return 1;
    }
    const row = pmfRow(n);
    const low = Math.min(k, n - k);
    let tail = 0;
    for (let i = 0; i <= low; i++) {
        tail += row[i];
    }
    return Math.min(1, 2 * tail);
}

/**
 * @param {number} b pairs that moved to the harmful side
 * @param {number} c pairs that moved back
 * @param {number} [alpha] the two-sided level
 * @returns {boolean} whether b exceeds c and the exact two-sided p of b against b + c is below `alpha`
 */
export function exactWorse(b, c, alpha = 0.05) {
    return b > c && binomialTwoSidedP(b + c, b) < alpha;
}

/**
 * @param {number} c pairs that moved back
 * @param {number} limit the most pairs that could have moved to the harmful side
 * @returns {number | null} the least b (above c) that `exactWorse` calls worse, null when none up to `limit` is
 */
export function leastDetectedLoss(c, limit) {
    for (let b = c + 1; b <= limit; b++) {
        if (exactWorse(b, c)) {
            return b;
        }
    }
    return null;
}

/**
 * @param {number} count successes
 * @param {number} of trials
 * @param {number} [z] the normal quantile (1.96 for 95%)
 * @returns {{ low: number, high: number }} the Wilson score interval of the share
 */
export function wilsonInterval(count, of, z = 1.959963984540054) {
    const p = count / of;
    const denom = 1 + (z * z) / of;
    const centre = (p + (z * z) / (2 * of)) / denom;
    const half = (z * Math.sqrt((p * (1 - p)) / of + (z * z) / (4 * of * of))) / denom;
    return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
