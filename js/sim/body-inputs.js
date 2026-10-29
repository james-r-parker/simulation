// Writes an agent's body inputs 0 to 18 and 32 to 34 after its ray block; scent-inputs.js writes 19 to 31.

import { BODY_INPUT, OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from './brain-layout.js';
import { detCos, detSin } from './det-math.js';
import { isReadyToMate } from './mate-eligibility.js';
import { samplePheromone } from './pheromones.js';
import { temperatureInputs } from './temperature.js';
import { TIMER_CAP } from './world.js';

/** @typedef {import('./world.js').World} World */

const SPEC_DIVISOR = 4;

// The season phase is the same for every agent in a tick, so its sine and cosine are computed once per phase value.
// This is a pure memo of `detSin` and `detCos`, so it cannot change a result.
let seasonPhase = NaN;
let seasonSin = 0;
let seasonCos = 0;

/**
 * Refreshes the memoised season sine and cosine when `phase` differs from the last one.
 * @param {number} phase the season phase in radians
 * @returns {void}
 */
function seasonTrig(phase) {
    if (phase !== seasonPhase) {
        seasonPhase = phase;
        seasonSin = detSin(phase);
        seasonCos = detCos(phase);
    }
}

/**
 * Writes body inputs 32 to 34: `sex` (0 female, 1 male) and last tick's `MEMORY_A` and
 * `MEMORY_B` outputs (the outputs row still holds them, as the brain runs after sensing).
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @param {number} o the offset of the agent's body block in `world.inputs`
 * @returns {void}
 */
function writeMemoryInputs(world, slot, o) {
    const out = world.inputs;
    out[o + BODY_INPUT.SEX] = world.sex[slot];
    out[o + BODY_INPUT.MEMORY_A] = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_A];
    out[o + BODY_INPUT.MEMORY_B] = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MEMORY_B];
}

/**
 * Writes body inputs 0 to 18 and 32 to 34 at `rayCount x RAY_CHANNELS` into the agent's inputs row.
 * @param {World} world the world
 * @param {number} slot the alive agent
 * @param {number} [cH] the cosine of the agent's heading, when the caller has it
 * @param {number} [sH] the sine of the agent's heading, when the caller has it
 * @returns {void}
 */
export function writeBodyInputs(world, slot, cH = detCos(world.angle[slot]), sH = detSin(world.angle[slot])) {
    const { maxEnergy, maxVelocity, maxTurn, baseSize, energyToSize, maxAgeTicks, rayCount } = world.config;
    const o = slot * world.layout.inputCount + rayCount * RAY_CHANNELS;
    const out = world.inputs;
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
    seasonTrig(phase);
    out[o + 9] = seasonSin;
    out[o + 10] = seasonCos;
    out[o + 11] = 1 - world.ateTimer[slot] / TIMER_CAP;
    out[o + 12] = 1 - world.bittenTimer[slot] / TIMER_CAP;
    out[o + 13] = world.spec[slot] / SPEC_DIVISOR;
    out[o + 14] = world.ageTicks[slot] / maxAgeTicks;
    temperatureInputs(world.config, world.temperature[slot], out, o + 15);
    writeMemoryInputs(world, slot, o);
}
