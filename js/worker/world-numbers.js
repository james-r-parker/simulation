// The live world numbers the top bar shows, so a problem reads as a number, not a hunch: the alive predators, the calls
// made lately and the largest specialisation's share. Calls are counted over the last `CALL_WINDOW_TICKS` ticks in a
// preallocated ring, so nothing per tick allocates and the stats message stays a fixed size.

import { EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';
import { specParams } from '../sim/spec-params.js';

/** The ticks over which calls are counted; the rate is reported per this many ticks. */
export const CALL_WINDOW_TICKS = 1000;

/**
 * @typedef {object} CallWindow
 * @property {Uint32Array} ring calls made in each of the last `CALL_WINDOW_TICKS` ticks, by `tick % CALL_WINDOW_TICKS`
 * @property {number} total the sum of the ring
 * @property {number} tickAt the tick the ring was last advanced to, -1 before the first
 */

/** @returns {CallWindow} an empty window */
export function createCallWindow() {
    return { ring: new Uint32Array(CALL_WINDOW_TICKS), total: 0, tickAt: -1 };
}

/**
 * Counts the tick's `AlarmCalled` and `PackCalled` events (smoke is a defence, not a call, and has no ring). Call it
 * once for each tick stepped.
 * @param {CallWindow} win the window
 * @param {Record<string, any>} world the world just stepped
 * @returns {void}
 */
export function noteCalls(win, world) {
    const slot = world.tick % CALL_WINDOW_TICKS;
    if (win.tickAt !== world.tick) {
        win.total -= win.ring[slot];
        win.ring[slot] = 0;
        win.tickAt = world.tick;
    }
    const d = world.events.data;
    let calls = 0;
    for (let i = 0; i < world.events.count; i++) {
        const type = d[i * EVENT_STRIDE];
        if (type === EVENT_TYPE.ALARM_CALLED || type === EVENT_TYPE.PACK_CALLED) {
            calls++;
        }
    }
    win.ring[slot] += calls;
    win.total += calls;
}

/**
 * @param {CallWindow} win the window
 * @param {number} tick the world's tick
 * @returns {number} calls per 1000 ticks over the window (over the ticks run so far while the window is not full)
 */
export function callsPerKiloTick(win, tick) {
    const span = Math.min(Math.max(tick, 1), CALL_WINDOW_TICKS);
    return (win.total * 1000) / span;
}

/**
 * @param {Record<string, any>} config the world config
 * @param {ArrayLike<number>} bySpec alive agents by specialisation index
 * @returns {number} the alive agents whose specialisation can hunt
 */
export function predatorCount(config, bySpec) {
    let predators = 0;
    for (let spec = 0; spec < bySpec.length; spec++) {
        if (specParams(config, spec).canHunt) {
            predators += bySpec[spec];
        }
    }
    return predators;
}

/**
 * @param {ArrayLike<number>} bySpec alive agents by specialisation index
 * @returns {{index: number, share: number}} the most common specialisation and its share of the alive agents; the
 *   lowest index wins a tie, and share is 0 when none are alive
 */
export function largestSpec(bySpec) {
    let index = 0;
    let total = 0;
    for (let spec = 0; spec < bySpec.length; spec++) {
        total += bySpec[spec];
        if (bySpec[spec] > bySpec[index]) {
            index = spec;
        }
    }
    return { index, share: total === 0 ? 0 : bySpec[index] / total };
}
