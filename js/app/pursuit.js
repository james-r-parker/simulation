// Finds the pursuits in a frame: a hunter running at a smaller non-hunter that is running away from it. Pure and
// allocation-free: the pairs go into a preallocated table the renderer reads. This is a drawing cue read from the
// blended agents of one frame (position, heading and speed), not a sim fact, so it needs no worker flag.

/** The farthest a hunter and its prey can be apart and still count as a pursuit, in world units. */
import { createPointGrid, fillPointGrid, nearCells } from './pursuit-grid.js';

export const PURSUIT_RANGE = 450;
/** The half-angle of the cone ahead of the hunter that its prey must be in, in radians (narrower than `biteArc`). */
export const PURSUIT_CONE = 0.6;
/** The prey's heading must be within this many radians of the hunter-to-prey bearing (it is running away). */
export const PURSUIT_AWAY = Math.PI / 2;
/** The hunter's speed, as a share of `maxVelocity`, below which it is stalking or resting, not running. */
export const HUNTER_RUN_SHARE = 0.45;
/** The prey's speed, as a share of `maxVelocity`, below which it is not fleeing. */
export const PREY_RUN_SHARE = 0.2;
/** The most pursuits one frame reports; past it the hunters with the higher indices are dropped. */
export const MAX_PURSUITS = 48;

/**
 * @typedef {object} Pursuits
 * @property {number} count pairs found this frame
 * @property {Int32Array} hunter the hunter's index in the frame's agents
 * @property {Int32Array} prey the prey's index in the frame's agents
 * @property {Float32Array} closeness 1 at touching range, 0 at `PURSUIT_RANGE`
 * @property {Int32Array} candidates scratch: this frame's possible prey, grown to the frame's capacity once
 * @property {import('./pursuit-grid.js').PointGrid} grid scratch: the candidates by cell of `PURSUIT_RANGE`
 */

/**
 * @returns {Pursuits} an empty table
 */
export function createPursuits() {
    return {
        count: 0,
        hunter: new Int32Array(MAX_PURSUITS),
        prey: new Int32Array(MAX_PURSUITS),
        closeness: new Float32Array(MAX_PURSUITS),
        candidates: new Int32Array(0),
        grid: createPointGrid(),
    };
}

/**
 * @param {Record<string, any>} info `ready.info`: `specs` (each with `index` and `canHunt`) and `maxVelocity`
 * @returns {{canHunt: Uint8Array, maxVelocity: number}} the per-spec hunter table and the speed scale
 */
export function pursuitRules(info) {
    const specs = /** @type {{index: number, canHunt?: boolean}[]} */ (info.specs ?? []);
    let top = 0;
    for (const s of specs) {
        top = Math.max(top, s.index + 1);
    }
    const canHunt = new Uint8Array(top);
    for (const s of specs) {
        canHunt[s.index] = s.canHunt ? 1 : 0;
    }
    return { canHunt, maxVelocity: info.maxVelocity > 0 ? info.maxVelocity : 1 };
}

/**
 * @param {number} a an angle in radians
 * @param {number} b an angle in radians
 * @returns {number} the absolute shortest arc between them, in [0, PI]
 */
function arc(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) {
        d -= Math.PI * 2;
    } else if (d < -Math.PI) {
        d += Math.PI * 2;
    }
    return Math.abs(d);
}

/**
 * Whether agent `j` is a pursuit target of the running hunter `i`: smaller, not a hunter, ahead in the cone, running
 * away. Returns its distance, or -1 when it is not.
 * @param {import('./interpolate.js').Interpolated} a the frame's agents
 * @param {number} i the hunter's index
 * @param {number} j the candidate's index
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules the rules
 * @returns {number} the distance, or -1
 */
function targetDistance(a, i, j, rules) {
    if (j === i || a.size[j] >= a.size[i] || rules.canHunt[a.spec[j]] === 1) {
        return -1;
    }
    const dx = a.x[j] - a.x[i];
    const dy = a.y[j] - a.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 > PURSUIT_RANGE * PURSUIT_RANGE || d2 === 0) {
        return -1;
    }
    const bearing = Math.atan2(dy, dx);
    if (arc(bearing, a.angle[i]) > PURSUIT_CONE) {
        return -1;
    }
    if (a.speed[j] < PREY_RUN_SHARE * rules.maxVelocity || arc(a.angle[j], bearing) > PURSUIT_AWAY) {
        return -1;
    }
    return Math.sqrt(d2);
}

