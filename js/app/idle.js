// Idle time from input: how long since the viewer last did anything. The HUD fade (Phase 3) and the director (Phase 4)
// both read it. Pure over an injected clock; the page turns DOM events into `input` calls.

/** A pointer move shorter than this many px does not count as input (a resting hand, a jittery mouse). */
export const MOVE_THRESHOLD_PX = 4;

/**
 * @typedef {object} InputEvent
 * @property {'pointermove' | 'pointerdown' | 'wheel' | 'keydown'} type what happened
 * @property {number} [x] the pointer position, for a `pointermove`
 * @property {number} [y] the pointer position, for a `pointermove`
 */

/**
 * @param {() => number} now the clock, in ms
 * @returns {{input: (event: InputEvent) => boolean, idleMs: () => number, reset: () => void}} `input` records an event
 *   and returns whether it counted (a `pointermove` counts once the pointer has moved `MOVE_THRESHOLD_PX` from where
 *   it last counted; the other events always do); `idleMs` is the time since the last counted input; `reset` counts
 *   an input without an event
 */
export function createIdleTracker(now) {
    let last = now();
    let anchorX = NaN;
    let anchorY = NaN;
    return {
        reset() {
            last = now();
        },
        idleMs: () => now() - last,
        input(event) {
            if (event.type === 'pointermove') {
                const moved = Math.hypot((event.x ?? 0) - anchorX, (event.y ?? 0) - anchorY);
                if (!(moved >= MOVE_THRESHOLD_PX)) {
                    if (Number.isNaN(anchorX)) {
                        anchorX = event.x ?? 0;
                        anchorY = event.y ?? 0;
                    }
                    return false;
                }
            }
            anchorX = event.x ?? anchorX;
            anchorY = event.y ?? anchorY;
            last = now();
            return true;
        },
    };
}
