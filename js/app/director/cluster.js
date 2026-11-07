// The largest group of points within a radius of one of them, for the director's clustered moments.

/**
 * Finds the largest spatial cluster of effects within `radius` of a centre effect and returns its centroid and count.
 * @param {readonly {x: number, y: number}[]} points effects in the time window
 * @param {number} radius cluster radius in world units
 * @returns {{count: number, x: number, y: number}} largest cluster summary (`count: 0` when empty)
 */
export function largestCluster(points, radius) {
    let best = /** @type {{x: number, y: number}[]} */ ([]);
    for (const center of points) {
        const neighbors = points.filter((p) => Math.hypot(p.x - center.x, p.y - center.y) <= radius);
        if (neighbors.length > best.length) {
            best = neighbors;
        }
    }
    if (best.length === 0) {
        return { count: 0, x: 0, y: 0 };
    }
    const sumX = best.reduce((acc, p) => acc + p.x, 0);
    const sumY = best.reduce((acc, p) => acc + p.y, 0);
    return { count: best.length, x: sumX / best.length, y: sumY / best.length };
}
