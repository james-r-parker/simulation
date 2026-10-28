// The split-gate tally: at each tick's split decision, how many agents would split but for the merit gate (`gated`),
// out of all that pass every other `readyToSplit` term (`ready`), and how many of those have foraged on purpose.
// The totals live in `world.meritTally` (see `TALLY`) for `MeritSummary` and `eval.split_gated_share`. Reads only.

import { readyBeforeGate, splitGateOpen } from './reproduction.js';
import { TALLY } from './merit-state.js';

/** @typedef {import('./world.js').World} World */

/**
 * Counts the agent-ticks of this tick's split decision. Call it just before `splitAll`, so the population the gate's
 * floor reads is the one `splitAll` starts from (with merit at the cap, `splitRanked` collects its candidates from
 * exactly that state). Counts nothing once the cap leaves no free slot, as `splitAll` evaluates no agent then.
 * @param {World} world the world
 * @returns {void}
 */
export function tallyReady(world) {
    const { alive, meritTally, deliberateIntake } = world;
    const { capBirthsEnabled, maxAgents, splitCapMargin } = world.config;
    if (capBirthsEnabled && world.population >= maxAgents - splitCapMargin) {
        return;
    }
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && readyBeforeGate(world, slot)) {
            meritTally[TALLY.READY] += 1;
            meritTally[TALLY.GATED] += splitGateOpen(world, slot) ? 0 : 1;
            meritTally[TALLY.DELIBERATE] += deliberateIntake[slot] > 0 ? 1 : 0;
        }
    }
}

/**
 * @param {World} world the world
 * @returns {number | null} the share of ready agent-ticks the merit gate blocked over the whole run, or `null` when no
 *   agent has been ready
 */
export function splitGatedShare(world) {
    const ready = world.meritTally[TALLY.READY];
    return ready === 0 ? null : world.meritTally[TALLY.GATED] / ready;
}
