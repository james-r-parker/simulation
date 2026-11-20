// One animation frame: advance the camera, ask the pack worker for the agents blended at the playhead one frame ahead
// and take the newest it finished, play the effects that are due, hand a new field to the scent lens, draw, and keep the
// frame statistics. Everything it touches is injected, so it runs against fakes; it allocates nothing per frame except
// the once-a-second report.

import { appLog } from './app-log.js';
import { createFollowController } from './follow.js';
import { recordFrame } from './frame-stats.js';
import { createInterpolated, createPlayhead, stepPlayhead } from './interpolate.js';
import { createPackFeed, exchangeFrame, isSeq, reportLate } from './pack/pack-feed.js';
import { beginEffects, playBumps, playEdges, playEffects, trackDying } from './renderer/effects-player.js';
import { lensUniforms } from './ui/lenses.js';

/** No lineages, for a frame before the first stats. */
const NO_LINEAGES = /** @type {readonly {id: number}[]} */ (Object.freeze([]));

/** The longest frame time the layers are told about, so a stalled tab does not jump motion. */
export const MAX_DT_MS = 100;

/**
 * @typedef {object} LoopDeps
 * @property {() => Record<string, any> | null} getClient the current worker client
 * @property {{draw: (frame: any) => boolean} | null} scene
 *   the scene, null until the first `ready`
 * @property {import('./renderer/stage.js').Frame['camera']} camera the view
 * @property {import('./actions.js').AppState} state the selection and follow
 * @property {import('./family-slots.js').FamilySlots} slots the family colour slots and the palette
 * @property {() => import('./pack/frame-slots.js').FrameSlots | null} getPack the current world's frame slots, null
 *   before the pack worker started
 * @property {(level: 'warn', event: string, fields: Record<string, any>) => void} [log] the log for `PackFrameLate`;
 *   the app log when absent
 * @property {import('./app-layers.js').LayerRefs} refs the scent lens and the effects player of the current layers
 * @property {import('./frame-stats.js').FrameStats} stats the frame and draw rings `__perf` reports
 * @property {{begin: () => void, end: () => void, poll: () => void, latest?: () => number} | null} gpuTimer the GPU timer, null without the
 *   extension
 * @property {() => number} clock a high-resolution clock in ms, for the draw time
 * @property {() => boolean} hidden whether the tab is hidden
 * @property {{step: (at: {nowMs: number, dtMs: number, tick: number, ready: Record<string, any> | null,
 *   top: readonly {id: number}[]}) => boolean} | null} [director] the director's driver; while it holds the camera the
 *   follow does not step
 * @property {() => Record<string, any> | null} [getReady] the newest `ready` message, for the director
 * @property {(frame: import('./renderer/stage.js').Frame) => void} [afterDraw] runs right after `scene.draw` (for `P` screenshots)
 */

/**
 * @typedef {object} LoopState
 * @property {import('./interpolate.js').Playhead} playhead the render tick
 * @property {import('./interpolate.js').Interpolated} agents the blended agents of the frame being drawn (the pack
 *   worker's newest slot), empty before the first
 * @property {import('./interpolate.js').Interpolated} empty no agents, for the frames before the worker's first
 * @property {import('./pack/pack-feed.js').PackFeed} feed the request and the late-frame count
 * @property {number} tick the render tick of the frame being drawn (the one it was packed at)
 * @property {number} alpha its blend factor
 * @property {Record<string, any> | null} snapshot the newer snapshot the drawn frame was blended from
 * @property {Record<string, any> | null} prevSnapshot the older one
 * @property {number} lastNowMs the previous frame's time, 0 before one
 * @property {{tick: number, dtMs: number, nowMs: number, camera: any, drawMs: number, gpuMs: number, intervalMs: number}}
 *   effectsAt the frame `beginEffects` reads (with the previous frame's draw CPU and GPU times), reused
 */

/**
 * @returns {LoopState} state for a fresh world
 */
function freshState() {
    const empty = createInterpolated(1);
    return {
        playhead: createPlayhead(),
        agents: empty,
        empty,
        feed: createPackFeed(),
        tick: 0,
        alpha: 1,
        snapshot: null,
        prevSnapshot: null,
        lastNowMs: 0,
        effectsAt: { tick: 0, dtMs: 0, nowMs: 0, camera: null, drawMs: -1, gpuMs: -1, intervalMs: 0 },
    };
}

/**
 * @param {Record<string, any>} client the worker client
 * @param {number} seq the sequence of a snapshot the drawn frame was packed from
 * @param {Record<string, any> | null} otherwise the snapshot to use when neither held one has that sequence
 * @returns {Record<string, any> | null} the held snapshot with that sequence
 */
function snapshotOf(client, seq, otherwise) {
    return isSeq(client.latest, seq) ? client.latest : isSeq(client.prev, seq) ? client.prev : otherwise;
}

/**
 * Plays the effects that are due on the frame being drawn.
 * @param {Record<string, any>} client the worker client
 * @param {{refs: LoopDeps['refs'], camera: LoopDeps['camera']}} deps the effects player and the camera
 * @param {LoopState} loop the loop state
 * @param {number} nowMs wall time
 * @returns {void}
 */
