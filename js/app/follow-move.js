// The follow's handoff as a calm move (docs/designs/ambient-display.md, "A calm camera"): when the follow moves to a new
// subject on its own (after a death, or from boredom), the camera zooms out until the old view and the new subject fit,
// pans and zooms in (`camera-move.js`), on the wall clock, aimed each frame at where the follow would aim now. When the
// move ends the camera sits on that aim, so the follow's spring takes over with no error and no jump. A viewer's own
// pick or `F` press does not use this: it answers an input, and the spring does.

import { followAim } from './camera.js';
import { movePose, planMove } from './camera-move.js';

/**
 * @typedef {object} HandoffMove
 * @property {boolean} pending whether a handoff happened and its move is not yet planned
 * @property {boolean} active whether a move is running
 * @property {import('./camera-move.js').Move | null} plan the move
 * @property {number} elapsedS seconds since it began, on the wall clock
 * @property {{x: number, y: number, zoom: number}} aim scratch: where the follow aims now
 * @property {{x: number, y: number, zoom: number}} pose scratch: the pose of this frame
 */

/** @returns {HandoffMove} a move at rest */
export function createHandoffMove() {
    return {
        pending: false,
        active: false,
        plan: null,
        elapsedS: 0,
        aim: { x: 0, y: 0, zoom: 0 },
        pose: { x: 0, y: 0, zoom: 0 },
    };
}

/**
 * @param {HandoffMove} m the move
 * @returns {void} drops a planned or running move (the subject changed again, or the follow ended)
 */
export function cancelHandoffMove(m) {
    m.pending = false;
    m.active = false;
}

/**
 * Drives the camera for one frame of a handoff, planning the move on the first frame after the handoff.
 * @param {HandoffMove} m the move
 * @param {import('./camera.js').CameraController} camera the view
 * @param {import('./camera.js').FollowSubject} subject what the follow shows this frame
 * @param {number} dtMs the wall time this frame adds; 0 while paused
 * @returns {boolean} whether the move set the camera this frame; false once it is over, and the spring takes the frame
 */
export function stepHandoffMove(m, camera, subject, dtMs) {
    const aim = followAim(camera, subject, m.aim);
    if (m.pending) {
        m.pending = false;
        m.plan = planMove({ x: camera.x, y: camera.y, zoom: camera.zoom }, aim, camera);
        m.elapsedS = 0;
        m.active = m.plan.durationS > 0;
    }
    if (!m.active || m.plan === null) {
        return false;
    }
    m.elapsedS += dtMs / 1000;
    if (m.elapsedS >= m.plan.durationS) {
        m.active = false;
        return false;
    }
    const pose = movePose(m.plan, m.elapsedS, { to: aim, out: m.pose });
    camera.x = pose.x;
    camera.y = pose.y;
    camera.zoom = Math.min(Math.max(pose.zoom, camera.minZoom), camera.maxZoom);
    camera.targetX = aim.x;
    camera.targetY = aim.y;
    camera.targetZoom = aim.zoom;
    camera.following = true;
    return true;
}
