// The memory probes' controls: what the probe overwrites in an agent's `inputs` and `hidden` rows after the sense
// phase and before the brain runs. Every index is read from the offset table (`inputOffsets`), never typed.

import { RAY_CHANNELS, inputOffsets } from '../sim/brain-layout.js';
import { CH_KIN, CH_THREAT } from './scripted-parts.js';

/** The control names: no manipulation, the blindfold window, and the window with the state wiped each tick. */
export const CONTROL = Object.freeze({ INTACT: 'intact', BLINDFOLD: 'blindfold', AMNESIA: 'amnesia' });

/** Values in the heard hunt call (loudness, ahead, side) and in the hunt scent (here, left antenna, right antenna). */
const HEARD_WIDTH = 3;
const HUNT_SCENT_WIDTH = 3;

/**
 * @typedef {readonly [number, number]} Range a half-open range `[start, end)` of indices in an agent's raw `inputs` row
 */

/**
 * @typedef {object} Timing when the blindfold window opens and how long it lasts
 * @property {(world: Record<string, any>, slot: number) => boolean} trigger true on the first tick the window may be
 *   counted from (read on the sensed row, before any control touches it)
 * @property {number} delay ticks from the trigger to the window opening
 * @property {number} length ticks the window lasts
 */

/**
 * @typedef {object} Control
 * @property {string} name a `CONTROL` value, or `kin-blind`
 * @property {Timing | null} timing the window clock; null when the scenario has none
 * @property {boolean} blind whether the window zeroes `windowRanges` (false: the clock only runs)
 * @property {readonly Range[]} windowRanges the rows zeroed during the window
 * @property {boolean} amnesia whether each tick zeroes `hidden` and the memory pair
 * @property {readonly Range[]} wipeRanges the memory pair
 * @property {boolean} kinBlind whether each tick hides the allies
 * @property {readonly Range[]} allyRanges the heard hunt call and the hunt scent
 * @property {{start: number | null}} state the tick the window opened, null until the trigger fires
 */

/**
 * The ranges of the raw `inputs` row for each part of the input block, all from the offset table.
 * @param {Readonly<Record<string, any>>} config the config (the ray count moves the body block)
 * @returns {{rays: Range, scent: Range, memory: Range, allies: readonly Range[]}} the ranges
 */
export function inputRanges(config) {
    const offsets = inputOffsets(config);
    const raw = (/** @type {number} */ index) => offsets.rawBodyStart + index - offsets.bodyStart;
    return {
        rays: [0, offsets.rawBodyStart],
        scent: [raw(offsets.scentStart), raw(offsets.sex)],
        memory: [raw(offsets.memoryA), raw(offsets.memoryB) + 1],
        allies: [
            [raw(offsets.heardHunt), raw(offsets.heardHunt) + HEARD_WIDTH],
            [raw(offsets.huntScent), raw(offsets.huntScent) + HUNT_SCENT_WIDTH],
        ],
    };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} channel a ray channel
 * @returns {boolean} whether any of the agent's rays has the channel set
 */
export function raySees(world, slot, channel) {
    const row = slot * world.layout.rawInputCount;
    for (let k = 0; k < world.config.rayCount; k++) {
        if (world.inputs[row + k * RAY_CHANNELS + channel] > 0) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {boolean} whether any ray of the agent sees a threat (something that can bite it)
 */
export function seesThreat(world, slot) {
    return raySees(world, slot, CH_THREAT);
}

/**
 * Builds a control for one trial.
 * @param {Readonly<Record<string, any>>} config the trial's config
 * @param {{name: string, timing?: Timing | null, blind?: boolean, scent?: boolean, amnesia?: boolean,
 *   kinBlind?: boolean}} spec the control: `scent` adds the scent block to the window's rows
 * @returns {Control} a control with its own clock
 */
export function createControl(config, spec) {
    const ranges = inputRanges(config);
    return {
        name: spec.name,
        timing: spec.timing ?? null,
        blind: spec.blind ?? false,
        windowRanges: spec.scent === true ? [ranges.rays, ranges.scent] : [ranges.rays],
        amnesia: spec.amnesia ?? false,
        wipeRanges: [ranges.memory],
        kinBlind: spec.kinBlind ?? false,
        allyRanges: ranges.allies,
        state: { start: null },
    };
}

/**
 * @param {Control} control the control
 * @returns {number | null} the tick the window ends, or null before it has opened (or without a clock)
 */
export function windowEnd(control) {
    return control.timing === null || control.state.start === null ? null : control.state.start + control.timing.length;
}

/**
 * Zeroes the rays of every ray that hit kin: its proximity and its kin class channel, so an ally is not seen.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
function hideKinRays(world, slot) {
    const row = slot * world.layout.rawInputCount;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = row + k * RAY_CHANNELS;
        if (world.inputs[base + CH_KIN] > 0) {
            world.inputs[base] = 0;
            world.inputs[base + CH_KIN] = 0;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {readonly Range[]} ranges ranges of the agent's raw row
 * @returns {void}
 */
function zero(world, slot, ranges) {
    const row = slot * world.layout.rawInputCount;
    for (const [start, end] of ranges) {
        world.inputs.fill(0, row + start, row + end);
    }
}

/**
 * Runs the window clock and says whether the blindfold window is open on this tick.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {Control} control the control
 * @returns {boolean} true inside the window
 */
function windowOpen(world, slot, control) {
    const { timing, state } = control;
    if (timing === null) {
        return false;
    }
    if (state.start === null && timing.trigger(world, slot)) {
        state.start = world.tick + timing.delay;
    }
    return state.start !== null && world.tick >= state.start && world.tick < state.start + timing.length;
}

/**
 * Applies a control to one agent: runs the window clock, then zeroes what the control says. Called after the sense
 * phase and before the brain.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {Control} control the control
 * @returns {void}
 */
export function applyControl(world, slot, control) {
    if (windowOpen(world, slot, control) && control.blind) {
        zero(world, slot, control.windowRanges);
    }
    if (control.amnesia) {
        const { hidden, layout } = world;
        hidden.fill(0, slot * layout.hidden, (slot + 1) * layout.hidden);
        zero(world, slot, control.wipeRanges);
    }
    if (control.kinBlind) {
        hideKinRays(world, slot);
        zero(world, slot, control.allyRanges);
    }
}