function playWorld(client, { refs, camera }, loop, nowMs) {
    const player = /** @type {NonNullable<typeof refs.player>} */ (refs.player);
    const at = loop.effectsAt;
    at.tick = loop.tick;
    at.nowMs = nowMs;
    at.camera = camera;
    beginEffects(player, at);
    trackDying(player, loop.agents, nowMs);
    if (client.effects !== null) {
        playEffects(player, client.effects, loop.agents, at.tick);
    }
    playEdges(player, loop.agents, /** @type {any} */ (loop.snapshot), at.tick);
    playBumps(player, loop.agents, at.tick);
}

/**
 * Steps the playhead one frame ahead, asks the pack worker for that frame, takes the newest finished one and plays the
 * effects that are due on it. The playhead runs on the clock shifted by the frame interval, the same shift for every
 * call, so arrival times and the pause check stay on one clock and the frame taken now is the one asked for last frame.
 * @param {Record<string, any>} client the worker client
 * @param {LoopDeps} deps the dependencies
 * @param {{loop: LoopState, lenses: Record<string, boolean>}} state the loop state and this frame's lens flags
 * @param {{nowMs: number, interval: number}} time wall time and the interval since the previous frame
 * @returns {void}
 */
function advanceWorld(client, deps, { loop, lenses }, { nowMs, interval }) {
    const shifted = nowMs + Math.min(interval, MAX_DT_MS);
    stepPlayhead(loop.playhead, /** @type {any} */ (client), shifted);
    const slots = deps.getPack();
    const agents =
        client.latest === null || slots === null
            ? null
            : exchangeFrame(loop.feed, slots, {
                  client,
                  playhead: loop.playhead,
                  nowMs: shifted,
                  zoom: deps.camera.zoom,
                  lenses,
                  family: deps.slots,
              });
    loop.agents = agents ?? loop.empty;
    if (agents !== null && slots !== null) {
        const { taken } = slots;
        loop.tick = taken.tick;
        loop.alpha = taken.alpha;
        loop.snapshot = snapshotOf(client, taken.latestSeq, client.latest);
        loop.prevSnapshot = snapshotOf(client, taken.prevSeq, client.prev);
        reportLate(loop.feed, { nowMs, seq: taken.seq, log: deps.log ?? appLog });
        if (deps.refs.player !== null) {
            playWorld(client, deps, loop, nowMs);
        }
    }
    if (client.field !== null && deps.refs.haze !== null) {
        deps.refs.haze.pushField(client.field.f32, nowMs);
        client.releaseField();
    }
}

/**
 * @param {LoopDeps} deps the dependencies
 * @param {Record<string, boolean>} lenses the lens flags, rewritten each frame
 * @returns {import('./renderer/stage.js').Frame} the frame object the layers read, rewritten each frame
 */
function newFrame(deps, lenses) {
    return {
        alpha: 1,
        tick: 0,
        nowMs: 0,
        dtMs: 0,
        agents: createInterpolated(1),
        packed: null,
        packedSeq: 0,
        snapshot: null,
        prevSnapshot: null,
        camera: deps.camera,
        selectedId: 0,
        followId: 0,
        tv: false,
        leadLineageId: 0,
        season: 0,
        seasonProgress: 0,
        family: deps.slots,
        lenses: /** @type {any} */ (lenses),
        width: 0,
        height: 0,
    };
}

/**
 * @param {import('./renderer/stage.js').Frame} frame the frame object
 * @param {{deps: LoopDeps, loop: LoopState, client: Record<string, any>}} source where its values come from
 * @param {{nowMs: number, dtMs: number}} time the frame's times
 * @returns {void}
 */
function fillFrame(frame, { deps, loop, client }, { nowMs, dtMs }) {
    const slots = deps.getPack();
    frame.alpha = loop.alpha;
    frame.tick = loop.tick;
    frame.nowMs = nowMs;
    frame.dtMs = dtMs;
    frame.agents = loop.agents;
    frame.packed = loop.agents === loop.empty || slots === null ? null : slots.current;
    frame.packedSeq = slots === null ? 0 : slots.taken.seq;
    frame.snapshot = /** @type {any} */ (loop.snapshot);
    frame.prevSnapshot = /** @type {any} */ (loop.prevSnapshot);
    frame.selectedId = deps.state.selectedId;
    frame.followId = deps.state.followId;
    frame.tv = deps.state.tv;
    fillStats(frame, client.stats);
}

/**
 * @param {import('./renderer/stage.js').Frame} frame the frame object
 * @param {Record<string, any> | null} stats the newest `stats` message
 * @returns {void}
 */
function fillStats(frame, stats) {
    frame.leadLineageId = stats?.lineages?.top?.[0]?.id ?? 0;
    frame.season = stats?.season ?? 0;
    frame.seasonProgress = stats?.seasonProgress ?? 0;
}

