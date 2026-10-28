// The `MeritSummary` event: every `MERIT_LOG_TICKS` ticks while `meritEnabled`, the mean and 90th percentile of the
// alive agents' decayed merit and the window's split-gate tally. One record per summary, never per agent. Reads merit
// through `meritPeek`, so logging never changes stored state. Sorts the world's `capKeys` scratch (the birth cap
// restamps it before every use), so a summary allocates one view and nothing per agent.

import { EVENT_TYPE, pushEvent } from './events.js';
import { TALLY } from './merit-state.js';
import { MERIT_LOG_TICKS, meritPeek } from './merit.js';

/** @typedef {import('./world.js').World} World */

/** Share of agents at or below the reported percentile. */
const P90 = 0.9;

/**
 * Fills `capKeys` with the alive agents' merit.
 * @param {World} world the world
 * @returns {{count: number, sum: number}} the alive agents and their total merit
 */
function gatherMerit(world) {
    const { alive, capKeys } = world;
    let count = 0;
    let sum = 0;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            const merit = meritPeek(world, slot);
            capKeys[count++] = merit;
            sum += merit;
        }
    }
    return { count, sum };
}

/**
 * @param {World} world the world
 * @returns {boolean} true on the ticks a summary is due
 */
export function summaryDue(world) {
    return world.tick > 0 && world.tick % MERIT_LOG_TICKS === 0;
}

/**
 * Pushes this tick's `MeritSummary` record and moves the tally marks to the current totals. The record holds
 * `meritMean`, `meritP90` (nearest rank, 0 with no agent alive), the window's ready and gated agent-ticks and the
 * share of ready agent-ticks whose agent had any deliberate intake (0 with none ready).
 * @param {World} world the world
 * @returns {void}
 */
export function pushMeritSummary(world) {
    const { count, sum } = gatherMerit(world);
    const { meritTally: t } = world;
    const ready = t[TALLY.READY] - t[TALLY.MARK + TALLY.READY];
    const gated = t[TALLY.GATED] - t[TALLY.MARK + TALLY.GATED];
    const deliberate = t[TALLY.DELIBERATE] - t[TALLY.MARK + TALLY.DELIBERATE];
    for (let i = 0; i < TALLY.MARK; i++) {
        t[TALLY.MARK + i] = t[i];
    }
    const o = pushEvent(world.events, EVENT_TYPE.MERIT_SUMMARY, world.tick);
    const d = world.events.data;
    d[o + 2] = count === 0 ? 0 : sum / count;
    d[o + 3] = count === 0 ? 0 : world.capKeys.subarray(0, count).sort()[Math.ceil(P90 * count) - 1];
    d[o + 4] = ready;
    d[o + 5] = gated;
    d[o + 6] = ready === 0 ? 0 : deliberate / ready;
}
