// The body-temperature rules as functions of the world and one temperature value; allocates nothing.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { stepChilled } from './effect-chilled.js';
import { LANE_ID, liveOf } from './effects.js';
import { coldFactor } from './terrain.js';

/** @typedef {import('./world.js').World} World */

/**
 * Adds `amount` to an agent's temperature, capped at `temperatureMax`.
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @param {number} amount the temperature gained, non-negative
 * @returns {void}
 */
export function gainTemperature(world, slot, amount) {
    world.temperature[slot] = Math.min(world.config.temperatureMax, world.temperature[slot] + amount);
}

/**
 * Advances one alive agent's temperature by a tick: movement warms it by its speed as a fraction of `maxVelocity`
 * (capped at its `heatSpeedCap` lane, 1 by default) times its `temperatureGainMove` lane, its `temperatureLossPassive`
 * lane cools it, scaled by the season, and a sprint warms it by its `sprintHeat` lane times the sprint delivered
 * (`sprintFactor`, 1 with the store off); then clamps to 0 to `temperatureMax` and advances the `chilled` clock. The heat
 * lanes are read with the effects applied (`liveOf`: the adrenaline effects warm a body, a huddle cools it less).
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function stepTemperature(world, slot) {
    const c = world.config;
    const { lanes } = world;
    const vx = world.vx[slot];
    const vy = world.vy[slot];
    const speed = Math.sqrt(vx * vx + vy * vy);
    const modifier = c.seasons[world.season[0]].temperatureModifier;
    const loss = Math.max(0, 1 - modifier * c.temperatureSeasonSlope);
    const sprinting = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0;
    const next =
        world.temperature[slot] +
        Math.min(speed / c.maxVelocity, lanes.heatSpeedCap[slot]) * liveOf(world, slot, LANE_ID.temperatureGainMove) -
        liveOf(world, slot, LANE_ID.temperatureLossPassive) * loss * coldFactor(c, world.y[slot]) +
        (sprinting ? lanes.sprintHeat[slot] * world.sprintFactor[slot] : 0);
    world.temperature[slot] = Math.min(c.temperatureMax, Math.max(0, next));
    stepChilled(world, slot);
}

/**
 * Writes the four temperature inputs at `out[offset]` to `out[offset + 3]`: the temperature as a fraction of the
 * maximum, its distance from the middle of the agent's optimal band, and the cold and heat stress ramps of its band.
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @param {Float32Array} out the inputs array
 * @param {number} offset the index of the first of the four inputs
 * @returns {void}
 */
export function temperatureInputs(world, slot, out, offset) {
    const { lanes } = world;
    const max = world.config.temperatureMax;
    const t = world.temperature[slot];
    const cs = lanes.temperatureColdStress[slot];
    const cm = lanes.temperatureColdModerate[slot];
    const hm = lanes.temperatureHeatModerate[slot];
    const hs = lanes.temperatureHeatStress[slot];
    const middle = (lanes.temperatureOptimalMin[slot] + lanes.temperatureOptimalMax[slot]) / 2;
    out[offset] = t / max;
    out[offset + 1] = Math.min(Math.abs(t - middle) / (max / 2), 1);
    if (t < cs) {
        out[offset + 2] = 1;
    } else {
        out[offset + 2] = t < cm ? (cm - t) / (cm - cs) : 0;
    }
    if (t > hs) {
        out[offset + 3] = 1;
    } else {
        out[offset + 3] = t > hm ? (t - hm) / (hs - hm) : 0;
    }
}
