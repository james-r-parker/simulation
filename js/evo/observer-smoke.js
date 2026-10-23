// The observer's smoke follow-up: each release by an agent bitten within the last `TIMER_CAP` ticks is queued, and
// `ESCAPE_TICKS` later it counts as an escape when the releaser is still alive. Releases still pending at the end of
// the run are excluded. The queue is a ring over typed arrays that doubles when full.

import { TIMER_CAP } from '../sim/world.js';
import { BITTEN_THIS_TICK } from './observer-intent-episode.js';

/** Ticks after a release at which the releaser's survival is read. */
export const SMOKE_ESCAPE_TICKS = 300;

const START_CAPACITY = 16;

/**
 * @returns {Record<string, any>} an empty smoke follow-up
 */
export function createSmokeFollow() {
    return {
        genome: new Uint32Array(START_CAPACITY),
        slot: new Uint32Array(START_CAPACITY),
        due: new Float64Array(START_CAPACITY),
        head: 0,
        size: 0,
        bittenReleases: 0,
        escapes: 0,
    };
}

/**
 * Doubles the ring, unrolling it so the head is at index 0.
 * @param {Record<string, any>} follow the follow-up
 * @returns {void}
 */
function grow(follow) {
    const capacity = follow.genome.length;
    for (const name of ['genome', 'slot', 'due']) {
        const old = follow[name];
        const next = new old.constructor(capacity * 2);
        for (let i = 0; i < follow.size; i++) {
            next[i] = old[(follow.head + i) % capacity];
        }
        follow[name] = next;
    }
    follow.head = 0;
}

/**
 * Queues a `SmokeReleased` event when the releaser is alive and was bitten before this step, within the last `TIMER_CAP`
 * ticks.
 * A releaser already dead at the observed tick is skipped: its bite history is gone.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @param {number} slot the releaser's slot
 * @param {number} genomeId the releaser's genome id
 * @returns {void}
 */
export function noteSmokeRelease(follow, world, slot, genomeId) {
    if (world.alive[slot] !== 1 || world.genomeId[slot] !== genomeId) {
        return;
    }
    // A timer of 1 is a bite of this very step, which `feed` lands after the `signal` phase released the smoke.
    const timer = world.bittenTimer[slot];
    if (timer >= TIMER_CAP || timer === BITTEN_THIS_TICK) {
        return;
    }
    if (follow.size === follow.genome.length) {
        grow(follow);
    }
    const at = (follow.head + follow.size) % follow.genome.length;
    follow.genome[at] = genomeId;
    follow.slot[at] = slot;
    follow.due[at] = world.tick + SMOKE_ESCAPE_TICKS;
    follow.size += 1;
}

/**
 * Resolves the queued releases that are due by `world.tick`.
 * @param {Record<string, any>} follow the follow-up
 * @param {Record<string, any>} world the world after the step
 * @returns {void}
 */
export function resolveSmoke(follow, world) {
    while (follow.size > 0 && follow.due[follow.head] <= world.tick) {
        const at = follow.head;
        const slot = follow.slot[at];
        follow.bittenReleases += 1;
        if (world.alive[slot] === 1 && world.genomeId[slot] === follow.genome[at]) {
            follow.escapes += 1;
        }
        follow.head = (at + 1) % follow.genome.length;
        follow.size -= 1;
    }
}
