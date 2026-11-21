// What the role references share (brain-reflex-tests.md, Phase 5): the gait of a reference that is going somewhere, a
// ray's nearness, a heard call's loudness and side, and the pooled body sense a reference reads. Each reads only what a
// brain reads.

import { BODY_INPUT, OUTPUT_INDEX, RAY_CHANNELS, inputOffsets } from '../sim/brain-layout.js';
import { poolRays } from '../sim/ray-pool.js';
import { nearestClassRay } from './observer-tick.js';
import { bodyInput } from './scripted-combat.js';
import { CH_PREY, setOutput, turnTowards, write } from './scripted-parts.js';

/** The gait of a reference that is going somewhere: well above every thrust bar. */
export const GO_THRUST = 0.6;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} k a ray
 * @returns {number} the ray's nearness (1 at contact, 0 at the eye's range)
 */
export const nearness = (world, slot, k) => world.inputs[slot * world.layout.rawInputCount + k * RAY_CHANNELS];

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} [call] `BODY_INPUT.HEARD_ALARM` (default) or `BODY_INPUT.HEARD_HUNT`
 * @returns {number} the heard call's loudness
 */
export const heardLoudness = (world, slot, call = BODY_INPUT.HEARD_ALARM) => bodyInput(world, slot, call);

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} [call] `BODY_INPUT.HEARD_ALARM` (default) or `BODY_INPUT.HEARD_HUNT`
 * @returns {number} the side of the heard call: positive on the positive `TURN` side
 */
export const heardSide = (world, slot, call = BODY_INPUT.HEARD_ALARM) => bodyInput(world, slot, call + 2);

/**
 * Pools the slot's rays and reads one pooled value, as the brain's input row holds it.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number[]} indices the offsets of the values wanted, from the start of the pooled block
 * @returns {number[]} the pooled values at those offsets (`inputOffsets` names them)
 */
export function pooledValues(world, slot, indices) {
    poolRays(world, slot);
    const row = slot * world.layout.inputCount;
    return indices.map((at) => world.pooled[row + at]);
}

/**
 * @param {Record<string, any>} world the world
 * @returns {{pooled: Readonly<Record<string, number>>, sense: number, count: number}} the offsets of the pooled channels,
 *   of the body sense block (the two prey hits' size, speed and closing, then the threat's) and of the four view shares
 */
export function pooledAt(world) {
    const offsets = inputOffsets(world.config);
    return { pooled: offsets.pooled, sense: offsets.senseStart, count: offsets.countStart };
}

/** `SPRINT` effort per unit of nearness: 1 from half the nearness a prey at the staged `near` share has. */
const SPRINT_PER_NEARNESS = 2;

/**
 * Heads for the nearest prey ray at full thrust and writes the rest of the row 0.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the nearest prey ray, or -1
 */
export function closeOnPrey(world, slot) {
    const k = nearestClassRay(world, slot, CH_PREY, CH_PREY);
    write(world, slot, k < 0 ? 0 : 1, turnTowards(k, world.config.rayCount));
    return k;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {void}
 */
export function sprintOnPrey(world, slot) {
    const k = closeOnPrey(world, slot);
    if (k >= 0) {
        setOutput(world, slot, OUTPUT_INDEX.SPRINT, Math.min(1, SPRINT_PER_NEARNESS * nearness(world, slot, k)));
    }
}
