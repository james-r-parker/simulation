// Bump detection: the protocol carries no collision or impact record, so a bump is read from the blended frame, as the
// chase cue is. A body that was running and loses a large share of its speed between two frames has hit something (a
// body, a rock or the wall); the size of the loss is the impact. The squash axis is its heading, the way it was moving,
// which is the contact normal for a head-on hit. A drawing cue, never a sim fact. Pure and allocation-free: the last
// speeds and the hits are preallocated.

/** The speed share (of top speed) a body must have had to bump: a body that was crawling does not. */
export const BUMP_MIN_SPEED = 0.3;
/** The share of top speed lost in one frame that makes a soft bump, and a hard one. */
export const BUMP_SOFT = 0.3;
export const BUMP_HARD = 0.6;
/** The most bumps one frame reports; the rest are dropped. */
export const MAX_BUMPS = 32;
/** Bump kinds. */
export const BUMP = Object.freeze({ NONE: 0, SOFT: 1, HARD: 2 });

/**
 * @typedef {object} Bumps
 * @property {Float32Array} lastSpeed each slot's speed share at the previous frame
 * @property {Uint32Array} lastGenome the body that speed belongs to (0 when none)
 * @property {number} count bumps found this frame
 * @property {Int32Array} index each bump's agent index in the frame's agents
 * @property {Uint8Array} kind each bump's `BUMP` kind
 */

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {Bumps} an empty state
 */
export function createBumps(capacity) {
    return {
        lastSpeed: new Float32Array(capacity),
        lastGenome: new Uint32Array(capacity),
        count: 0,
        index: new Int32Array(MAX_BUMPS),
        kind: new Uint8Array(MAX_BUMPS),
    };
}

/**
 * @param {number} before the body's speed share before the frame
 * @param {number} after its speed share now
 * @returns {number} the `BUMP` kind of the loss: none under `BUMP_SOFT`, hard from `BUMP_HARD`; none for a body that
 *   was not running
 */
export function bumpKind(before, after) {
    if (before < BUMP_MIN_SPEED) {
        return BUMP.NONE;
    }
    const lost = before - after;
    if (lost >= BUMP_HARD) {
        return BUMP.HARD;
    }
    return lost >= BUMP_SOFT ? BUMP.SOFT : BUMP.NONE;
}

/**
 * Finds the bumps of a frame and remembers each body's speed.
 * @param {import('../interpolate.js').Interpolated} agents the frame's agents
 * @param {number} maxVelocity the speed scale
 * @param {Bumps} state the state, whose `count`, `index` and `kind` this fills
 * @returns {number} bumps found
 */
export function findBumps(agents, maxVelocity, state) {
    state.count = 0;
    const capacity = state.lastSpeed.length;
    for (let i = 0; i < agents.count; i++) {
        const slot = agents.slot[i];
        if (slot >= capacity) {
            continue;
        }
        const speed = agents.speed[i] / maxVelocity;
        if (state.lastGenome[slot] === agents.genomeId[i] && state.count < MAX_BUMPS) {
            const kind = bumpKind(state.lastSpeed[slot], speed);
            if (kind !== BUMP.NONE) {
                state.index[state.count] = i;
                state.kind[state.count] = kind;
                state.count += 1;
            }
        }
        state.lastGenome[slot] = agents.genomeId[i];
        state.lastSpeed[slot] = speed;
    }
    return state.count;
}
