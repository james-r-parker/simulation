// Writes an agent's scent and call body inputs (offsets 19 to 31): antenna samples, hunt scent and heard calls.

import { RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { samplePheromone } from './pheromones.js';
import { HEARD_STRIDE } from './world.js';

/** @typedef {import('./world.js').World} World */

/** The first scent input within the body inputs; offsets 0 to 18 belong to `writeBodyInputs`. */
const FIRST_SCENT_INPUT = 19;

/** Offset from the alarm half of a `heard` row to the hunt half. */
const ALARM_TO_HUNT = 3;

/**
 * Writes body inputs 19 to 31 of an agent: danger and attack at the left and right antennae, the hunt scent here and
 * at both antennae, then the loudest heard alarm and hunt call as loudness, ahead and side.
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @param {number} [cH] the cosine of the agent's heading, when the caller has it
 * @param {number} [sH] the sine of the agent's heading, when the caller has it
 * @returns {void}
 */
export function writeScentInputs(world, slot, cH = detCos(world.angle[slot]), sH = detSin(world.angle[slot])) {
    const { danger, attack, hunt, antennaCos, antennaSin, config, x, y } = world;
    const o = slot * world.layout.inputCount + config.rayCount * RAY_CHANNELS + FIRST_SCENT_INPUT;
    const out = world.inputs;
    const reach = config.antennaReach;
    const cA = antennaCos[0];
    const sA = antennaSin[0];
    const px = x[slot];
    const py = y[slot];
    // The left antenna is +antennaAngle off the heading, the right one -antennaAngle.
    const lx = px + reach * (cH * cA - sH * sA);
    const ly = py + reach * (sH * cA + cH * sA);
    const rx = px + reach * (cH * cA - sH * -sA);
    const ry = py + reach * (sH * cA + cH * -sA);
    out[o] = samplePheromone(world, danger, lx, ly);
    out[o + 1] = samplePheromone(world, danger, rx, ry);
    out[o + 2] = samplePheromone(world, attack, lx, ly);
    out[o + 3] = samplePheromone(world, attack, rx, ry);
    out[o + 4] = samplePheromone(world, hunt, px, py);
    out[o + 5] = samplePheromone(world, hunt, lx, ly);
    out[o + 6] = samplePheromone(world, hunt, rx, ry);
    // The loudest heard alarm (half 0) then hunt call (half 3): loudness, ahead and side.
    const { heard } = world;
    for (let h = 0; h < 2; h++) {
        const row = slot * HEARD_STRIDE + h * ALARM_TO_HUNT;
        const at = o + 7 + h * 3;
        const ux = heard[row + 1];
        const uy = heard[row + 2];
        out[at] = heard[row];
        out[at + 1] = ux * cH + uy * sH;
        out[at + 2] = -ux * sH + uy * cH;
    }
}
