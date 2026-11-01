// Run trace: the few per-seed series a screen needs and the report's metrics do not carry - the population over
// time, births split by cause in equal windows, and the end state (specialisation counts, deaths by cause, lineages).
// Fed once per tick from the eval worker; it only reads the world and the observer, so a run is unchanged.

import { BORN_CAUSE } from '../sim/events.js';

export const TRACE_INTERVAL = 1000;
export const TRACE_WINDOWS = 4;

/**
 * @typedef {object} Trace
 * @property {number} interval ticks between population samples
 * @property {number} windows how many equal windows the births are split into
 * @property {number} ticks the run length
 * @property {number[]} ends the window end ticks before the last (the last ends with the run)
 * @property {number[]} pop population at every multiple of `interval`
 * @property {number[]} cumMate cumulative mating births at each entry of `ends`
 * @property {number[]} cumSplit cumulative split births at each entry of `ends`
 */

/**
 * @param {{ ticks: number, interval?: number, windows?: number }} options the run length, the population sampling
 *   interval (default 1000) and the birth window count (default 4)
 * @returns {Trace} an empty trace
 */
export function createTrace({ ticks, interval = TRACE_INTERVAL, windows = TRACE_WINDOWS }) {
    const ends = [];
    for (let k = 1; k < windows; k++) {
        ends.push(Math.max(1, Math.floor((ticks * k) / windows)));
    }
    return { interval, windows, ticks, ends, pop: [], cumMate: [], cumSplit: [] };
}

/**
 * Call after every `step`. Allocates only when a sample is taken.
 * @param {Trace} trace the trace
 * @param {Record<string, any>} world the world
 * @param {Record<string, any>} observer the observer (its cumulative `births`)
 * @returns {void}
 */
export function observeTrace(trace, world, observer) {
    const tick = world.tick;
    if (tick === 0) {
        return;
    }
    if (tick % trace.interval === 0) {
        trace.pop.push(world.population);
    }
    const taken = trace.cumMate.length;
    if (taken < trace.ends.length && tick >= trace.ends[taken]) {
        trace.cumMate.push(observer.births[BORN_CAUSE.MATE]);
        trace.cumSplit.push(observer.births[BORN_CAUSE.SPLIT]);
    }
}

/**
 * @param {readonly number[]} cumulative cumulative counts at the window ends before the last
 * @param {number} total the count at the end of the run
 * @returns {number[]} the count inside each window
 */
function windowCounts(cumulative, total) {
    const bounds = [0, ...cumulative, total];
    return bounds.slice(1).map((bound, i) => bound - bounds[i]);
}

/**
 * @param {Record<string, any>} world the world at the end of the run
 * @returns {{ spec: number[], lineages: number }} alive agents per specialisation index, and distinct lineages alive
 */
function endState(world) {
    const spec = new Array(Object.keys(world.config.specialisations).length).fill(0);
    const lineages = new Set();
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            spec[world.spec[slot]] += 1;
            lineages.add(world.lineageId[slot]);
        }
    }
    return { spec, lineages: lineages.size };
}

/**
 * @typedef {object} TraceRecord
 * @property {number} interval ticks between `pop` samples
 * @property {number[]} pop population at ticks `interval`, `2 * interval`, ...
 * @property {number[]} mate mating births in each equal window of the run
 * @property {number[]} split split births in each equal window
 * @property {number[]} spec alive agents per specialisation index at the last tick
 * @property {number[]} deaths deaths by cause (`DEATH_CAUSE` order: starved, eaten, collision, old age, poisoned, trampled)
 * @property {number} lineages distinct lineages alive at the last tick
 */

/**
 * @param {Trace} trace the trace after the last tick
 * @param {Record<string, any>} world the world at the end
 * @param {Record<string, any>} observer the observer at the end
 * @returns {TraceRecord} the compact record a report stores
 */
export function finishTrace(trace, world, observer) {
    return {
        interval: trace.interval,
        pop: trace.pop,
        mate: windowCounts(trace.cumMate, observer.births[BORN_CAUSE.MATE]),
        split: windowCounts(trace.cumSplit, observer.births[BORN_CAUSE.SPLIT]),
        deaths: Array.from(observer.deathsByCause),
        ...endState(world),
    };
}
