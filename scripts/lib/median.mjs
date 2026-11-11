/**
 * @param {readonly number[]} values numbers
 * @returns {number} their median (NaN when empty)
 */
export function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length === 0 ? NaN : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
