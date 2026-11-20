// The census's tick-level trackers (senses-and-motor.md, Signal census): how often a pooled channel's two hits swap
// slots, how often a body inside vision falls on no ray, and how often an action flips while the agent's inputs hardly
// moved. A detector: it reads the world and changes nothing.

import {
    BODY_INPUT,
    OUTPUT_COUNT,
    OUTPUT_INDEX,
    POOLED_CHANNELS,
    POOLED_STRIDE,
    POOLED_VALUES,
    brainLayout,
} from '../sim/brain-layout.js';
import { couldBite } from '../sim/bite-rule.js';
import { isKin } from '../sim/kin.js';
import { visionOf } from '../sim/traits.js';

/** Inputs that moved less than this between two ticks count as still (the chatter's exposure). */
export const CHATTER_INPUT_EPS = 0.01;
/** Two pooled angles closer than this (in cosine and sine) are the same ray. */
const SAME_RAY = 1e-3;
/** The pooled channels a body can fall between rays of: food, threat, prey, other and kin (indices in `POOLED_CHANNELS`). */
export const FLASH_CHANNELS = Object.freeze(['food', 'threat', 'prey', 'other', 'kin']);
/** The two memory read-backs; an action that chatters moves them itself, so the stillness test ignores them. */
const MEMORY_INPUTS = Object.freeze([POOLED_VALUES + BODY_INPUT.MEMORY_A, POOLED_VALUES + BODY_INPUT.MEMORY_B]);

/**
 * @typedef {object} TickTrackers
 * @property {number} agents tracked slots
 * @property {number} inputCount inputs per row
 * @property {Float32Array} previous the tracked agents' input rows last tick
 * @property {Uint32Array} previousId the genome each tracked slot held last tick (0: none)
 * @property {Uint8Array} previousFire each tracked slot's action states last tick (`agents x actions`)
 * @property {number} actions how many actions are tracked
 * @property {Float64Array} swaps ticks the two hits of each pooled channel swapped slots
 * @property {Float64Array} swapChances ticks both hits were present on two ticks running
 * @property {Float64Array} flashes samples in which a body of each flash channel was in vision on no ray
 * @property {Float64Array} flashChances samples in which a body of each flash channel was in vision
 * @property {Float64Array} flips action state changes while the inputs were still, by action
 * @property {number} stillTicks agent-ticks the inputs were still
 */

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {number} agents how many slots are tracked
 * @param {number} actions how many actions are tracked
 * @returns {TickTrackers} empty trackers
 */
export function createTickTrackers(config, agents, actions) {
    const inputCount = brainLayout(config).inputCount;
    return {
        agents,
        inputCount,
        actions,
        previous: new Float32Array(agents * inputCount),
        previousId: new Uint32Array(agents),
        previousFire: new Uint8Array(agents * actions),
        swaps: new Float64Array(POOLED_CHANNELS.length),
        swapChances: new Float64Array(POOLED_CHANNELS.length),
        flashes: new Float64Array(FLASH_CHANNELS.length),
        flashChances: new Float64Array(FLASH_CHANNELS.length),
        flips: new Float64Array(actions),
        stillTicks: 0,
    };
}

/**
 * @param {Float32Array} row the pooled values
 * @param {number} at index of a hit's strength
 * @returns {boolean} whether the hit is present
 */
const present = (row, at) => row[at] > 0;

/**
 * @param {Float32Array} now the current row
 * @param {Float32Array} before last tick's row
 * @param {number} channel the pooled channel
 * @returns {{chance: boolean, swapped: boolean}} whether both hits were present on both ticks, and whether they traded places
 */
function swapOf(now, before, channel) {
    const a = channel * POOLED_STRIDE;
    const b = a + POOLED_STRIDE / 2;
    const both = present(now, a) && present(now, b) && present(before, a) && present(before, b);
    if (!both) {
        return { chance: false, swapped: false };
    }
    const near = (/** @type {number} */ i, /** @type {number} */ j) =>
        Math.abs(now[i + 1] - before[j + 1]) < SAME_RAY && Math.abs(now[i + 2] - before[j + 2]) < SAME_RAY;
    const distinct =
        Math.abs(before[a + 1] - before[b + 1]) >= SAME_RAY || Math.abs(before[a + 2] - before[b + 2]) >= SAME_RAY;
    return { chance: true, swapped: distinct && near(a, b) && near(b, a) };
}

