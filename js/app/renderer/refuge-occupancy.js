// How full each refuge is: the number of blobs inside its disc, smoothed, as a level in [0, 1] that brightens the refuge
// glow. A viewer sees the Refuge scene (prey stacking into a ring under threat, then leaking back out) as a ring that
// lights up while it is used. A drawing cue read from the frame's agents; no allocation per call.

import { pursuitRules } from '../pursuit.js';

/** Blobs inside a refuge that light it fully. */
export const REFUGE_FULL_COUNT = 6;
/** Milliseconds between counts. */
export const REFUGE_COUNT_MS = 250;
/** The share of the gap to the target the level closes at each count. */
export const REFUGE_SMOOTHING = 0.3;

/**
 * @typedef {object} RefugeOccupancy
 * @property {readonly {x: number, y: number, radius: number}[]} refuges the discs
 * @property {Float32Array} level the smoothed level of each disc, 0 to 1
 * @property {Uint8Array} canHunt 1 for the specs that hunt, which do not count as sheltering
 * @property {boolean} paused true while the terrain item is off, so the glow is neither counted nor shown
 * @property {number} lastMs when the last count ran, -Infinity before the first
 */

/**
 * @param {Record<string, any>} info `ready.info`: the discs are `info.terrain.refuges`, none when absent
 * @returns {RefugeOccupancy} a tracker with every level at 0
 */
export function createRefugeOccupancy(info) {
    const refuges = info.terrain?.refuges ?? [];
    return {
        refuges,
        level: new Float32Array(refuges.length),
        canHunt: pursuitRules(info).canHunt,
        paused: false,
        lastMs: -Infinity,
    };
}

/**
 * Counts the agents inside each disc and moves each level towards `count / REFUGE_FULL_COUNT`, at most once every
 * `REFUGE_COUNT_MS`.
 * @param {RefugeOccupancy} state the tracker
 * @param {{count: number, x: Float32Array, y: Float32Array, spec: Uint32Array}} agents the frame's agents
 * @param {number} nowMs the frame clock
 * @returns {boolean} whether the levels changed
 */
export function stepRefugeOccupancy(state, agents, nowMs) {
    if (nowMs - state.lastMs < REFUGE_COUNT_MS) {
        return false;
    }
    state.lastMs = nowMs;
    let changed = false;
    for (let r = 0; r < state.refuges.length; r++) {
        const disc = state.refuges[r];
        const r2 = disc.radius * disc.radius;
        let inside = 0;
        for (let i = 0; i < agents.count; i++) {
            const dx = agents.x[i] - disc.x;
            const dy = agents.y[i] - disc.y;
            if (dx * dx + dy * dy <= r2 && state.canHunt[agents.spec[i]] !== 1) {
                inside += 1;
            }
        }
        const target = Math.min(1, inside / REFUGE_FULL_COUNT);
        const next = state.level[r] + (target - state.level[r]) * REFUGE_SMOOTHING;
        const settled = Math.abs(next - target) < 0.005 ? target : next;
        changed = changed || settled !== state.level[r];
        state.level[r] = settled;
    }
    return changed;
}
