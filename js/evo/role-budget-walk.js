// The defender's walk onto the smoke spot and its stop there (docs/designs/role-budget.md, "Defender smoke"): it turns to the
// spot, thrusts once aimed at it, cuts its thrust when one more tick of thrust would carry it past the spot, coasts down on the
// sim's damping while it turns to face the caller, and releases once it faces the caller and is still. A body at its sprint
// cap coasts `cap d / (1 - d)` (about 228 px at the defaults), which is why the cut comes early and the release late. The
// decisions read a `Walker`, so the formula's body and the scene's world body make them with the same code.

import { MAX_TICKS } from './role-budget-timeline.js';
import { createBody, stepBody } from './role-budget-body.js';
import { norm, speedStep } from './role-budget-kinematics.js';
import { steerOut } from './role-budget-play.js';

/** The speed, px a tick, under which a body counts as stopped. */
export const STILL = 1;

/** The heading error under which the body counts as facing its aim (the sim stores the angle as a float32). */
export const FACING = 1e-4;

/** The cosine between the velocity and the way to the spot above which the cut is read (the body is heading there). */
const HEADING = 0.99;

/**
 * The cosine between the heading and the way to the spot above which the body thrusts: it turns first, so its velocity is aimed
 * when it gathers speed and its coast ends on the spot, not beside it.
 */
const ALIGNED = 0.999;

/**
 * @typedef {object} Walker the state a walk reads: a body of the formula, or one read off the sim's world
 * @property {import('./role-budget-params.js').RoleParams} p the body's numbers
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} size
 * @property {number} ch the cosine of its heading
 * @property {number} sh the sine of its heading
 * @property {number} angle its heading
 */

/**
 * @param {Walker} b the walking body
 * @param {{x: number, y: number}} to the spot
 * @returns {boolean} whether it should cut its thrust now: it is already on the spot, or it is heading for it and one more
 *   tick of thrust would leave it beyond the spot once it has coasted to a stop
 */
export function shouldCut(b, to) {
    const rx = to.x - b.x;
    const ry = to.y - b.y;
    const dist = norm(rx, ry);
    if (dist < b.size) {
        return true;
    }
    const speed = norm(b.vx, b.vy);
    const along = speed > 0 ? (rx * b.vx + ry * b.vy) / speed : 0;
    if (along <= 0 || along / dist < HEADING) {
        return false;
    }
    const { p } = b;
    const next = speedStep(speed, p.thrust.sprint, p.damping, p.cap.sprint);
    return along <= next / (1 - p.damping);
}

/**
 * @param {Walker} b the walking body
 * @param {{to: {x: number, y: number}, cut: boolean}} walk the spot and whether the thrust is already cut
 * @returns {{out: import('./role-budget-body.js').Out, cut: boolean}} what it holds this tick (turn at the spot and thrust
 *   once aimed at it; after the cut, no thrust and a turn to face +x, toward the caller) and whether the thrust is now cut
 */
export function walkOut(b, { to, cut }) {
    const stop = cut || shouldCut(b, to);
    const rx = to.x - b.x;
    const ry = to.y - b.y;
    const aim = stop ? { x: 1, y: 0 } : { x: rx, y: ry };
    const aimed = (b.ch * rx + b.sh * ry) / norm(rx, ry) >= ALIGNED;
    const turn = steerOut(/** @type {import('./role-budget-body.js').Body} */ (b), aim);
    return { out: { turn, sprint: stop ? 0 : 1, thrust: stop || !aimed ? 0 : 1 }, cut: stop };
}

/**
 * @param {Walker} b the body
 * @returns {boolean} whether it faces +x and is still: the tick it releases
 */
export function released(b) {
    return Math.abs(b.angle) < FACING && norm(b.vx, b.vy) < STILL;
}

/**
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {{from: {x: number, y: number}, angle: number, to: {x: number, y: number}}} walk where it starts, which way it faces
 *   and the spot it stops on, with its back to the hunter (it faces +x, toward the caller)
 * @returns {{ticks: number, x: number, y: number, angle: number}} the ticks from its start until it faces +x and is still
 *   (`Infinity` when it does not inside `MAX_TICKS`), and where and how it stands then
 */
export function walkAndStop(defender, { from, angle, to }) {
    const b = createBody(defender, { x: from.x, y: from.y, angle });
    let cut = false;
    for (let t = 0; t < MAX_TICKS; t++) {
        if (cut && released(b)) {
            return { ticks: t, x: b.x, y: b.y, angle: b.angle };
        }
        const held = walkOut(b, { to, cut });
        cut = held.cut;
        stepBody(b, held.out);
    }
    return { ticks: Infinity, x: b.x, y: b.y, angle: b.angle };
}
