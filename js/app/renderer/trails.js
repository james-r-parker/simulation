// Trails: the last 32 positions of up to 64 tracked agents (the selected one and the leading lineage's), in a
// preallocated ring per agent.

/** Positions kept per trail, and trails tracked. */
export const TRAIL_POINTS = 32;
export const TRAIL_AGENTS = 64;

/**
 * @typedef {object} Trails
 * @property {Uint32Array} ids the genome tracked in each trail, 0 for a free one
 * @property {Float32Array} xs `TRAIL_AGENTS x TRAIL_POINTS` positions, a ring per trail
 * @property {Float32Array} ys
 * @property {Uint8Array} head the ring index the next point goes in
 * @property {Uint8Array} length points held, up to `TRAIL_POINTS`
 * @property {Uint8Array} keep scratch: which trails the new wanted list kept
 */

/**
 * @returns {Trails} empty trails
 */
export function createTrails() {
    return {
        ids: new Uint32Array(TRAIL_AGENTS),
        xs: new Float32Array(TRAIL_AGENTS * TRAIL_POINTS),
        ys: new Float32Array(TRAIL_AGENTS * TRAIL_POINTS),
        head: new Uint8Array(TRAIL_AGENTS),
        length: new Uint8Array(TRAIL_AGENTS),
        keep: new Uint8Array(TRAIL_AGENTS),
    };
}

/**
 * Sets which agents are tracked. A genome already tracked keeps its trail; the others get a freed trail, empty.
 * @param {Trails} trails the trails
 * @param {Uint32Array} wanted the genome ids to track
 * @param {number} count how many of `wanted` count (at most `TRAIL_AGENTS`)
 * @returns {void}
 */
export function trackTrails(trails, wanted, count) {
    trails.keep.fill(0);
    for (let w = 0; w < count; w++) {
        for (let t = 0; t < TRAIL_AGENTS; t++) {
            if (trails.ids[t] === wanted[w]) {
                trails.keep[t] = 1;
                break;
            }
        }
    }
    for (let t = 0; t < TRAIL_AGENTS; t++) {
        if (trails.keep[t] === 0) {
            trails.ids[t] = 0;
            trails.length[t] = 0;
            trails.head[t] = 0;
        }
    }
    for (let w = 0; w < count; w++) {
        if (!isTracked(trails, wanted[w])) {
            const free = trails.ids.indexOf(0);
            if (free >= 0) {
                trails.ids[free] = wanted[w];
            }
        }
    }
}

/**
 * @param {Trails} trails the trails
 * @param {number} genomeId a genome
 * @returns {boolean} whether it has a trail
 */
function isTracked(trails, genomeId) {
    return genomeId !== 0 && trails.ids.includes(genomeId);
}

/**
 * Adds each tracked agent's current position to its trail; a tracked agent that is gone is released.
 * @param {Trails} trails the trails
 * @param {{count: number, genomeId: Uint32Array, x: Float32Array, y: Float32Array}} agents the blended agents
 * @returns {void}
 */
export function recordTrails(trails, agents) {
    for (let t = 0; t < TRAIL_AGENTS; t++) {
        const id = trails.ids[t];
        if (id === 0) {
            continue;
        }
        let found = -1;
        for (let i = 0; i < agents.count; i++) {
            if (agents.genomeId[i] === id) {
                found = i;
                break;
            }
        }
        if (found < 0) {
            trails.ids[t] = 0;
            trails.length[t] = 0;
            continue;
        }
        const at = t * TRAIL_POINTS + trails.head[t];
        trails.xs[at] = agents.x[found];
        trails.ys[at] = agents.y[found];
        trails.head[t] = (trails.head[t] + 1) % TRAIL_POINTS;
        trails.length[t] = Math.min(trails.length[t] + 1, TRAIL_POINTS);
    }
}

/**
 * @param {Trails} trails the trails
 * @param {number} t the trail
 * @param {number} k 0 for the oldest point, `length - 1` for the newest
 * @returns {number} the point's index into `xs` and `ys`
 */
export function trailIndex(trails, t, k) {
    const start = (trails.head[t] - trails.length[t] + TRAIL_POINTS) % TRAIL_POINTS;
    return t * TRAIL_POINTS + ((start + k) % TRAIL_POINTS);
}
