// Writes an agent's scent and call body inputs (offsets 19 to 31): antenna samples, hunt scent and heard calls.

import { RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { samplePheromone } from './pheromones.js';
import { HEARD_STRIDE } from './world.js';

/** @typedef {import('./world.js').World} World */

/** The first scent input within the body inputs; offsets 0 to 18 belong to `writeBodyInputs`. */
const FIRST_SCENT_INPUT = 19;

/**
 * Samples a grid at one antenna: the point `antennaReach` from the agent, `antennaAngle` off its heading.
 * @param {World} world the world
 * @param {Float32Array} grid `world.danger`, `world.attack` or `world.hunt`
 * @param {number} slot the agent
 * @param {number} side +1 for the left antenna, -1 for the right
 * @returns {number} the sample at that antenna, 0 to 1
 */
function antenna(world, grid, slot, side) {
    const cH = detCos(world.angle[slot]);
    const sH = detSin(world.angle[slot]);
    const cA = world.antennaCos[0];
    const sA = side * world.antennaSin[0];
    const reach = world.config.antennaReach;
    const x = world.x[slot] + reach * (cH * cA - sH * sA);
    const y = world.y[slot] + reach * (sH * cA + cH * sA);
    return samplePheromone(world, grid, x, y);
}

/**
 * Writes loudness, ahead and side for one heard call.
 * @param {World} world the world
 * @param {number} slot the hearer
 * @param {number} half 0 for the alarm half of the `heard` row, 3 for the hunt half
 * @param {number} at the input index of the loudness; ahead and side follow
 * @returns {void}
 */
function heardInputs(world, slot, half, at) {
    const row = slot * HEARD_STRIDE + half;
    const cH = detCos(world.angle[slot]);
    const sH = detSin(world.angle[slot]);
    const ux = world.heard[row + 1];
    const uy = world.heard[row + 2];
    world.inputs[at] = world.heard[row];
    world.inputs[at + 1] = ux * cH + uy * sH;
    world.inputs[at + 2] = -ux * sH + uy * cH;
}

/**
 * Writes body inputs 19 to 31 of an agent: danger and attack at the left and right antennae, the hunt scent here and
 * at both antennae, then the loudest heard alarm and hunt call as loudness, ahead and side.
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @returns {void}
 */
export function writeScentInputs(world, slot) {
    const o = slot * world.layout.inputCount + world.config.rayCount * RAY_CHANNELS + FIRST_SCENT_INPUT;
    const out = world.inputs;
    out[o] = antenna(world, world.danger, slot, 1);
    out[o + 1] = antenna(world, world.danger, slot, -1);
    out[o + 2] = antenna(world, world.attack, slot, 1);
    out[o + 3] = antenna(world, world.attack, slot, -1);
    out[o + 4] = samplePheromone(world, world.hunt, world.x[slot], world.y[slot]);
    out[o + 5] = antenna(world, world.hunt, slot, 1);
    out[o + 6] = antenna(world, world.hunt, slot, -1);
    heardInputs(world, slot, 0, o + 7);
    heardInputs(world, slot, 3, o + 10);
}