/**
 * @param {TickTrackers} t the trackers
 * @param {Float32Array} pooled the world's pooled rows
 * @param {number} slot the tracked slot
 * @returns {boolean} whether the agent's inputs moved less than `CHATTER_INPUT_EPS` since last tick
 */
function isStill(t, pooled, slot) {
    const base = slot * t.inputCount;
    for (let i = 0; i < t.inputCount; i++) {
        if (!MEMORY_INPUTS.includes(i) && Math.abs(pooled[base + i] - t.previous[base + i]) >= CHATTER_INPUT_EPS) {
            return false;
        }
    }
    return true;
}

/**
 * Counts one tracked slot's action flips against last tick; an action flips when its fired state changes.
 * @param {TickTrackers} t the trackers
 * @param {Record<string, any>} world the world
 * @param {{slot: number, limits: readonly number[]}} agent the slot and the firing limit of each action
 * @param {boolean} quiet whether the agent's inputs were still
 * @returns {void}
 */
function trackFlips(t, world, { slot, limits }, quiet) {
    const fire = t.previousFire.subarray(slot * t.actions, (slot + 1) * t.actions);
    for (let a = 0; a < t.actions; a++) {
        const now = world.outputs[slot * OUTPUT_COUNT + limits[a]] > limits[t.actions + a] ? 1 : 0;
        t.flips[a] += quiet && now !== fire[a] ? 1 : 0;
        fire[a] = now;
    }
}

/**
 * Counts the swaps and the action flips of one tracked slot against its last tick, then remembers this tick.
 * @param {TickTrackers} t the trackers
 * @param {Record<string, any>} world the world
 * @param {{slot: number, limits: readonly number[]}} agent the slot and the firing limit of each action
 * @returns {void}
 */
