// Keeps a follow subject through its life, frames entry, and hands off after a brief death hold.

import { appLog } from './app-log.js';
import { followStep, updateCamera } from './camera.js';
import { pickFollowAgent } from './follow-target.js';
import { findAgent } from './renderer/overlays.js';

/** Visible, unpaused milliseconds left at a departed subject before a handoff. */
export const FOLLOW_HOLD_MS = 650;
/** World units visible across the shorter canvas dimension on follow entry. */
export const FOLLOW_VIEW_SPAN = 900;

/**
 * @param {import('./camera.js').CameraController} camera the view
 * @returns {void} sets entry zoom once; later handoffs preserve the viewer's zoom
 */
export function frameFollow(camera) {
    const close = Math.min(camera.canvas.width, camera.canvas.height) / FOLLOW_VIEW_SPAN;
    camera.targetZoom = Math.min(camera.maxZoom, Math.max(camera.minZoom, camera.targetZoom, close));
}

/**
 * @typedef {object} FollowDeps
 * @property {import('./camera.js').CameraController} camera
 * @property {import('./actions.js').AppState} state
 * @property {() => import('./interpolate.js').Interpolated} getAgents
 * @property {() => import('./renderer/effects-player.js').EffectsPlayer | null} getPlayer
 * @property {(level: 'info', event: string, fields: Record<string, any>) => void} [log]
 */

/**
 * @typedef {object} FollowState
 * @property {FollowDeps} deps
 * @property {number} observedId
 * @property {number} heldMs
 * @property {number} nowMs
 * @property {{player: import('./renderer/effects-player.js').EffectsPlayer | null, nowMs: number, x: number, y: number}} context
 */

/** @param {FollowState} f @param {string} reason @param {number} toId @returns {void} logs a transition */
function report(f, reason, toId) {
    const event = toId === 0 ? 'FollowEnded' : f.observedId === 0 ? 'FollowStarted' : 'FollowChanged';
    (f.deps.log ?? appLog)('info', event, { fromId: f.observedId, toId, reason });
    f.observedId = toId;
    f.heldMs = 0;
}

/** @param {FollowState} f @param {number} preferred @returns {number} a living subject */
function choose(f, preferred) {
    const { camera, getAgents, getPlayer } = f.deps;
    const agents = getAgents();
    if (findAgent(agents, preferred) >= 0) {
        return preferred;
    }
    f.context.player = getPlayer();
    f.context.nowMs = f.nowMs;
    f.context.x = camera.targetX;
    f.context.y = camera.targetY;
    return pickFollowAgent(agents, f.context);
}

/** @param {{dtMs: number, holdMs?: number}} at frame time @returns {number} the ms this frame adds to a death hold */
function holdOf(at) {
    return at.holdMs ?? at.dtMs;
}

/**
 * @param {FollowState} f the controller
 * @param {{dtMs: number, holdMs?: number, nowMs: number, available: boolean, paused: boolean}} at frame time and
 *   availability; `dtMs` eases the camera (a slow frame still moves it), `holdMs` is what counts towards the death
 *   hold and is 0 for a gap over `MAX_DT_MS` (defaults to `dtMs`)
 * @returns {void}
 */
function stepFollow(f, at) {
    const { camera, state, getAgents } = f.deps;
    f.nowMs = at.nowMs;
    if (state.followId !== f.observedId) {
        report(f, state.followId === 0 ? 'cancel' : 'entry', state.followId);
    }
    if (state.followId === 0 || !at.available) {
        camera.following = false;
        updateCamera(camera, at.dtMs);
        return;
    }
    const agents = getAgents();
    let i = findAgent(agents, state.followId);
    if (i < 0 && !at.paused) {
        f.heldMs += holdOf(at);
        if (f.heldMs >= FOLLOW_HOLD_MS) {
            state.followId = choose(f, 0);
            report(f, state.followId === 0 ? 'empty' : 'death', state.followId);
            i = findAgent(agents, state.followId);
        }
    }
    if (i >= 0) {
        f.heldMs = 0;
        followStep(camera, agents.x[i], agents.y[i], at.dtMs);
    } else {
        camera.following = state.followId !== 0;
        updateCamera(camera, at.dtMs);
    }
}

/**
 * @param {FollowDeps} deps injected current view, living subjects, effects and log
 * @returns {{choose: (preferred?: number) => number, step: (at: {dtMs: number, holdMs?: number, nowMs: number, available: boolean,
 *   paused: boolean}) => void, reset: () => void}} controller with no per-frame allocation
 */
export function createFollowController(deps) {
    const f = { deps, observedId: 0, heldMs: 0, nowMs: 0, context: { player: deps.getPlayer(), nowMs: 0, x: 0, y: 0 } };
    return {
        choose: (preferred = 0) => choose(f, preferred),
        step: (at) => stepFollow(f, at),
        reset() {
            if (f.observedId !== 0) {
                report(f, 'cancel', 0);
            }
            f.heldMs = 0;
            deps.state.followId = 0;
            deps.camera.following = false;
        },
    };
}
