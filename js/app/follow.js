// Keeps a follow subject through its life, frames entry, holds through the death clip and hands off with a reason
// (docs/designs/ambient-display.md, "Follow as a story").

import { appLog } from './app-log.js';
import { followSubject, updateCamera } from './camera.js';
import { createFrameState, enterFrame, frameSubject, handoffFrame, settleFrame } from './follow-frame.js';
import { chooseHandoff, holdMsFor, RELATION, RELATION_CAPTIONS, RELATION_CAPTION_MS } from './follow-handoff.js';
import { interestOf, MOVEMENT_SCORE, pickFollowAgent } from './follow-target.js';
import { findAgent } from './renderer/overlays.js';

/** Visible, unpaused milliseconds with one subject and no event above the movement score before follow moves on. */
export const FOLLOW_BORED_MS = 120000;
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
 * @property {{player: import('./renderer/effects-player.js').EffectsPlayer | null, nowMs: number, x: number, y: number,
 *   skip: number}} context
 * @property {{id: number, relation: string}} choice scratch for `chooseHandoff`
 * @property {{from: number, pick: FollowState['context']}} handoff scratch: the subject that left and the pick's context
 * @property {import('./follow-frame.js').FrameState} frame the look-ahead, pair and zoom state
 * @property {{dtMs: number, nowMs: number, paused: boolean,
 *   player: import('./renderer/effects-player.js').EffectsPlayer | null}} frameAt scratch for `frameSubject`
 * @property {number} quietMs unpaused ms the subject has gone with no event above the movement score
 * @property {boolean} manual whether the viewer picked this subject, which exempts it from boredom
 * @property {number} seenSelected the selection last looked at, to tell a viewer's pick from a handoff's
 * @property {string} captionText the relation caption on screen
 * @property {number} captionUntilMs the wall time it goes
 */

/** @param {FollowState} f @param {string} reason @param {number} toId @returns {void} logs a transition */
function report(f, reason, toId) {
    const event = toId === 0 ? 'FollowEnded' : f.observedId === 0 ? 'FollowStarted' : 'FollowChanged';
    (f.deps.log ?? appLog)('info', event, { fromId: f.observedId, toId, reason });
    if (toId !== 0) {
        (f.observedId === 0 ? enterFrame : handoffFrame)(f.frame);
    }
    f.observedId = toId;
    f.heldMs = 0;
    f.quietMs = 0;
    if (toId === 0) {
        f.captionUntilMs = 0;
    }
}

/** @param {FollowState} f @returns {void} points the pick's context at the camera and the displayed effects */
function pickContext(f) {
    f.context.player = f.deps.getPlayer();
    f.context.nowMs = f.nowMs;
    f.context.x = f.deps.camera.targetX;
    f.context.y = f.deps.camera.targetY;
}

/** @param {FollowState} f @param {number} preferred @returns {number} a living subject */
function choose(f, preferred) {
    const agents = f.deps.getAgents();
    if (findAgent(agents, preferred) >= 0) {
        return preferred;
    }
    pickContext(f);
    f.context.skip = 0;
    return pickFollowAgent(agents, f.context);
}

/**
 * Hands the follow from a subject that is gone to the killer, a child, kin or the pick, and captions the relation.
 * @param {FollowState} f the controller
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @returns {void}
 */
function handOff(f, agents) {
    pickContext(f);
    f.context.skip = 0;
    f.handoff.from = f.deps.state.followId;
    const { id, relation } = chooseHandoff(f.deps.getPlayer()?.story ?? null, agents, f.handoff, f.choice);
    switchTo(f, id, { reason: 'death', relation });
}

/**
 * Moves the follow to a new subject: logs it, captions the relation and starts the new subject's own clocks.
 * @param {FollowState} f the controller
 * @param {number} to the new subject, 0 when nobody lives
 * @param {{reason: string, relation: string}} how why the follow moved and how the new subject relates
 * @returns {void}
 */
function switchTo(f, to, how) {
    const { state } = f.deps;
    const from = state.followId;
    state.followId = to;
    f.manual = false;
    report(f, to === 0 ? 'empty' : how.reason, to);
    if (to !== 0) {
        (f.deps.log ?? appLog)('info', 'FollowHandoff', { from, to, relation: how.relation });
        f.captionText = RELATION_CAPTIONS[/** @type {keyof typeof RELATION_CAPTIONS} */ (how.relation)] ?? '';
        f.captionUntilMs = f.nowMs + RELATION_CAPTION_MS;
    }
}

/**
 * Counts the time a living subject has gone quiet and, after `FOLLOW_BORED_MS`, moves to the best other subject. A
 * subject the viewer picked is never left, and a paused view counts nothing.
 * @param {FollowState} f the controller
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {{i: number, dtMs: number, paused: boolean}} at the subject's index and the frame
 * @returns {void}
 */