function trackSlot(t, world, { slot, limits }) {
    const row = world.pooled.subarray(slot * t.inputCount, (slot + 1) * t.inputCount);
    const before = t.previous.subarray(slot * t.inputCount, (slot + 1) * t.inputCount);
    const fresh = t.previousId[slot] === world.genomeId[slot] && t.previousId[slot] !== 0;
    const still = fresh && isStill(t, world.pooled, slot);
    for (let c = 0; fresh && c < POOLED_CHANNELS.length; c++) {
        const { chance, swapped } = swapOf(row, before, c);
        t.swapChances[c] += chance ? 1 : 0;
        t.swaps[c] += swapped ? 1 : 0;
    }
    t.stillTicks += still ? 1 : 0;
    trackFlips(t, world, { slot, limits }, still);
    before.set(row);
    t.previousId[slot] = world.genomeId[slot];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the tracked agent
 * @param {number} other another alive agent
 * @returns {number} the index in `FLASH_CHANNELS` of the channel `other` falls in for `slot` (`agentChannel` in ray-march.js)
 */
function channelOf(world, slot, other) {
    if (isKin(world, slot, other)) {
        return 4;
    }
    if (couldBite(world, other, slot)) {
        return 1;
    }
    return couldBite(world, slot, other) ? 2 : 3;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the tracked agent
 * @param {number} range its vision
 * @param {{xs: ArrayLike<number>, ys: ArrayLike<number>, i: number}} body a body's position arrays and index
 * @returns {boolean} whether the body is inside the range
 */
function within(world, slot, range, { xs, ys, i }) {
    const dx = xs[i] - world.x[slot];
    const dy = ys[i] - world.y[slot];
    return dx * dx + dy * dy < range * range;
}

/**
 * Whether a body of each class is inside the agent's vision.
 * @param {Record<string, any>} world the world
 * @param {number} slot the tracked agent
 * @returns {boolean[]} for each of `FLASH_CHANNELS`, whether a body of that class is within `visionOf`
 */
function inVision(world, slot) {
    const range = visionOf(world, slot);
    const found = FLASH_CHANNELS.map(() => false);
    for (let f = 0; f < world.foodAlive.length && !found[0]; f++) {
        found[0] = world.foodAlive[f] === 1 && within(world, slot, range, { xs: world.foodX, ys: world.foodY, i: f });
    }
    for (let o = 0; o < world.alive.length; o++) {
        if (o !== slot && world.alive[o] === 1 && within(world, slot, range, { xs: world.x, ys: world.y, i: o })) {
            found[channelOf(world, slot, o)] = true;
        }
    }
    return found;
}

/**
 * Counts, for one tracked agent, which classes of body are in vision while their channel holds no hit.
 * @param {TickTrackers} t the trackers
 * @param {Record<string, any>} world the world
 * @param {number} slot the tracked agent
 * @returns {void}
 */
function flashSlot(t, world, slot) {
    const seen = inVision(world, slot);
    FLASH_CHANNELS.forEach((name, k) => {
        if (seen[k]) {
            const strength = world.pooled[slot * t.inputCount + POOLED_CHANNELS.indexOf(name) * POOLED_STRIDE];
            t.flashChances[k] += 1;
            t.flashes[k] += strength === 0 ? 1 : 0;
        }
    });
}

/**
 * Feeds the trackers one tick.
 * @param {TickTrackers} t the trackers
 * @param {Record<string, any>} world the world
 * @param {{sample: boolean, limit: number, limits: readonly number[]}} tick whether flashes are counted this tick, how
 *   many slots are tracked, and the output index then the firing limit of each action
 * @returns {void}
 */
export function noteTickTrackers(t, world, { sample, limit, limits }) {
    for (let slot = 0; slot < limit; slot++) {
        if (world.alive[slot] !== 1) {
            t.previousId[slot] = 0;
            continue;
        }
        trackSlot(t, world, { slot, limits });
        if (sample) {
            flashSlot(t, world, slot);
        }
    }
}

/**
 * @typedef {object} TrackerRows
 * @property {Map<number, number>} swapByInput the swap rate of a channel, under the index of each of its two hits' strengths
 * @property {Map<number, number>} flashByInput the flash rate of a channel, under the index of its first hit's strength
 * @property {Map<string, number>} chatterBy action flips per 100 still ticks, by output name
 */

/**
 * @param {TickTrackers} t the trackers
 * @param {readonly string[]} actionNames the tracked actions' output names, in tracking order
 * @returns {TrackerRows} the rates
 */
export function trackerRows(t, actionNames) {
    const swapByInput = new Map();
    POOLED_CHANNELS.forEach((_, c) => {
        const rate = t.swapChances[c] === 0 ? 0 : t.swaps[c] / t.swapChances[c];
        swapByInput.set(c * POOLED_STRIDE, rate);
        swapByInput.set(c * POOLED_STRIDE + POOLED_STRIDE / 2, rate);
    });
    const flashByInput = new Map();
    FLASH_CHANNELS.forEach((name, k) => {
        flashByInput.set(
            POOLED_CHANNELS.indexOf(name) * POOLED_STRIDE,
            t.flashChances[k] === 0 ? 0 : t.flashes[k] / t.flashChances[k],
        );
    });
    const chatterBy = new Map();
    actionNames.forEach((name, a) => {
        chatterBy.set(name, t.stillTicks === 0 ? 0 : (100 * t.flips[a]) / t.stillTicks);
    });
    return { swapByInput, flashByInput, chatterBy };
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {readonly {output: string, threshold: string | null}[]} actions the tracked actions
 * @returns {number[]} the output index of each action, then the firing limit of each (`noteTickTrackers`' `limits`)
 */
export function limitsOf(config, actions) {
    return [
        ...actions.map((action) => OUTPUT_INDEX[/** @type {keyof typeof OUTPUT_INDEX} */ (action.output)]),
        ...actions.map((action) => (action.threshold === null ? 0 : config[action.threshold])),
    ];
}
