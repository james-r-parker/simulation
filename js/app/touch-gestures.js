// The timing rules for the touch gestures that `createPointerInput` adds to tap and drag: a double tap, a two-finger
// tap and a long press. Pure over an injected clock and timer, so a test steps time by hand.

/** Two taps this close in time (ms) and space (device px) are a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 40;
/** Two fingers that go down and up within this many ms, without spreading, are a two-finger tap. */
export const TWO_FINGER_TAP_MS = 300;
/** A finger held still this many ms is a long press. */
export const LONG_PRESS_MS = 500;
/** A finger of a two-finger tap may move this far (device px) before the touch is a pinch or a pan. */
export const TAP_SLOP_PX = 12;

/**
 * @typedef {object} Timers
 * @property {(run: () => void, ms: number) => unknown} set starts a timer
 * @property {(handle: unknown) => void} clear stops it
 */

/** @type {Timers} */
export const BROWSER_TIMERS = Object.freeze({
    set: (run, ms) => setTimeout(run, ms),
    clear: (handle) => clearTimeout(/** @type {any} */ (handle)),
});

/**
 * Remembers the last tap so the next one can be told as the second of a double tap.
 * @param {() => number} now the clock in ms
 * @returns {{tap: (x: number, y: number) => boolean, reset: () => void}} `tap` records a tap and returns whether it
 *   completes a double tap (which then clears the memory, so a third tap starts afresh)
 */
export function createDoubleTap(now) {
    let at = -Infinity;
    let lastX = 0;
    let lastY = 0;
    return {
        tap(x, y) {
            const t = now();
            const double = t - at <= DOUBLE_TAP_MS && Math.hypot(x - lastX, y - lastY) <= DOUBLE_TAP_PX;
            at = double ? -Infinity : t;
            lastX = x;
            lastY = y;
            return double;
        },
        reset() {
            at = -Infinity;
        },
    };
}

/**
 * @param {{timers: Timers, onFire: () => void}} options the timers and what a held press does
 * @returns {{start: () => void, stop: () => void}} `start` arms the press (restarting it); `stop` disarms it
 */
export function createLongPress({ timers, onFire }) {
    /** @type {unknown} */
    let handle = null;
    const stop = () => {
        if (handle !== null) {
            timers.clear(handle);
            handle = null;
        }
    };
    return {
        stop,
        start() {
            stop();
            handle = timers.set(() => {
                handle = null;
                onFire();
            }, LONG_PRESS_MS);
        },
    };
}
