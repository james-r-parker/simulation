// The senses of the role budget (docs/designs/role-budget.md, "Senses"): how far a body sees at a bearing, how far a
// body is surely seen, who leads, and how loud a call is. Pure numbers.

import { detSin } from '../sim/det-math.js';
import { reachFactor } from '../sim/ray-reach.js';

/**
 * @param {{view: {range: number, rearShare: number}}} params a body's numbers (a `RoleParams`)
 * @param {number} bearing the angle from the body's heading to the thing seen
 * @returns {number} the reach of a ray at that bearing: `visionRange x reachFactor(rearVisionShare, bearing)`; a ray hits
 *   the edge of a body, so the centre of a target is that far plus the target's size
 */
export function viewReach(params, bearing) {
    return params.view.range * reachFactor(params.view.rearShare, bearing);
}

/**
 * @param {{view: {rays: number}}} params a body's numbers
 * @param {number} targetSize the target's size
 * @returns {number} the centre distance within which two neighbouring rays cannot both miss the target
 */
export function reliableView(params, targetSize) {
    return targetSize / detSin(Math.PI / params.view.rays);
}

/**
 * @param {{view: {range: number, rearShare: number}}} hunter the seeker's numbers
 * @param {{view: {range: number, rearShare: number}}} prey the seen body's numbers
 * @param {number} bearing the bearing of the hunter from the prey's heading (PI: from behind)
 * @returns {number} the distance the hunter closes unseen: its reach ahead less the prey's reach towards it; negative
 *   when the prey sees first
 */
export function seeLead(hunter, prey, bearing) {
    return viewReach(hunter, 0) - viewReach(prey, bearing);
}

/**
 * @param {number} d the distance from the caller
 * @param {number} t the ticks since the call
 * @param {{call: {radius: number, ticks: number}}} caller the caller's numbers
 * @returns {number} the loudness heard, `(1 - d / R) x (1 - t / callTicks)` rounded as the sim stores it (float32); 0
 *   at or beyond the radius or the call's life
 */
export function hearLoudness(d, t, caller) {
    const { radius, ticks } = caller.call;
    if (d >= radius || t >= ticks) {
        return 0;
    }
    return Math.fround((1 - d / radius) * (1 - t / ticks));
}

/**
 * @param {number} d the distance from the caller
 * @param {{call: {radius: number, ticks: number}}} caller the caller's numbers
 * @param {number} threshold the loudness a brain acts on
 * @returns {{ticks: number, distance: number}} the ticks from the call at which the loudness at `d` is above the
 *   threshold (0 when it never is), and the largest distance at which a call is above it at its first tick
 */
export function hearWindow(d, caller, threshold) {
    let ticks = 0;
    while (ticks < caller.call.ticks && hearLoudness(d, ticks, caller) > threshold) {
        ticks += 1;
    }
    return { ticks, distance: caller.call.radius * (1 - threshold) };
}
