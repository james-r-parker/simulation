// Pacing: while the director holds the camera it may raise the sim speed over a quiet world, so a wide shot does not
// crawl, and it gives the speed back the moment something scores above the glide threshold, so a kill is never watched
// at x4. It only ever asks for speeds the worker can keep up with. Pure; the driver sends the result to the worker.

import { TICKS_PER_SECOND_CHOICES } from '../../worker/protocol.js';

/** The speed a quiet wide shot asks for, at least. */
export const QUIET_SPEED = 4;
/** The ticks a second at x1. */
const BASE = 60;
/** The headroom the worker keeps: a tick must cost at most this share of its budget. */
const HEADROOM = 1.05;

/** The speed multiples on the ladder, ascending. */
const MULTIPLES = TICKS_PER_SECOND_CHOICES.map((t) => t / BASE);

/**
 * @param {number} workerMsPerTick the worker's measured cost of a tick, 0 before one
 * @returns {number} the largest ladder multiple whose tick budget, `1000 / (60 x speed)` ms, is at least 1.05 x the
 *   cost; the lowest multiple when none is
 */
export function maxSustainedSpeed(workerMsPerTick) {
    let best = MULTIPLES[0];
    for (const m of MULTIPLES) {
        if (1000 / (BASE * m) >= HEADROOM * workerMsPerTick) {
            best = m;
        }
    }
    return best;
}

/**
 * @param {{state: string, quiet: boolean}} shot the shot state and whether no moment scores above the glide threshold
 * @param {number} viewerSpeed the viewer's speed multiple
 * @param {number} workerMsPerTick the worker's measured cost of a tick
 * @returns {number} the speed multiple to ask for: a quiet `wide` shot runs at the viewer's speed or x4, whichever is
 *   higher, within what the worker sustains; every other shot, and a `wide` shot with a moment waiting, runs at x1 (or
 *   slower when the viewer is)
 */
export function paceFor({ state, quiet }, viewerSpeed, workerMsPerTick) {
    if (state === 'wide' && quiet) {
        return Math.min(Math.max(viewerSpeed, QUIET_SPEED), maxSustainedSpeed(workerMsPerTick));
    }
    return Math.min(viewerSpeed, 1);
}
