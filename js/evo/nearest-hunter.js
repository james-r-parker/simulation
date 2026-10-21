// Nearest alive hunter for every alive agent: the hunters sorted by x, then for each agent a scan outward from its x that
// stops once the x gap alone is no closer than the best hit. The best starts at the distance to the agent's nearest hunter
// of the previous call (hunters and agents move a few px per tick), so the scan usually covers a handful of hunters, not
// all of them. Exact: it returns the same squared distance as the all-pairs scan (`test/evo/nearest-hunter.test.js`),
// because `dx * dx <= dx * dx + dy * dy` holds in floating point too. Allocates nothing per call.

/**
 * @param {number} slots the world's `maxAgents`
 * @returns {Record<string, any>} an empty hunter index
 */
export function createHunterIndex(slots) {
    return {
        count: 0,
        x: new Float64Array(slots),
        y: new Float64Array(slots),
        slot: new Uint32Array(slots),
        last: new Int32Array(slots).fill(-1),
    };
}

/**
 * Packs the alive hunters (`hunterSpec` flags their specialisations) into the index, sorted by x. Insertion sort: the
 * hunters arrive in slot order, which is not x order, but the arrays are at most `maxAgents` long.
 * @param {Record<string, any>} index the hunter index
 * @param {Record<string, any>} world the world
 * @param {Uint8Array} hunterSpec 1 at each specialisation index that has `canHunt`
 * @returns {void}
 */
export function buildHunterIndex(index, world, hunterSpec) {
    const { alive, spec, x, y } = world;
    const { x: hx, y: hy, slot: hs } = index;
    let count = 0;
    for (let s = 0; s < alive.length; s++) {
        if (alive[s] !== 1 || hunterSpec[spec[s]] !== 1) {
            continue;
        }
        let at = count++;
        for (; at > 0 && hx[at - 1] > x[s]; at--) {
            hx[at] = hx[at - 1];
            hy[at] = hy[at - 1];
            hs[at] = hs[at - 1];
        }
        hx[at] = x[s];
        hy[at] = y[s];
        hs[at] = s;
    }
    index.count = count;
}

/**
 * @param {Record<string, any>} index the hunter index
 * @param {number} sx the query x
 * @returns {number} the first position whose x is at least `sx` (`count` when none)
 */
function lowerBound(index, sx) {
    let lo = 0;
    let hi = index.count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (index.x[mid] < sx) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * Scans positions from `from` in one direction until the x gap alone is no closer than the best.
 * @param {Record<string, any>} index the hunter index
 * @param {{x: number, y: number, self: number, best: number, near: number}} q the query and its running best
 * @param {number} from the first position to look at
 * @param {number} step +1 to scan right, -1 to scan left
 * @returns {void}
 */
function scan(index, q, from, step) {
    const { x: hx, y: hy, slot: hs, count } = index;
    for (let i = from; i >= 0 && i < count; i += step) {
        const dx = q.x - hx[i];
        if (dx * dx >= q.best) {
            return;
        }
        const dy = q.y - hy[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < q.best && hs[i] !== q.self) {
            q.best = d2;
            q.near = hs[i];
        }
    }
}

/** The query scratch, reused by every call. */
const query = { x: 0, y: 0, self: 0, best: 0, near: 0 };

/**
 * @param {Record<string, any>} index a hunter index built for this world state
 * @param {Record<string, any>} world the world
 * @param {Uint8Array} hunterSpec 1 at each specialisation index that has `canHunt`
 * @param {number} s an alive slot
 * @returns {number} the squared distance to the nearest alive hunter other than `s`, Infinity when there is none
 */
export function nearestHunterSquared(index, world, s, hunterSpec) {
    const seed = index.last[s];
    query.x = world.x[s];
    query.y = world.y[s];
    query.self = s;
    query.best = Infinity;
    query.near = -1;
    if (seed >= 0 && seed !== s && world.alive[seed] === 1 && hunterSpec[world.spec[seed]] === 1) {
        const dx = query.x - world.x[seed];
        const dy = query.y - world.y[seed];
        query.best = dx * dx + dy * dy;
        query.near = seed;
    }
    const at = lowerBound(index, query.x);
    scan(index, query, at, 1);
    scan(index, query, at - 1, -1);
    index.last[s] = query.near;
    return query.best;
}