function bore(f, agents, at) {
    if (f.manual || at.paused) {
        return;
    }
    pickContext(f);
    f.quietMs = interestOf(agents, at.i, f.context) > MOVEMENT_SCORE ? 0 : f.quietMs + at.dtMs;
    if (f.quietMs < FOLLOW_BORED_MS) {
        return;
    }
    f.context.skip = f.deps.state.followId;
    const next = pickFollowAgent(agents, f.context);
    if (next === 0) {
        f.quietMs = 0;
    } else {
        switchTo(f, next, { reason: 'bored', relation: RELATION.BORED });
    }
}

/**
 * @param {FollowState} f the controller
 * @returns {void} latches a subject the viewer selected (a selection the follow made itself is not the viewer's)
 */
function watchSelection(f) {
    const { state } = f.deps;
    if (state.selectedId !== f.seenSelected) {
        f.seenSelected = state.selectedId;
        f.manual = f.manual || (state.selectedId !== 0 && state.selectedId === state.followId);
    }
}

/**
 * Finds the subject, counting the hold while it is gone and handing off when the hold is over.
 * @param {FollowState} f the controller
 * @param {import('./interpolate.js').Interpolated} agents the living agents
 * @param {{dtMs: number, paused: boolean}} at frame time
 * @returns {number} the subject's index in `agents`, -1 while it is gone
 */
function subjectIndex(f, agents, at) {
    const { state, getPlayer } = f.deps;
    let i = findAgent(agents, state.followId);
    if (i < 0 && !at.paused) {
        f.heldMs += at.dtMs;
        if (f.heldMs >= holdMsFor(getPlayer()?.story ?? null, state.followId)) {
            handOff(f, agents);
            i = findAgent(agents, state.followId);
        }
    }
    return i;
}

/**
 * @param {FollowState} f the controller
 * @param {{dtMs: number, nowMs: number, available: boolean, paused: boolean}} at frame time and availability
 * @returns {void}
 */
function stepFollow(f, at) {
    const { camera, state, getAgents } = f.deps;
    f.nowMs = at.nowMs;
    if (state.followId !== f.observedId) {
        report(f, state.followId === 0 ? 'cancel' : 'entry', state.followId);
        f.seenSelected = state.selectedId;
        f.manual = state.followId !== 0 && state.selectedId === state.followId;
    }
    watchSelection(f);
    if (state.followId === 0 || !at.available) {
        camera.following = false;
        updateCamera(camera, at.dtMs);
        return;
    }
    const agents = getAgents();
    let i = subjectIndex(f, agents, at);
    if (i >= 0) {
        f.heldMs = 0;
        bore(f, agents, { i, dtMs: at.dtMs, paused: at.paused });
        i = findAgent(agents, state.followId);
    }
    if (i >= 0) {
        const view = f.frameAt;
        view.dtMs = at.dtMs;
        view.nowMs = at.nowMs;
        view.paused = at.paused;
        view.player = f.deps.getPlayer();
        followSubject(camera, frameSubject(f.frame, agents, i, view), at.dtMs);
        settleFrame(f.frame);
    } else {
        camera.following = state.followId !== 0;
        updateCamera(camera, at.dtMs);
    }
}

/**
 * @param {FollowDeps} deps injected current view, living subjects, effects and log
 * @returns {{choose: (preferred?: number) => number, step: (at: {dtMs: number, nowMs: number, available: boolean,
 *   paused: boolean}) => void, reset: () => void, caption: () => string}} controller with no per-frame allocation;
 *   `caption` is the relation caption while it is on screen, else an empty string
 */
export function createFollowController(deps) {
    const context = { player: deps.getPlayer(), nowMs: 0, x: 0, y: 0, skip: 0 };
    /** @type {FollowState} */
    const f = {
        deps,
        observedId: 0,
        heldMs: 0,
        quietMs: 0,
        manual: false,
        seenSelected: 0,
        nowMs: 0,
        context,
        choice: { id: 0, relation: RELATION.PICK },
        handoff: { from: 0, pick: context },
        frame: createFrameState(deps.camera),
        frameAt: { dtMs: 0, nowMs: 0, paused: false, player: null },
        captionText: '',
        captionUntilMs: 0,
    };
    return {
        caption: () => (f.nowMs < f.captionUntilMs ? f.captionText : ''),
        choose: (preferred = 0) => choose(f, preferred),
        step: (at) => stepFollow(f, at),
        reset() {
            if (f.observedId !== 0) {
                report(f, 'cancel', 0);
            }
            f.heldMs = 0;
            f.captionUntilMs = 0;
            deps.state.followId = 0;
            deps.camera.following = false;
        },
    };
}
