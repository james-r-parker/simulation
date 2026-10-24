// Shot state machine for the Phase 4 director (`docs/designs/worker-and-renderer.md`): runs on the main thread, draws
// random numbers from `createPrng(seed xor 0x9e3779b9)`, owns the camera while active after 10 s idle (or immediately
// in TV mode) and returns control to the viewer on any input.

import { appLog } from '../app-log.js';
import { followStep, moveCameraTo } from '../camera.js';
import { createPrng } from '../prng.js';
import { captionFor } from './captions.js';
import { findMoments, readSnapshotAgents } from './moments.js';
import { MOMENT_KIND } from './scoring.js';
import {
    LINGER_EXTEND_S,
    LINGER_LOW_SCORE,
    LINGER_LOW_WINDOW_S,
    LINGER_MAX_S,
    planShot,
    SHOT_STATE,
    shotPose,
} from './shots.js';

/** XOR mask applied to the world seed for the director's private PRNG. */
export const DIRECTOR_SEED_XOR = 0x9e3779b9;
/** Idle threshold (in ms) before the director takes over the camera. */
export const DIRECTOR_IDLE_MS = 10_000;
/** Decision interval in seconds (500 ms). */
export const DECISION_INTERVAL_S = 0.5;
/** Minimum score (after adding `rng.next() * 5`) required to start a `glide` shot. */
export const MOMENT_THRESHOLD = 45;
/** Random score draw range added to the highest moment candidate. */
export const MOMENT_RANDOM_BONUS = 5;
/** Lookback window (in simulated seconds) for the earlier snapshot used by `chase` gap detection. */
export const SNAPSHOT_LOOKBACK_S = 1.5;
/** Fixed bound on stored decision snapshots. */
export const MAX_SNAPSHOT_HISTORY = 16;

/**
 * Records a snapshot in the bounded history ring and returns the entry from ~1.5 s earlier.
 * @param {{timeS: number, agents: import('./moments.js').AgentRecord[]}[]} history bounded ring of snapshots
 * @param {number} timeS current simulated time in seconds
 * @param {import('./moments.js').AgentRecord[]} agents current alive agents
 * @returns {import('./moments.js').AgentRecord[]} agents from ~1.5 s ago (or empty array)
 */
function updateSnapshotHistory(history, timeS, agents) {
    if (history.length > 0 && timeS < history[history.length - 1].timeS) {
        history.length = 0;
    }
    const targetTimeS = timeS - SNAPSHOT_LOOKBACK_S;
    let earlier = /** @type {import('./moments.js').AgentRecord[]} */ ([]);
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].timeS <= targetTimeS + 1e-6) {
            earlier = history[i].agents;
            break;
        }
    }
    if (history.length === 0 || timeS - history[history.length - 1].timeS >= DECISION_INTERVAL_S - 1e-6) {
        history.push({ timeS, agents });
        if (history.length > MAX_SNAPSHOT_HISTORY) {
            history.shift();
        }
    }
    return earlier;
}

/**
 * Finds the matching candidate in a fresh scan to refresh an ongoing `linger` shot's score and focus.
 * @param {import('./moments.js').MomentCandidate} moment the moment currently being lingered on
 * @param {readonly import('./moments.js').MomentCandidate[]} rawCandidates fresh candidates without repeat penalty
 * @param {readonly import('./moments.js').AgentRecord[]} agents current alive agents
 * @returns {{score: number, x: number, y: number}} refreshed score and focus coordinates
 */
function refreshLingerMoment(moment, rawCandidates, agents) {
    const match = rawCandidates.find((c) => c.kind === moment.kind);
    if (match) {
        return { score: match.score, x: match.x, y: match.y };
    }
    if (moment.kind === MOMENT_KIND.CHASE) {
        const hunter = agents.find((a) => a.genomeId === moment.hunterId);
        const prey = agents.find((a) => a.genomeId === moment.preyId);
        if (hunter && prey) {
            return { score: 0, x: (hunter.x + prey.x) / 2, y: (hunter.y + prey.y) / 2 };
        }
    } else if (moment.kind === MOMENT_KIND.ESCAPE || moment.kind === MOMENT_KIND.SMOKE_ESCAPE) {
        const victim = agents.find((a) => a.genomeId === moment.victimId);
        if (victim) {
            return { score: 0, x: victim.x, y: victim.y };
        }
    }
    return { score: 0, x: moment.x, y: moment.y };
}

