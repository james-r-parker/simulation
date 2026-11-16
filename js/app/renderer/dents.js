// The membrane dent: a bite (or a hard bump) presses a body's outline in at the contact and the membrane rings back out
// as a damped ripple. One dent per slot, preallocated; a new dent replaces a running one only when it is at least as
// strong. The agent packer asks `dentAt` for the depth and width and writes them, relative to the body's heading, into
// the instance's `iDent` lane. Pure.

/** A dent's length in ticks. */
export const DENT_TICKS = 20;
/** The widest and the narrowest arc of the dent, radians: it spreads as the ripple travels. */
export const DENT_WIDTH = Object.freeze({ from: 0.5, to: 0.95 });
/** Turns of the ripple over the dent's life. */
const RING_TURNS = 1.25;
/** How fast the ripple dies away: the depth envelope is `exp(-DAMPING * age)`. */
const DAMPING = 3.2;

/**
 * @typedef {object} Dents
 * @property {Float32Array} angle each slot's contact bearing in the world, radians
 * @property {Float32Array} depth each slot's peak depth, a share of the radius
 * @property {Float64Array} start the tick it began
 * @property {Uint32Array} genome the body it belongs to
 * @property {Uint8Array} active 1 while a dent runs
 */

/**
 * @param {number} capacity the most slots (`maxAgents`)
 * @returns {Dents} no dents
 */
export function createDents(capacity) {
    return {
        angle: new Float32Array(capacity),
        depth: new Float32Array(capacity),
        start: new Float64Array(capacity),
        genome: new Uint32Array(capacity),
        active: new Uint8Array(capacity),
    };
}

/**
 * Starts a dent on a body, replacing a running one of the same body only when it is deeper.
 * @param {Dents} dents the dents
 * @param {{slot: number, genome: number}} who the body
 * @param {{angle: number, depth: number, tick: number}} dent the contact bearing, the peak depth and the start tick
 * @returns {boolean} whether it started
 */
export function startDent(dents, { slot, genome }, { angle, depth, tick }) {
    if (slot >= dents.active.length) {
        return false;
    }
    const running = dents.active[slot] === 1 && dents.genome[slot] === genome && tick - dents.start[slot] < DENT_TICKS;
    if (running && depth < dents.depth[slot] * Math.exp(-DAMPING * ((tick - dents.start[slot]) / DENT_TICKS))) {
        return false;
    }
    dents.angle[slot] = angle;
    dents.depth[slot] = depth;
    dents.start[slot] = tick;
    dents.genome[slot] = genome;
    dents.active[slot] = 1;
    return true;
}

/**
 * @typedef {object} DentNow
 * @property {number} angle the contact bearing in the world, radians
 * @property {number} depth signed: positive presses in, negative bulges out as the ripple rings back
 * @property {number} width the arc of the dent, radians
 */

/**
 * @param {Dents} dents the dents
 * @param {{slot: number, genome: number, tick: number}} at the body and the playhead tick
 * @param {DentNow} out receives the dent
 * @returns {boolean} whether a dent runs on the body (an ended dent, or one left by an earlier body in the slot, is
 *   cleared)
 */
export function dentAt(dents, { slot, genome, tick }, out) {
    if (slot >= dents.active.length || dents.active[slot] === 0) {
        return false;
    }
    const age = (tick - dents.start[slot]) / DENT_TICKS;
    if (dents.genome[slot] !== genome || age >= 1) {
        dents.active[slot] = 0;
        return false;
    }
    const t = Math.max(age, 0);
    out.angle = dents.angle[slot];
    out.depth = dents.depth[slot] * Math.exp(-DAMPING * t) * Math.cos(2 * Math.PI * RING_TURNS * t);
    out.width = DENT_WIDTH.from + (DENT_WIDTH.to - DENT_WIDTH.from) * t;
    return true;
}
