// Finds the pursuits in a frame: a hunter running at a smaller non-hunter that is running away from it. Pure and
// allocation-free: the pairs go into a preallocated table the renderer reads. This is a drawing cue read from the
// blended agents of one frame (position, heading and speed), not a sim fact, so it needs no worker flag.

/** The farthest a hunter and its prey can be apart and still count as a pursuit, in world units. */
export const PURSUIT_RANGE = 450;
/** The half-angle of the cone ahead of the hunter that its prey must be in, in radians (narrower than `biteArc`). */
export const PURSUIT_CONE = 0.6;
/** The prey's heading must be within this many radians of the hunter-to-prey bearing (it is running away). */
export const PURSUIT_AWAY = Math.PI / 2;
/** The hunter's speed, as a share of `maxVelocity`, below which it is stalking or resting, not running. */
export const HUNTER_RUN_SHARE = 0.45;
/** The prey's speed, as a share of `maxVelocity`, below which it is not fleeing. */
export const PREY_RUN_SHARE = 0.2;
/** The most pursuits one frame reports. */
export const MAX_PURSUITS = 48;

/**
 * @typedef {object} Pursuits
 * @property {number} count pairs found this frame
 * @property {Int32Array} hunter the hunter's index in the frame's agents
 * @property {Int32Array} prey the prey's index in the frame's agents
 * @property {Float32Array} closeness 1 at touching range, 0 at `PURSUIT_RANGE`
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
 * @param {{i: number, j: number}} pair hunter and candidate indices
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules the rules
 * @returns {number} the distance, or -1
 */
function targetDistance(a, { i, j }, rules) {
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
 * Fills `out` with the pursuits in a frame: each running hunter paired with its nearest fleeing smaller non-hunter.
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @param {{canHunt: Uint8Array, maxVelocity: number}} rules from `pursuitRules`
 * @param {Pursuits} out the table to fill
 * @returns {Pursuits} out
 */
export function findPursuits(agents, rules, out) {
    out.count = 0;
    for (let i = 0; i < agents.count && out.count < MAX_PURSUITS; i++) {
        if (rules.canHunt[agents.spec[i]] !== 1 || agents.speed[i] < HUNTER_RUN_SHARE * rules.maxVelocity) {
            continue;
        }
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < agents.count; j++) {
            const d = targetDistance(agents, { i, j }, rules);
            if (d >= 0 && d < bestD) {
                best = j;
                bestD = d;
            }
        }
        if (best >= 0) {
            const k = out.count++;
            out.hunter[k] = i;
            out.prey[k] = best;
            out.closeness[k] = 1 - bestD / PURSUIT_RANGE;
        }
    }
    return out;
}