/**
 * Plans and enters a new `wide`, `glide`, `linger` or `pullback` shot on `state`.
 * @param {Record<string, any>} state internal director state
 * @param {'wide' | 'glide' | 'linger' | 'pullback'} shotState next shot state
 * @param {{startTimeS: number, agents: import('./moments.js').AgentRecord[],
 *   fromPose?: {x: number, y: number, zoom: number}, moment?: import('./moments.js').MomentCandidate | null}} params
 *   shot parameters
 * @returns {void}
 */
function enterShot(state, shotState, { startTimeS, agents, fromPose, moment = null }) {
    state.shot = planShot({
        state: shotState,
        startTimeS,
        fromPose,
        moment,
        agents,
        canvas: state.canvas,
        world: state.world,
        rng: state.rng,
    });
}

/**
 * Evaluates a 500 ms decision while in `wide`: cuts to `glide` when a candidate beats `MOMENT_THRESHOLD`.
 * @param {Record<string, any>} state internal director state
 * @param {{timeS: number, agents: import('./moments.js').AgentRecord[],
 *   candidates: import('./moments.js').MomentCandidate[], worldMeta: {seed?: number, top?: readonly {id: number}[]}}} ctx
 *   decision context
 * @returns {void}
 */
function decideWide(state, { timeS, agents, candidates, worldMeta }) {
    const shot = state.shot;
    const elapsedS = timeS - shot.startTimeS;
    if (elapsedS < shot.minDurationS) {
        return;
    }
    const fromPose = shotPose(shot, timeS, state.world);
    const top = candidates[0];
    if (top !== undefined && top.score + state.rng.next() * MOMENT_RANDOM_BONUS > MOMENT_THRESHOLD) {
        enterShot(state, SHOT_STATE.GLIDE, { startTimeS: timeS, agents, fromPose, moment: top });
        state.lastShownS[top.kind] = timeS;
        state.caption = captionFor(top, worldMeta);
        state.log('info', 'DirectorShot', {
            kind: top.kind,
            score: Math.round(top.score * 10) / 10,
            x: Math.round(top.x),
            y: Math.round(top.y),
        });
        return;
    }
    if (elapsedS >= shot.durationS) {
        enterShot(state, SHOT_STATE.WIDE, { startTimeS: timeS, agents, fromPose });
    }
}

/**
 * Evaluates a 500 ms decision while in `linger`: updates focus, extends up to 20 s if `score >= 45`, or exits early if
 * `score < 30` for 2 s.
 * @param {Record<string, any>} state internal director state
 * @param {{timeS: number, agents: import('./moments.js').AgentRecord[],
 *   rawCandidates: import('./moments.js').MomentCandidate[], currentPose: {x: number, y: number, zoom: number}}} ctx
 *   decision context
 * @returns {void}
 */
function decideLinger(state, { timeS, agents, rawCandidates, currentPose }) {
    const shot = state.shot;
    const refreshed = refreshLingerMoment(shot.moment, rawCandidates, agents);
    shot.toPose.x = refreshed.x;
    shot.toPose.y = refreshed.y;

    if (refreshed.score < LINGER_LOW_SCORE) {
        state.lowScoreSinceS = state.lowScoreSinceS ?? timeS;
        if (timeS - state.lowScoreSinceS >= LINGER_LOW_WINDOW_S - 1e-6) {
            state.caption = '';
            state.lowScoreSinceS = null;
            enterShot(state, SHOT_STATE.PULLBACK, { startTimeS: timeS, agents, fromPose: currentPose });
            return;
        }
    } else {
        state.lowScoreSinceS = null;
    }

    const elapsedS = timeS - shot.startTimeS;
    if (elapsedS >= shot.durationS - 1e-6) {
        if (refreshed.score >= MOMENT_THRESHOLD && shot.durationS < LINGER_MAX_S) {
            shot.durationS = Math.min(LINGER_MAX_S, shot.durationS + LINGER_EXTEND_S);
        }
        if (elapsedS >= shot.durationS - 1e-6) {
            state.caption = '';
            state.lowScoreSinceS = null;
            enterShot(state, SHOT_STATE.PULLBACK, { startTimeS: timeS, agents, fromPose: currentPose });
        }
    }
}

