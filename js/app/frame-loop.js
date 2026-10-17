// One animation frame: advance the camera, blend the two newest snapshots at the playhead, play the effects that are
// due, hand a new field to the haze, draw, and keep the frame statistics and the quality level. Everything it touches is
// injected, so it runs against fakes; it allocates nothing per frame except the once-a-second report.

import { appLog } from './app-log.js';
import { followStep, updateCamera } from './camera.js';
import { createFrameStats, frameReport, recordFrame } from './frame-stats.js';
import { createInterpolated, createPlayhead, interpolateInto, simTickAt, stepPlayhead } from './interpolate.js';
import { playEffects } from './renderer/effects-player.js';
import { findAgent } from './renderer/overlays.js';
import { stepQuality } from './renderer/quality.js';
import { lensUniforms } from './ui/lenses.js';

/** The quality rule's window of recent frames, and how often it is consulted, in ms. */
export const QUALITY_WINDOW_FRAMES = 600;
export const QUALITY_CHECK_MS = 1000;
/** The longest frame time the layers are told about, so a stalled tab does not jump motion. */
export const MAX_DT_MS = 100;

/**
 * @typedef {object} LoopDeps
 * @property {() => Record<string, any> | null} getClient the current worker client
 * @property {{draw: (frame: any) => boolean, setQualityLevel: (level: number) => void, quality: import('./renderer/quality.js').Quality} | null} scene
 *   the scene, null until the first `ready`
 * @property {import('./renderer/scene.js').Frame['camera']} camera the view
 * @property {import('./actions.js').AppState} state the selection and follow
 * @property {import('./family-slots.js').FamilySlots} slots the family colour slots and the palette
 * @property {import('./app-layers.js').LayerRefs} refs the haze and the effects player of the current layers
 * @property {import('./frame-stats.js').FrameStats} stats the frame and draw rings `__perf` reports
 * @property {{begin: () => void, end: () => void, poll: () => void} | null} gpuTimer the GPU timer, null without the
 *   extension
 * @property {() => number} clock a high-resolution clock in ms, for the draw time
 * @property {() => boolean} hidden whether the tab is hidden
 */

/**
 * @typedef {object} LoopState
 * @property {import('./interpolate.js').Playhead} playhead the render tick
 * @property {import('./interpolate.js').Interpolated} agents the blended agents, sized for `maxAgents`
 * @property {import('./frame-stats.js').FrameStats} window the recent frames the quality rule reads
 * @property {number} lastNowMs the previous frame's time, 0 before one
 * @property {number} lastCheckMs when the quality rule last ran
 */

/**
 * @param {number} maxAgents `ready.info.maxAgents`
 * @returns {LoopState} state for a fresh world
 */
function freshState(maxAgents) {
    return {
        playhead: createPlayhead(),
        agents: createInterpolated(maxAgents),
        window: createFrameStats(QUALITY_WINDOW_FRAMES),
        lastNowMs: 0,
        lastCheckMs: 0,
    };
}

/**
 * Moves the camera: towards the followed agent while it lives, else on its own spring.
 * @param {LoopDeps} deps the dependencies
 * @param {LoopState} loop the loop state
 * @param {number} dtMs the frame time
 * @returns {void}
 */
function moveCamera({ camera, state }, { agents }, dtMs) {
    const i = findAgent(agents, state.followId);
    if (state.followId !== 0 && i < 0) {
        state.followId = 0;
    }
    if (i >= 0) {
        followStep(camera, agents.x[i], agents.y[i], dtMs);
    } else {
        updateCamera(camera, dtMs);
    }
}

/**
 * Consults the quality rule about once a second and applies a change.
 * @param {LoopDeps} deps the dependencies
 * @param {LoopState} loop the loop state
 * @param {number} nowMs wall time
 * @returns {void}
 */
function checkQuality({ scene, hidden }, loop, nowMs) {
    if (scene === null || nowMs - loop.lastCheckMs < QUALITY_CHECK_MS) {
        return;
    }
    loop.lastCheckMs = nowMs;
    const { quality } = scene;
    const before = quality.level;
    const report = frameReport(loop.window);
    stepQuality(quality, report, nowMs, !hidden());
    if (quality.changed) {
        scene.setQualityLevel(quality.level);
        loop.window = createFrameStats(QUALITY_WINDOW_FRAMES);
        appLog('info', 'QualityChanged', { from: before, to: quality.level, p95: report.frameMs.p95 });
    }
}

