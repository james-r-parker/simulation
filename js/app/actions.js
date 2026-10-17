// What each shortcut and button does: pause, step, speed, new world, selection, follow and the camera moves. Pure over
// the injected worker client, camera and clock, so every action tests without a browser.

import { moveCameraTo, panByPixels, zoomAt } from './camera.js';
import { TICKS_PER_SECOND_CHOICES } from '../worker/protocol.js';

/** A second press of `N` within this many ms starts the new world. */
export const NEW_WORLD_CONFIRM_MS = 3000;
/** Keyboard pan per press, in device pixels. */
export const PAN_STEP_PX = 120;
/** Keyboard zoom factor per press. */
export const ZOOM_STEP = 1.25;
/** The tick rate the app starts at, ticks a second. */
export const DEFAULT_TICKS_PER_SECOND = 60;

/**
 * What the actions and the frame loop share.
 * @typedef {object} AppState
 * @property {number} selectedId the selected agent's genome id, 0 for none
 * @property {number} followId the followed agent's genome id, 0 for none
 * @property {number} requestedTicksPerSecond the speed last asked of the worker
 * @property {number} newWorldArmedAt when `N` was last pressed, -Infinity when not armed
 * @property {string} notice a short message for the top bar, empty for none
 */

/**
 * @param {number} [ticksPerSecond] the starting speed
 * @returns {AppState} state with nothing selected
 */
export function createAppState(ticksPerSecond = DEFAULT_TICKS_PER_SECOND) {
    return {
        selectedId: 0,
        followId: 0,
        requestedTicksPerSecond: ticksPerSecond,
        newWorldArmedAt: -Infinity,
        notice: '',
    };
}

/**
 * @typedef {object} ActionDeps
 * @property {() => Record<string, any> | null} getClient the current worker client (it changes on a restart)
 * @property {import('./camera.js').CameraController} camera the view
 * @property {AppState} state the shared state
 * @property {() => number} now the clock, in ms
 * @property {() => number} chooseSeed a fresh seed for a new world
 * @property {Record<string, any>} config the config overrides sent with a new world
 */

/**
 * @param {ActionDeps} deps the dependencies
 * @param {number} direction 1 for faster, -1 for slower
 * @returns {void}
 */
function changeSpeed({ getClient, state }, direction) {
    const at = TICKS_PER_SECOND_CHOICES.indexOf(state.requestedTicksPerSecond);
    const next = TICKS_PER_SECOND_CHOICES[Math.min(Math.max(at + direction, 0), TICKS_PER_SECOND_CHOICES.length - 1)];
    if (next !== state.requestedTicksPerSecond) {
        state.requestedTicksPerSecond = next;
        getClient()?.setSpeed(next);
    }
}

/**
 * @param {ActionDeps} deps the dependencies
 * @returns {void}
 */
function newWorld(deps) {
    const { state } = deps;
    const t = deps.now();
    if (t - state.newWorldArmedAt <= NEW_WORLD_CONFIRM_MS) {
        state.newWorldArmedAt = -Infinity;
        state.notice = '';
        state.selectedId = 0;
        state.followId = 0;
        deps.getClient()?.reset(deps.chooseSeed(), deps.config);
    } else {
        state.newWorldArmedAt = t;
        state.notice = 'Press N again to start a new world';
    }
}

/**
 * @param {ActionDeps} deps the dependencies
 * @param {number} dx pan direction in x, -1 to 1
 * @param {number} dy pan direction in y, -1 to 1 (up is -1, as on the screen)
 * @returns {void}
 */
function pan({ camera }, dx, dy) {
    panByPixels(camera, -dx * PAN_STEP_PX, -dy * PAN_STEP_PX);
}

/**
 * @param {ActionDeps} deps the dependencies
 * @param {number} factor above 1 zooms in
 * @returns {void}
 */
function zoom({ camera }, factor) {
    zoomAt(camera, factor, { x: camera.canvas.width / 2, y: camera.canvas.height / 2 });
}

/**
 * Clears the selection and the follow.
 * @param {ActionDeps} deps the dependencies
 * @returns {void}
 */
function clearSelection({ getClient, state }) {
    state.selectedId = 0;
    state.followId = 0;
    getClient()?.select(0);
}

/** @type {Readonly<Record<string, (deps: ActionDeps) => void>>} */
const ACTIONS = Object.freeze({
    togglePause: ({ getClient }) => {
        const client = getClient();
        if (client !== null) {
            if (client.paused) {
                client.resume();
            } else {
                client.pause();
            }
        }
    },
    step: ({ getClient }) => void getClient()?.step(1),
    step10: ({ getClient }) => void getClient()?.step(10),
    speedUp: (deps) => changeSpeed(deps, 1),
    speedDown: (deps) => changeSpeed(deps, -1),
    newWorld,
    follow: ({ state }) => {
        state.followId = state.followId === 0 ? state.selectedId : 0;
    },
    home: ({ camera }) => moveCameraTo(camera, { x: camera.world.width / 2, y: camera.world.height / 2, zoom: 0 }),
    clearSelection,
    panLeft: (deps) => pan(deps, -1, 0),
    panRight: (deps) => pan(deps, 1, 0),
    panUp: (deps) => pan(deps, 0, -1),
    panDown: (deps) => pan(deps, 0, 1),
    zoomIn: (deps) => zoom(deps, ZOOM_STEP),
    zoomOut: (deps) => zoom(deps, 1 / ZOOM_STEP),
});

/**
 * @param {ActionDeps} deps the dependencies
 * @returns {(action: string) => void} runs an action by name
 * @throws {Error} when the action is unknown
 */
export function createActions(deps) {
    return (action) => {
        const run = ACTIONS[action];
        if (run === undefined) {
            throw new Error(`unknown action "${action}", expected one of ${Object.keys(ACTIONS).join(', ')}`);
        }
        run(deps);
    };
}