/**
 * Advances timed shot arrivals (`glide` -> `linger`, `pullback` -> `wide`).
 * @param {Record<string, any>} state internal director state
 * @param {number} timeS current simulated time in seconds
 * @param {import('./moments.js').AgentRecord[]} agents current alive agents
 * @returns {void}
 */
function advanceShotArrivals(state, timeS, agents) {
    const shot = state.shot;
    if (timeS - shot.startTimeS < shot.durationS - 1e-6) {
        return;
    }
    if (shot.state === SHOT_STATE.GLIDE) {
        state.lowScoreSinceS = null;
        enterShot(state, SHOT_STATE.LINGER, { startTimeS: timeS, agents, fromPose: shot.toPose, moment: shot.moment });
    } else if (shot.state === SHOT_STATE.PULLBACK) {
        enterShot(state, SHOT_STATE.WIDE, { startTimeS: timeS, agents, fromPose: shotPose(shot, timeS, state.world) });
    }
}

/**
 * Applies the active shot's pose to the camera (`followStep` in `linger`, `moveCameraTo` in other states).
 * @param {import('../camera.js').CameraController | undefined} camera optional camera controller
 * @param {import('./shots.js').PlannedShot} shot active shot
 * @param {{x: number, y: number, zoom: number}} pose evaluated pose
 * @param {number} dtMs frame delta in ms
 * @returns {{x: number, y: number, zoom: number}} current camera pose
 */
function applyShotToCamera(camera, shot, pose, dtMs) {
    if (!camera) {
        return pose;
    }
    if (shot.state === SHOT_STATE.LINGER) {
        camera.targetZoom = pose.zoom;
        followStep(camera, pose.x, pose.y, dtMs);
    } else {
        moveCameraTo(camera, pose, true);
    }
    return { x: camera.x, y: camera.y, zoom: camera.zoom };
}

/**
 * Updates speed via `onSpeed` when the director is active and restores `viewerSpeed` on deactivation.
 * @param {Record<string, any>} state internal director state
 * @param {string} shotState current shot state
 * @returns {void}
 */
function syncDirectorSpeed(state, shotState) {
    if (!state.onSpeed || !state.speedForState) {
        return;
    }
    const desired = state.speedForState(shotState, state.viewerSpeed);
    if (desired !== state.appliedSpeed) {
        state.appliedSpeed = desired;
        state.onSpeed(desired);
    }
}

/**
 * Deactivates the director on viewer input or toggle-off, restoring the viewer's playback speed if changed.
 * @param {Record<string, any>} state internal director state
 * @returns {void}
 */
function deactivateDirector(state) {
    if (!state.active) {
        return;
    }
    state.active = false;
    state.forced = false;
    state.shot = null;
    state.caption = '';
    state.lowScoreSinceS = null;
    if (state.onSpeed && state.appliedSpeed !== null) {
        state.appliedSpeed = null;
        state.onSpeed(state.viewerSpeed);
    }
}

/**
 * Runs a 500 ms director decision when due.
 * @param {Record<string, any>} state internal director state
 * @param {{timeS: number, tick: number, agents: import('./moments.js').AgentRecord[],
 *   earlierSnapshot: {u32?: Uint32Array, f32?: Float32Array} | readonly import('./moments.js').AgentRecord[],
 *   effects: readonly import('./moments.js').RawEffectRecord[],
 *   ticker: readonly {tick: number, kind: string, lineageId?: number, x?: number, y?: number}[],
 *   info: Record<string, any>, layout: Record<string, any>,
 *   worldMeta: {seed?: number, top?: readonly {id: number}[]},
 *   currentPose: {x: number, y: number, zoom: number}}} ctx decision context
 * @returns {void}
 */
