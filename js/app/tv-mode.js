// TV mode: the unattended state. It starts from `?tv=1`, the `T` key and `tvIdleMinutes` without input; any other input
// leaves it. Entering hands the camera to the director and hides the HUD, the cursor and the border; leaving restores
// the camera pose, the speed and the HUD the viewer had. Pure over injected parts, so it tests without a browser.

import { appLog } from './app-log.js';
import { moveCameraTo } from './camera.js';

/** The key whose own action toggles TV mode, so its input does not also leave it. */
export const TV_KEY = 'KeyT';

/**
 * @typedef {object} TvDeps
 * @property {{start: () => void, stop: () => void}} driver the director's driver
 * @property {import('./actions.js').AppState} state the shared state
 * @property {import('./camera.js').CameraController} camera the view
 * @property {{setTv: (on: boolean) => void, idleMs: () => number, resetIdle: () => void,
 *   tvIdleMinutes: () => number}} iface the interface: the TV look, the time since the last input, a restart of that
 *   clock and the preference for how long it may run
 * @property {typeof appLog} [log] the log
 */

/**
 * @typedef {object} TvMode
 * @property {() => boolean} active whether TV mode is on
 * @property {(reason: 'url' | 'key' | 'idle') => void} enter starts it
 * @property {(reason: 'input' | 'key') => void} leave ends it
 * @property {() => void} toggle the `T` key
 * @property {(event: {type: string, code?: string}) => void} noteInput leaves on any input but the TV key
 * @property {() => void} tick enters after the idle time; `tvIdleMinutes` of 0 turns that off
 */

/**
 * @param {TvDeps} deps the injected parts
 * @returns {TvMode} the controller
 */
export function createTvMode({ driver, state, camera, iface, log = appLog }) {
    let on = false;
    /** @type {{x: number, y: number, zoom: number}} */
    let saved = { x: 0, y: 0, zoom: 0 };
    /** @type {TvMode} */
    const tv = {
        active: () => on,
        enter(reason) {
            if (on) {
                return;
            }
            on = true;
            saved = { x: camera.targetX, y: camera.targetY, zoom: camera.targetZoom };
            driver.start();
            iface.setTv(true);
            log('info', 'TvEntered', { reason });
        },
        leave(reason) {
            if (!on) {
                return;
            }
            on = false;
            driver.stop();
            iface.setTv(false);
            moveCameraTo(camera, saved);
            state.autoSpeed = 0;
            iface.resetIdle();
            log('info', 'TvLeft', { reason });
        },
        toggle: () => (on ? tv.leave('key') : tv.enter('key')),
        noteInput(event) {
            if (!(event.type === 'keydown' && event.code === TV_KEY)) {
                tv.leave('input');
            }
        },
        tick() {
            const minutes = iface.tvIdleMinutes();
            if (!on && minutes > 0 && iface.idleMs() >= minutes * 60000) {
                tv.enter('idle');
            }
        },
    };
    return tv;
}
