// The kinematics of the role budget (docs/designs/role-budget.md, "Kinematics"): the speed law, the turn circle and the
// sprint store as closed forms or exact loops, each tested against `bodyTable` of chase-body.js. Pure numbers.

import { detCos, detSin } from '../sim/det-math.js';

/** The longest `ticksToSpeed` counts before it says the cap is never reached. */
const MAX_COUNT = 100000;

/**
 * @param {number} x a vector's x
 * @param {number} y its y
 * @returns {number} its length
 */
export const norm = (x, y) => Math.sqrt(x * x + y * y);

/**
 * @param {number} v the speed now
 * @param {number} a the thrust of the gait (the sprint factor included while sprinting)
 * @param {number} d the damping
 * @param {number} cap the speed cap
 * @returns {number} the speed after one tick of a straight run: `min(cap, (v + a) d)`
 */
export function speedStep(v, a, d, cap) {
    return Math.min(cap, (v + a) * d);
}

/**
 * @param {number} a the thrust
 * @param {number} d the damping
 * @returns {number} the uncapped steady speed `a d / (1 - d)`
 */
export function steadySpeed(a, d) {
    return (a * d) / (1 - d);
}

/**
 * @param {number} a the thrust
 * @param {number} d the damping
 * @param {number} cap the speed cap
 * @returns {number} the first tick count at which a body from rest is at the cap, `Infinity` when the steady speed
 *   does not pass it
 */
export function ticksToSpeed(a, d, cap) {
    if (steadySpeed(a, d) <= cap) {
        return Infinity;
    }
    let v = 0;
    let n = 0;
    while (v < cap) {
        v = (v + a) * d;
        n += 1;
    }
    return n;
}

/**
 * The circle a body draws when it thrusts and turns at the full rate: the velocity turns as fast as the heading, so the
 * speed settles at `a d / sqrt(1 - 2 d cos(w) + d^2)` (never above the cap) and the radius is that over `w`.
 * @param {number} a the thrust
 * @param {number} d the damping
 * @param {number} w the turn rate, rad a tick
 * @param {number} [cap] the speed cap
 * @returns {{speed: number, radius: number}} the settled speed and the circle's radius
 */
export function turnCircle(a, d, w, cap = Infinity) {
    const speed = Math.min(cap, (a * d) / Math.sqrt(1 - 2 * d * detCos(w) + d * d));
    return { speed, radius: speed / w };
}

/**
 * @param {number} phi an angle to turn through
 * @param {number} w the turn rate
 * @returns {number} the ticks `phi / w` the velocity takes to swing through it once the circle is steady
 */
export function swingTicks(phi, w) {
    return phi / w;
}

/**
 * @param {{drain: number, floor: number, on: number}} store the store numbers
 * @param {number} [effort] the sprint effort, 0 to 1
 * @returns {number} the ticks of full factor, `(1 - floor) / (drain e)`; infinite with the store off
 */
export function burstTicks(store, effort = 1) {
    return store.on === 0 ? Infinity : (1 - store.floor) / (store.drain * effort);
}

/**
 * @param {{drain: number, on: number}} store the store numbers
 * @param {number} [effort] the sprint effort
 * @returns {number} the ticks until the store is empty, `1 / (drain e)`; infinite with the store off
 */
export function emptyTicks(store, effort = 1) {
    return store.on === 0 ? Infinity : 1 / (store.drain * effort);
}

/**
 * @param {{refill: number, on: number}} store the store numbers
 * @param {number} [level] the level the refill starts from
 * @returns {number} the ticks to a full store, `(1 - level) / refill`, counted only while resting
 */
export function refillTicks(store, level = 0) {
    return store.on === 0 ? 0 : (1 - level) / store.refill;
}

/**
 * @param {number} level the store level, 0 to 1
 * @param {number} floor the floor
 * @returns {number} the factor on the sprint: 1 at or above the floor, `level / floor` under it
 */
export function sprintFactor(level, floor) {
    return level >= floor ? 1 : level / floor;
}

/**
 * The hunter alone turning through `angle`: from its cruise speed it holds the full turn, the last step the angle that
 * is left, thrusting all the while (the `steer` rule of chase-oracles.js for an aim far away).
 * @param {{thrust: {cruise: number}, damping: number, cap: {cruise: number}, turnRate: {start: number}}} params the
 *   body (a `RoleParams`)
 * @param {number} angle the angle to turn through, 0 to PI
 * @returns {{ticks: number, distance: number, endSpeed: number}} the ticks until the heading is on the aim, the
 *   distance travelled along the final heading in them, and the speed at the end
 */
export function turnLoop(params, angle) {
    const { damping: d, cap, thrust } = params;
    const rate = params.turnRate.start;
    let heading = 0;
    let vx = cap.cruise;
    let vy = 0;
    let x = 0;
    let y = 0;
    let ticks = 0;
    while (angle - heading > 1e-12 && ticks < MAX_COUNT) {
        heading += Math.min(rate, angle - heading);
        vx += thrust.cruise * detCos(heading);
        vy += thrust.cruise * detSin(heading);
        vx *= d;
        vy *= d;
        const speed = norm(vx, vy);
        if (speed > cap.cruise) {
            vx *= cap.cruise / speed;
            vy *= cap.cruise / speed;
        }
        x += vx;
        y += vy;
        ticks += 1;
    }
    return { ticks, distance: x * detCos(angle) + y * detSin(angle), endSpeed: norm(vx, vy) };
}