function runDecisionIfDue(state, ctx) {
    if (ctx.timeS - state.lastDecisionS < DECISION_INTERVAL_S - 1e-6) {
        return;
    }
    state.lastDecisionS = ctx.timeS;
    const baseInput = {
        snapshot: ctx.agents,
        earlierSnapshot: ctx.earlierSnapshot,
        effects: ctx.effects,
        ticker: ctx.ticker,
        info: ctx.info,
        layout: ctx.layout,
        tick: ctx.tick,
    };
    if (state.shot.state === SHOT_STATE.WIDE) {
        const candidates = findMoments({ ...baseInput, lastShownS: state.lastShownS });
        decideWide(state, { timeS: ctx.timeS, agents: ctx.agents, candidates, worldMeta: ctx.worldMeta });
    } else if (state.shot.state === SHOT_STATE.LINGER) {
        const rawCandidates = findMoments(baseInput);
        decideLinger(state, {
            timeS: ctx.timeS,
            agents: ctx.agents,
            rawCandidates,
            currentPose: ctx.currentPose,
        });
    }
}

/**
 * Resolves timing and viewer speed from `stepDirector` input.
 * @param {Record<string, any>} state internal director state
 * @param {Parameters<typeof stepDirector>[1]} input step input
 * @returns {{tick: number, timeS: number, dtMs: number, idleMs: number}} normalized timing
 */
function normalizeStepTiming(state, input) {
    const ticksPerSecond = input.info.ticksPerSecond ?? 60;
    const tick = input.tick ?? Math.round((input.timeS ?? 0) * ticksPerSecond);
    const timeS = input.timeS ?? tick / ticksPerSecond;
    const dtMs = input.dtMs ?? 16.67;
    const idleMs = input.idleMs ?? DIRECTOR_IDLE_MS;
    if (input.viewerSpeed !== undefined && !state.active) {
        state.viewerSpeed = input.viewerSpeed;
    }
    return { tick, timeS, dtMs, idleMs };
}

/**
 * Ensures the director is active when enabled and idle, or deactivates it and returns false.
 * @param {Record<string, any>} state internal director state
 * @param {{idleMs: number, timeS: number, agents: import('./moments.js').AgentRecord[],
 *   camPose?: {x: number, y: number, zoom: number}}} ctx activation context
 * @returns {boolean} true when active
 */
function ensureActive(state, { idleMs, timeS, agents, camPose }) {
    if (!state.enabled || (!state.forced && idleMs < DIRECTOR_IDLE_MS)) {
        deactivateDirector(state);
        return false;
    }
    if (!state.active) {
        state.active = true;
        state.lastDecisionS = -Infinity;
        state.lowScoreSinceS = null;
        state.caption = '';
        state.onSelect?.(0);
        enterShot(state, SHOT_STATE.WIDE, { startTimeS: timeS, agents, fromPose: camPose });
    }
    return true;
}

/**
 * Executes one director step against `state`.
 * @param {Record<string, any>} state internal director state
 * @param {Parameters<typeof stepDirector>[1]} input frame and world context
 * @returns {ReturnType<typeof stepDirector>} current director snapshot
 */
function stepDirectorState(state, input) {
    const { tick, timeS, dtMs, idleMs } = normalizeStepTiming(state, input);
    const agents = readSnapshotAgents(input.snapshot);
    const autoEarlier = updateSnapshotHistory(state.snapshots, timeS, agents);
    const camPose = input.camera ? { x: input.camera.x, y: input.camera.y, zoom: input.camera.zoom } : undefined;
    if (!ensureActive(state, { idleMs, timeS, agents, camPose })) {
        return { active: false, state: null, pose: null, caption: '', shot: null };
    }

    advanceShotArrivals(state, timeS, agents);
    const prePose = shotPose(state.shot, timeS, state.world);
    runDecisionIfDue(state, {
        timeS,
        tick,
        agents,
        earlierSnapshot: input.earlierSnapshot ?? autoEarlier,
        effects: input.effects ?? [],
        ticker: input.ticker ?? [],
        info: input.info,
        layout: input.layout,
        worldMeta: input.world ?? { seed: state.seed, top: [] },
        currentPose: camPose ?? prePose,
    });
    const pose = applyShotToCamera(input.camera, state.shot, shotPose(state.shot, timeS, state.world), dtMs);
    syncDirectorSpeed(state, state.shot.state);
    return { active: true, state: state.shot.state, pose, caption: state.caption, shot: state.shot };
}

