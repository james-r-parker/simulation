// The input-activity sample: every `ACTIVITY_SAMPLE_TICKS` ticks from burn-in, for each alive agent, which values of the
// `pooled` row (the row the genome multiplies, `layout.inputCount` values) are nonzero. A pooled channel's strength,
// cosine and sine go silent together because they are zero when no ray reports the channel. From the counts it keeps
// the run-so-far active share of every input and the rare set: inputs under `RARE_SHARE` over at least
// `RARE_MIN_SAMPLES` agent-samples (before that no input is rare). The raw `inputs` row is never sampled.

import { BURN_IN_TICKS } from './burn-in.js';

/** Ticks between samples. */
export const ACTIVITY_SAMPLE_TICKS = 16;

/** An input with a run-so-far active share under this is rare. */
export const RARE_SHARE = 0.01;

/** Agent-samples needed before any input can be rare. */
export const RARE_MIN_SAMPLES = 10000;

/**
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @returns {Record<string, any>} an empty activity state: counts per input, the rare mask and its compact index list
 */
export function createInputActivity(layout) {
    return {
        inputCount: layout.inputCount,
        samples: 0,
        active: new Float64Array(layout.inputCount),
        rare: new Uint8Array(layout.inputCount),
        rareIdx: new Int32Array(layout.inputCount),
        rareCount: 0,
    };
}

/**
 * Recomputes the rare mask and index list from the counts.
 * @param {Record<string, any>} activity the activity state
 * @returns {void}
 */
function refreshRare(activity) {
    const ready = activity.samples >= RARE_MIN_SAMPLES;
    let count = 0;
    for (let i = 0; i < activity.inputCount; i++) {
        const rare = ready && activity.active[i] / activity.samples < RARE_SHARE;
        activity.rare[i] = rare ? 1 : 0;
        if (rare) {
            activity.rareIdx[count++] = i;
        }
    }
    activity.rareCount = count;
}

/**
 * Takes the sample when the tick is a sample tick at or after burn-in, then refreshes the rare set.
 * @param {Record<string, any>} activity the activity state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleInputActivity(activity, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % ACTIVITY_SAMPLE_TICKS !== 0) {
        return;
    }
    const n = activity.inputCount;
    const { alive, pooled } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1) {
            continue;
        }
        activity.samples += 1;
        for (let i = 0; i < n; i++) {
            activity.active[i] += pooled[slot * n + i] !== 0 ? 1 : 0;
        }
    }
    refreshRare(activity);
}

/**
 * @param {Record<string, any>} activity the activity state
 * @returns {number[] | null} the active share of every input (the report's `inputActivity` table), null with no sample
 */
export function activityTable(activity) {
    if (activity.samples === 0) {
        return null;
    }
    return Array.from(activity.active, (count) => count / activity.samples);
}

/**
 * @param {Record<string, any>} activity the activity state
 * @returns {number | null} the mean share of nonzero values in a sampled row, null with no sample
 */
export function meanActiveShare(activity) {
    if (activity.samples === 0) {
        return null;
    }
    let total = 0;
    for (let i = 0; i < activity.inputCount; i++) {
        total += activity.active[i];
    }
    return total / (activity.samples * activity.inputCount);
}