/**
 * Blends the held snapshots at the playhead and plays the effects that are due.
 * @param {Record<string, any>} client the worker client
 * @param {LoopDeps} deps the dependencies
 * @param {LoopState} loop the loop state
 * @param {number} nowMs wall time
 * @returns {void}
 */
function advanceWorld(client, { refs }, loop, nowMs) {
    const alpha = stepPlayhead(loop.playhead, /** @type {any} */ (client), nowMs);
    if (client.latest === null) {
        loop.agents.count = 0;
        return;
    }
    interpolateInto(client.prev, client.latest, alpha, loop.agents);
    if (refs.player !== null && client.effects !== null) {
        playEffects(refs.player, client.effects, loop.agents, simTickAt(loop.playhead));
    }
    if (client.field !== null && refs.haze !== null) {
        refs.haze.pushField(client.field.f32, nowMs);
        client.releaseField();
    }
}

/**
 * @param {LoopDeps} deps the dependencies
 * @param {LoopState} loop the loop state
 * @returns {import('./renderer/scene.js').Frame} the frame object the layers read, rewritten each frame
 */
function newFrame(deps, loop) {
    return {
        alpha: 1,
        tick: 0,
        nowMs: 0,
        dtMs: 0,
        agents: loop.agents,
        snapshot: null,
        camera: deps.camera,
        selectedId: 0,
        followId: 0,
        leadLineageId: 0,
        family: deps.slots,
        lenses: { temperature: false, scent: false, territory: false, vision: false, calls: false },
    };
}

/**
 * @param {import('./renderer/scene.js').Frame} frame the frame object
 * @param {{deps: LoopDeps, loop: LoopState, client: Record<string, any>}} source where its values come from
 * @param {{nowMs: number, dtMs: number}} time the frame's times
 * @returns {void}
 */
function fillFrame(frame, { deps, loop, client }, { nowMs, dtMs }) {
    frame.alpha = loop.playhead.alpha;
    frame.tick = simTickAt(loop.playhead);
    frame.nowMs = nowMs;
    frame.dtMs = dtMs;
    frame.agents = loop.agents;
    frame.snapshot = client.latest;
    frame.selectedId = deps.state.selectedId;
    frame.followId = deps.state.followId;
    frame.leadLineageId = client.stats?.lineages?.top?.[0]?.id ?? 0;
    lensUniforms(deps.state.lenses, frame.lenses);
}

/**
 * Draws the frame inside the GPU timer's query and records how long the callback took.
 * @param {LoopDeps} deps the dependencies; `scene` is not null
 * @param {LoopState} loop the loop state
 * @param {{frame: import('./renderer/scene.js').Frame, started: number, interval: number}} at the frame to draw, when
 *   the callback began and the interval since the previous one
 * @returns {void}
 */
function drawAndRecord(deps, loop, { frame, started, interval }) {
    deps.gpuTimer?.begin();
    deps.scene?.draw(frame);
    deps.gpuTimer?.end();
    deps.gpuTimer?.poll();
    const drawMs = deps.clock() - started;
    recordFrame(deps.stats, interval, drawMs, deps.hidden());
    recordFrame(loop.window, interval, drawMs, deps.hidden());
}

/**
 * @param {LoopDeps} deps the dependencies; `scene` is read each frame, so it may be assigned after `createFrameLoop`
 * @returns {{frame: (nowMs: number) => void, reset: (maxAgents: number) => void, agents: () => import('./interpolate.js').Interpolated}}
 *   `frame` runs one animation frame at the callback's time; `reset` starts afresh for a new world; `agents` is the
 *   blended agents as last drawn (for picking)
 */
export function createFrameLoop(deps) {
    let loop = freshState(1);
    const frame = newFrame(deps, loop);
    return {
        reset(maxAgents) {
            loop = freshState(maxAgents);
        },
        agents: () => loop.agents,
        frame(nowMs) {
            const started = deps.clock();
            const client = deps.getClient();
            const dtMs = Math.min(Math.max(nowMs - loop.lastNowMs, 0), MAX_DT_MS);
            const interval = loop.lastNowMs === 0 ? 0 : nowMs - loop.lastNowMs;
            loop.lastNowMs = nowMs;
            if (deps.scene === null || client === null) {
                return;
            }
            advanceWorld(client, deps, loop, nowMs);
            moveCamera(deps, loop, dtMs);
            fillFrame(frame, { deps, loop, client }, { nowMs, dtMs });
            drawAndRecord(deps, loop, { frame, started, interval });
            checkQuality(deps, loop, nowMs);
        },
    };
}
