// Writes an agent's nineteen body inputs after its ray block.

import { detCos, detSin } from './det-math.js';
import { isReadyToMate } from './mate-eligibility.js';
import { samplePheromone } from './pheromones.js';
import { temperatureInputs } from './temperature.js';
import { TIMER_CAP } from './world.js';

/** @typedef {import('./world.js').World} World */

const SPEC_DIVISOR = 4;

/**
 * Writes body inputs 1 to 19 at `rayCount x 8` into the agent's inputs row.
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @returns {void}
 */
export function writeBodyInputs(world, slot) {
    const { maxEnergy, maxVelocity, maxTurn, baseSize, energyToSize, maxAgeTicks, rayCount } = world.config;
    const o = slot * world.layout.inputCount + rayCount * 8;
    const out = world.inputs;
    const cH = detCos(world.angle[slot]);
    const sH = detSin(world.angle[slot]);
    const vx = world.vx[slot];
    const vy = world.vy[slot];
    const x = world.x[slot];
    const y = world.y[slot];
    const phase = 2 * Math.PI * world.season[1];
    out[o] = world.energy[slot] / maxEnergy;
    out[o + 1] = (vx * cH + vy * sH) / maxVelocity;
    out[o + 2] = (-vx * sH + vy * cH) / maxVelocity;
    out[o + 3] = world.turnRate[slot] / maxTurn;
    out[o + 4] = world.size[slot] / (baseSize + maxEnergy / energyToSize);
    out[o + 5] = world.pregnancy[slot] > 0 ? 1 : 0;
    out[o + 6] = isReadyToMate(world, slot) ? 1 : 0;
    out[o + 7] = samplePheromone(world, world.danger, x, y);
    out[o + 8] = samplePheromone(world, world.attack, x, y);
    out[o + 9] = detSin(phase);
    out[o + 10] = detCos(phase);
    out[o + 11] = 1 - world.ateTimer[slot] / TIMER_CAP;
    out[o + 12] = 1 - world.bittenTimer[slot] / TIMER_CAP;
    out[o + 13] = world.spec[slot] / SPEC_DIVISOR;
    out[o + 14] = world.ageTicks[slot] / maxAgeTicks;
    temperatureInputs(world.config, world.temperature[slot], out, o + 15);
}