/**
 * Collects the agents that can be prey this frame (non-hunters running at `PREY_RUN_SHARE`), in index order, so each
 * hunter scans those rather than every agent.
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules from `pursuitRules`
 * @param {Pursuits} out the table whose `candidates` scratch is filled
 * @returns {number} the candidates found
 */
function collectCandidates(agents, rules, out) {
    if (out.candidates.length < agents.x.length) {
        out.candidates = new Int32Array(agents.x.length);
    }
    const run = PREY_RUN_SHARE * rules.maxVelocity;
    let n = 0;
    for (let j = 0; j < agents.count; j++) {
        if (rules.canHunt[agents.spec[j]] !== 1 && agents.speed[j] >= run) {
            out.candidates[n++] = j;
        }
    }
    return n;
}

const NEAR = { x0: 0, x1: 0, y0: 0, y1: 0 };
const BEST = { j: -1, d: Infinity };
const HUNTER = {
    i: 0,
    rules: /** @type {{canHunt: Uint8Array, maxVelocity: number}} */ ({ canHunt: new Uint8Array(0), maxVelocity: 1 }),
};

/**
 * The nearest target of hunter `i` among the gridded candidates within `PURSUIT_RANGE`; ties go to the lower index,
 * so the pair is the one a scan of every agent in index order finds.
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {number} i the hunter
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules from `pursuitRules`
 * @param {import('./pursuit-grid.js').PointGrid} grid the candidates by cell
 * @returns {{j: number, d: number}} the target (-1 for none) and its distance
 */
function nearestTarget(agents, i, rules, grid) {
    BEST.j = -1;
    BEST.d = Infinity;
    HUNTER.i = i;
    HUNTER.rules = rules;
    const r = nearCells(grid, agents.x[i], agents.y[i], NEAR);
    for (let cy = r.y0; cy <= r.y1; cy++) {
        for (let c = cy * grid.cols + r.x0; c <= cy * grid.cols + r.x1; c++) {
            scanCell(agents, HUNTER, grid, c);
        }
    }
    return BEST;
}

/**
 * Offers hunter `i` every candidate in cell `c`, keeping the nearest in `BEST`.
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {{i: number, rules: {canHunt: Uint8Array, maxVelocity: number}}} hunter the hunter and the rules
 * @param {import('./pursuit-grid.js').PointGrid} grid the candidates by cell
 * @param {number} c the cell
 * @returns {void}
 */
function scanCell(agents, { i, rules }, grid, c) {
    for (let s = grid.start[c]; s < grid.start[c + 1]; s++) {
        const j = grid.items[s];
        const d = targetDistance(agents, i, j, rules);
        if (d >= 0 && (d < BEST.d || (d === BEST.d && j < BEST.j))) {
            BEST.j = j;
            BEST.d = d;
        }
    }
}

/**
 * Fills `out` with the pursuits in a frame: each running hunter paired with its nearest fleeing smaller non-hunter.
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules from `pursuitRules`
 * @param {Pursuits} out the table to fill
 * @returns {Pursuits} out
 */
export function findPursuits(agents, rules, out) {
    out.count = 0;
    const n = collectCandidates(agents, rules, out);
    fillPointGrid(out.grid, agents, { ids: out.candidates, n }, PURSUIT_RANGE);
    for (let i = 0; i < agents.count && out.count < MAX_PURSUITS && n > 0; i++) {
        if (rules.canHunt[agents.spec[i]] !== 1 || agents.speed[i] < HUNTER_RUN_SHARE * rules.maxVelocity) {
            continue;
        }
        const best = nearestTarget(agents, i, rules, out.grid);
        if (best.j >= 0) {
            const k = out.count++;
            out.hunter[k] = i;
            out.prey[k] = best.j;
            out.closeness[k] = 1 - best.d / PURSUIT_RANGE;
        }
    }
    return out;
}