/**
 * Steps the director state machine at `tick` / `timeS`.
 * @param {ReturnType<typeof createDirector>} director director instance
 * @param {{tick?: number, timeS?: number, dtMs?: number, idleMs?: number,
 *   snapshot?: {u32?: Uint32Array, f32?: Float32Array} | readonly import('./moments.js').AgentRecord[] | null,
 *   earlierSnapshot?: {u32?: Uint32Array, f32?: Float32Array} | readonly import('./moments.js').AgentRecord[] | null,
 *   effects?: readonly import('./moments.js').RawEffectRecord[],
 *   ticker?: readonly {tick: number, kind: string, lineageId?: number, x?: number, y?: number}[],
 *   info: Record<string, any>, layout: Record<string, any>,
 *   camera?: import('../camera.js').CameraController,
 *   world?: {seed?: number, top?: readonly {id: number}[]},
 *   viewerSpeed?: number}} input frame and world context
 * @returns {{active: boolean, state: string | null, pose: {x: number, y: number, zoom: number} | null,
 *   caption: string, shot: import('./shots.js').PlannedShot | null}} current director snapshot
 */
export function stepDirector(director, input) {
    return director.step(input);
}

/**
 * Creates a Phase 4 director state machine.
 * @param {{seed: number, canvas: {width: number, height: number}, world: {width: number, height: number},
 *   enabled?: boolean, viewerSpeed?: number, log?: typeof appLog,
 *   onSelect?: (genomeId: number) => void, onSpeed?: (speed: number) => void,
 *   speedForState?: (shotState: string, viewerSpeed: number) => number}} opts director configuration
 * @returns {{step: (input: Parameters<typeof stepDirector>[1]) => ReturnType<typeof stepDirector>,
 *   noteInput: () => void, startNow: () => void, setEnabled: (enabled: boolean) => void,
 *   isEnabled: () => boolean, isActive: () => boolean, setViewerSpeed: (speed: number) => void,
 *   resize: (canvas: {width: number, height: number}, world?: {width: number, height: number}) => void,
 *   resetSeed: (seed: number) => void}} director controller
 */
export function createDirector(opts) {
    const seed = opts.seed >>> 0;
    const state = {
        ...opts,
        seed,
        rng: createPrng((seed ^ DIRECTOR_SEED_XOR) >>> 0),
        canvas: { ...opts.canvas },
        world: { ...opts.world },
        enabled: Boolean(opts.enabled ?? true),
        viewerSpeed: opts.viewerSpeed ?? 1,
        log: opts.log ?? appLog,
        active: false,
        forced: false,
        appliedSpeed: /** @type {number | null} */ (null),
        shot: /** @type {import('./shots.js').PlannedShot | null} */ (null),
        caption: '',
        lastDecisionS: -Infinity,
        lowScoreSinceS: /** @type {number | null} */ (null),
        lastShownS: /** @type {Record<string, number>} */ ({}),
        snapshots: /** @type {{timeS: number, agents: import('./moments.js').AgentRecord[]}[]} */ ([]),
    };
    return {
        isEnabled: () => state.enabled,
        isActive: () => state.active,
        noteInput: () => deactivateDirector(state),
        startNow: () => ((state.enabled = true), (state.forced = true)),
        setEnabled: (next) => ((state.enabled = Boolean(next)), !state.enabled && deactivateDirector(state)),
        setViewerSpeed: (speed) => (state.viewerSpeed = speed),
        resize: (c, w) => ((state.canvas = { ...c }), w && (state.world = { ...w })),
        resetSeed: (nextSeed) => (
            (state.seed = nextSeed >>> 0),
            (state.rng = createPrng((nextSeed ^ DIRECTOR_SEED_XOR) >>> 0)),
            (state.snapshots.length = 0),
            (state.lastShownS = {}),
            (state.lastDecisionS = -Infinity)
        ),
        step: (input) => stepDirectorState(state, input),
    };
}