/**
 * Draws the frame inside the GPU timer's query and records how long the callback took.
 * @param {LoopDeps} deps the dependencies; `scene` is not null
 * @param {LoopState} loop the loop state
 * @param {{frame: import('./renderer/stage.js').Frame, started: number, interval: number}} at the frame to draw, when
 *   the callback began and the interval since the previous one
 * @returns {void}
 */
function drawAndRecord(deps, loop, { frame, started, interval }) {
    deps.gpuTimer?.begin();
    deps.scene?.draw(frame);
    deps.gpuTimer?.end();
    deps.gpuTimer?.poll();
    deps.afterDraw?.(frame);
    const drawMs = deps.clock() - started;
    loop.effectsAt.drawMs = drawMs;
    loop.effectsAt.gpuMs = deps.gpuTimer?.latest?.() ?? -1;
    loop.effectsAt.intervalMs = deps.hidden() ? 0 : interval;
    recordFrame(deps.stats, interval, drawMs, deps.hidden());
}

/**
 * @param {LoopDeps} deps the dependencies
 * @param {{nowMs: number, dtMs: number, tick: number, ready: Record<string, any> | null, top: readonly {id: number}[]}} at
 *   the director's input, rewritten
 * @param {{client: Record<string, any>, tick: number, nowMs: number, dtMs: number}} frame the client and the frame's times
 * @returns {boolean} whether the director holds the camera this frame
 */
function directed(deps, at, { client, tick, nowMs, dtMs }) {
    if (deps.director === null || deps.director === undefined) {
        return false;
    }
    at.nowMs = nowMs;
    at.dtMs = dtMs;
    at.tick = tick;
    at.ready = deps.getReady?.() ?? null;
    at.top = client.stats?.lineages?.top ?? NO_LINEAGES;
    return deps.director.step(at);
}

/**
 * The part of a frame that moves the camera: the director when it holds it, else the follow.
 * @param {LoopDeps} deps the dependencies
 * @param {() => LoopState} getLoop the loop state of the current world
 * @returns {{follow: ReturnType<typeof createFollowController>, step: (client: Record<string, any>,
 *   time: {nowMs: number, interval: number, dtMs: number}) => void}} the follow, and `step` for one frame
 */
function createCameraStep(deps, getLoop) {
    const follow = createFollowController({
        camera: deps.camera,
        state: deps.state,
        getAgents: () => getLoop().agents,
        getPlayer: () => deps.refs.player,
    });
    const followAt = { dtMs: 0, nowMs: 0, available: false, paused: false };
    const directorAt = {
        nowMs: 0,
        dtMs: 0,
        tick: 0,
        ready: /** @type {Record<string, any> | null} */ (null),
        top: NO_LINEAGES,
    };
    return {
        follow,
        step(client, { nowMs, interval, dtMs }) {
            const loop = getLoop();
            followAt.dtMs = interval > MAX_DT_MS ? 0 : dtMs;
            followAt.nowMs = nowMs;
            followAt.available = loop.agents !== loop.empty;
            followAt.paused = Boolean(client.paused) || deps.hidden();
            if (!directed(deps, directorAt, { client, tick: loop.tick, nowMs, dtMs: followAt.dtMs })) {
                follow.step(followAt);
            }
        },
    };
}

/**
 * @param {LoopDeps} deps the dependencies; `scene` is read each frame, so it may be assigned after `createFrameLoop`
 * @returns {{frame: (nowMs: number) => void, reset: () => void, agents: () => import('./interpolate.js').Interpolated,
 *   lateFrames: () => number, followAgent: (preferred?: number) => number, followCaption: () => string}} `frame` runs one animation frame at the callback's time; `reset` starts afresh for a new
 *   world; `agents` is the agents as last drawn (for picking); `lateFrames` counts the frames drawn on an old slot
 */
export function createFrameLoop(deps) {
    let loop = freshState();
    const lenses = { temperature: false, scent: false, territory: false, vision: false, calls: false };
    const frame = newFrame(deps, lenses);
    const camera = createCameraStep(deps, () => loop);
    return {
        reset() {
            loop = freshState();
            camera.follow.reset();
        },
        agents: () => loop.agents,
        followAgent: camera.follow.choose,
        followCaption: camera.follow.caption,
        lateFrames: () => loop.feed.lateTotal,
        frame(nowMs) {
            const started = deps.clock();
            const client = deps.getClient();
            const dtMs = Math.min(Math.max(nowMs - loop.lastNowMs, 0), MAX_DT_MS);
            const interval = loop.lastNowMs === 0 ? 0 : nowMs - loop.lastNowMs;
            loop.lastNowMs = nowMs;
            if (deps.scene === null || client === null) {
                return;
            }
            loop.effectsAt.dtMs = dtMs;
            lensUniforms(deps.state.lenses, /** @type {any} */ (lenses));
            advanceWorld(client, deps, { loop, lenses }, { nowMs, interval });
            camera.step(client, { nowMs, interval, dtMs });
            fillFrame(frame, { deps, loop, client }, { nowMs, dtMs });
            drawAndRecord(deps, loop, { frame, started, interval });
        },
    };
}
