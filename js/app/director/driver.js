// The director on the page: owns a `createDirector`, feeds it each frame from the worker client's newest snapshot, the
// effect and ticker feed and the camera, and carries its selection and speed requests to the worker. It never activates
// the director by idleness (TV mode, `js/app/tv-mode.js`, decides when to start and stop). The agent list, the effects
// and the ticker are re-read every `READ_MS` of wall time, not every frame, so a frame allocates nothing.

import { appLog } from '../app-log.js';
import { createDirector } from './director.js';
import { readSnapshotAgents } from './moments.js';

/** How often the agents, effects and ticker are re-read, ms of wall time. */
export const READ_MS = 250;

/**
 * @typedef {object} DriverDeps
 * @property {import('../camera.js').CameraController} camera the view
 * @property {import('../actions.js').AppState} state the shared state
 * @property {() => Record<string, any> | null} getClient the current worker client
 * @property {import('./feed.js').DirectorFeed} feed the effects and ticker
 * @property {typeof appLog} [log] the log
 * @property {(shotState: string, viewerSpeed: number, quiet: boolean) => number} [speedForState] the speed a shot asks
 *   for, as a multiple of x1 (`pace.js`)
 */

/**
 * @typedef {object} DriverState
 * @property {ReturnType<typeof createDirector> | null} director the director, made on the first world
 * @property {boolean} running whether TV mode wants the director
 * @property {string} caption the caption of the shot on screen
 * @property {string | null} shotKind the kind of the shot on screen
 * @property {number} readAt when the world was last read
 * @property {{width: number, height: number}} size the canvas the director knows
 * @property {import('./moments.js').AgentRecord[]} agents the agents at the last read
 * @property {{effects: any[], ticker: any[]}} recent the effects and ticker at the last read
 * @property {Record<string, any>} input what the director reads, rewritten each frame
 */

/**
 * @param {DriverDeps} deps the injected parts
 * @returns {ReturnType<typeof createDirector>} a director that sends its selection and speed to the worker
 */
function makeDirector({ camera, state, getClient, log = appLog, speedForState }) {
    return createDirector({
        seed: 0,
        canvas: camera.canvas,
        world: camera.world,
        log,
        onSelect(id) {
            state.selectedId = id;
            getClient()?.select(id);
        },
        onSpeed(speed) {
            state.autoSpeed = speed * 60 === state.requestedTicksPerSecond ? 0 : speed * 60;
            getClient()?.setSpeed(speed * 60);
        },
        speedForState,
        enabled: true,
    });
}

/**
 * @param {DriverDeps} deps the injected parts
 * @param {DriverState} d the driver state
 * @param {Record<string, any>} ready the new world
 * @returns {void}
 */
function readyWorld(deps, d, ready) {
    const world = { width: ready.info.worldWidth, height: ready.info.worldHeight };
    if (d.director === null) {
        d.director = makeDirector(deps);
    }
    d.director.resetSeed(ready.seed);
    d.director.resize(deps.camera.canvas, world);
    if (d.running) {
        d.director.startNow();
    }
    deps.feed.clear();
    d.readAt = -Infinity;
}

/**
 * @param {DriverDeps} deps the injected parts
 * @param {DriverState} d the driver state
 * @param {{nowMs: number, tick: number, ready: Record<string, any>, snapshot: any}} at the frame and the world
 * @returns {void}
 */
function reread(deps, d, { nowMs, tick, ready, snapshot }) {
    const { camera } = deps;
    if (nowMs - d.readAt >= READ_MS) {
        d.readAt = nowMs;
        d.agents = readSnapshotAgents(snapshot);
        d.recent = deps.feed.recent(tick, ready.info.ticksPerSecond);
    }
    if (camera.canvas.width !== d.size.width || camera.canvas.height !== d.size.height) {
        d.size = { width: camera.canvas.width, height: camera.canvas.height };
        d.director?.resize(d.size);
    }
}

/**
 * @param {DriverDeps} deps the injected parts
 * @param {DriverState} d the driver state
 * @param {{tick: number, dtMs: number, ready: Record<string, any>, top: readonly {id: number}[]}} at the frame
 * @returns {Record<string, any>} what the director reads this frame, the same object each time
 */
function directorInput({ camera, state }, d, { tick, dtMs, ready, top }) {
    const input = d.input;
    input.tick = tick;
    input.dtMs = dtMs;
    input.snapshot = d.agents;
    input.effects = d.recent.effects;
    input.ticker = d.recent.ticker;
    input.info = ready.info;
    input.layout = ready.layout;
    input.camera = camera;
    input.world.seed = ready.seed;
    input.world.top = top;
    input.viewerSpeed = state.requestedTicksPerSecond / 60;
    return input;
}

/**
 * @param {DriverDeps} deps the injected parts
 * @returns {{onReady: (ready: Record<string, any>) => void, start: () => void, stop: () => void,
 *   running: () => boolean, step: (at: {nowMs: number, dtMs: number, tick: number, ready: Record<string, any> | null,
 *   top: readonly {id: number}[]}) => boolean, caption: () => string, shotKind: () => string | null}} `step` runs the
 *   director for a frame and returns whether it holds the camera
 */
export function createDriver(deps) {
    const { camera, state, getClient } = deps;
    /** @type {DriverState} */
    const d = {
        director: null,
        running: false,
        caption: '',
        shotKind: null,
        readAt: -Infinity,
        size: { width: camera.canvas.width, height: camera.canvas.height },
        agents: [],
        recent: { effects: [], ticker: [] },
        input: { idleMs: 0, world: { seed: 0, top: [] } },
    };
    return {
        onReady: (ready) => readyWorld(deps, d, ready),
        start() {
            d.running = true;
            d.director?.startNow();
        },
        stop() {
            d.running = false;
            d.director?.noteInput();
            d.caption = '';
            d.shotKind = null;
            state.autoSpeed = 0;
        },
        running: () => d.running,
        caption: () => d.caption,
        shotKind: () => d.shotKind,
        step({ nowMs, dtMs, tick, ready, top }) {
            const snapshot = getClient()?.latest;
            if (!d.running || d.director === null || ready === null || !snapshot) {
                return false;
            }
            reread(deps, d, { nowMs, tick, ready, snapshot });
            const out = d.director.step(/** @type {any} */ (directorInput(deps, d, { tick, dtMs, ready, top })));
            d.caption = out.caption;
            d.shotKind = out.shot?.moment?.kind ?? out.state;
            return out.active;
        },
    };
}
