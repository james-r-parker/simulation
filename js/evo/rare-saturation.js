// The rare-input saturation jump: when an agent first sees a rare input fire, how much does the share of its hidden
// units beyond `SATURATED` change? The firing check and the hidden share are read at a 4-tick sample (`SATURATION_TICKS`),
// the rarity test is the 16-tick sample's (`input-activity.js`). For a first firing at sample k the jump is the share at
// sample k + 1 minus the share at sample k - 1. Only inputs in the rare set are scanned, and an input is marked fired
// when seen firing while rare, so an agent that fired an input before it became rare may count once: rare inputs fire
// in under 1% of samples, so the bias is small and the scan costs nothing before an input is rare.

import { BURN_IN_TICKS } from './burn-in.js';

/** Ticks between samples. */
export const SATURATION_TICKS = 4;

/** A hidden unit with an absolute value above this is saturated. */
export const SATURATED = 0.95;

/** The metric needs at least this many first firings. */
export const MIN_EVENTS = 100;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @returns {Record<string, any>} the per-slot state (fired flags, last share, pending firings) and the totals
 */
export function createSaturation(config, layout) {
    const n = config.maxAgents;
    return {
        inputCount: layout.inputCount,
        fired: new Uint8Array(n * layout.inputCount),
        lastShare: new Float64Array(n).fill(NaN),
        pendingPrev: new Float64Array(n),
        pendingCount: new Uint16Array(n),
        jumpSum: 0,
        events: 0,
    };
}

/**
 * Clears a slot, for a newborn or a reused slot.
 * @param {Record<string, any>} state the saturation state
 * @param {number} slot the slot
 * @returns {void}
 */
export function resetSaturationSlot(state, slot) {
    state.fired.fill(0, slot * state.inputCount, (slot + 1) * state.inputCount);
    state.lastShare[slot] = NaN;
    state.pendingCount[slot] = 0;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the alive slot
 * @returns {number} the share of its hidden units with an absolute value above `SATURATED`
 */
function saturatedShare(world, slot) {
    const H = world.layout.hidden;
    let count = 0;
    for (let j = 0; j < H; j++) {
        count += Math.abs(world.hidden[slot * H + j]) > SATURATED ? 1 : 0;
    }
    return count / H;
}

/**
 * Notes the first firings of the rare inputs of one agent at this sample.
 * @param {Record<string, any>} state the saturation state
 * @param {{activity: Record<string, any>, world: Record<string, any>}} source the activity state and the world
 * @param {number} slot the alive slot
 * @returns {void}
 */
function noteFirings(state, source, slot) {
    const { activity, world } = source;
    const n = state.inputCount;
    for (let r = 0; r < activity.rareCount; r++) {
        const i = activity.rareIdx[r];
        if (world.pooled[slot * n + i] === 0 || state.fired[slot * n + i] === 1) {
            continue;
        }
        state.fired[slot * n + i] = 1;
        if (!Number.isNaN(state.lastShare[slot])) {
            if (state.pendingCount[slot] === 0) {
                state.pendingPrev[slot] = state.lastShare[slot];
            }
            state.pendingCount[slot] += 1;
        }
    }
}

/**
 * Takes the 4-tick sample at or after burn-in: settles the firings noted at the last sample, notes this sample's first
 * firings of rare inputs, and records each agent's saturated share.
 * @param {Record<string, any>} state the saturation state
 * @param {{activity: Record<string, any>, world: Record<string, any>}} source the activity state and the world
 * @returns {void}
 */
export function sampleSaturation(state, source) {
    const { world } = source;
    if (world.tick < BURN_IN_TICKS || world.tick % SATURATION_TICKS !== 0) {
        return;
    }
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        const share = saturatedShare(world, slot);
        if (state.pendingCount[slot] > 0) {
            state.jumpSum += state.pendingCount[slot] * (share - state.pendingPrev[slot]);
            state.events += state.pendingCount[slot];
            state.pendingCount[slot] = 0;
        }
        noteFirings(state, source, slot);
        state.lastShare[slot] = share;
    }
}
