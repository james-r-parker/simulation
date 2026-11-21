// The body-temperature rules as functions of the world and one temperature value; allocates nothing.

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
 * (capped at 1) times its `temperatureGainMove` lane, its `temperatureLossPassive` lane cools it, scaled by the season;
 * then clamps to 0 to `temperatureMax`.
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
    const next =
        world.temperature[slot] +
        Math.min(speed / c.maxVelocity, 1) * lanes.temperatureGainMove[slot] -
        lanes.temperatureLossPassive[slot] * loss * coldFactor(c, world.y[slot]);
    world.temperature[slot] = Math.min(c.temperatureMax, Math.max(0, next));
}

/**
 * The factor on the passive and size energy terms: 1 inside the agent's optimal band, rising linearly to
 * `temperaturePassiveLossFactor` at 0 and at `temperatureMax`. The band is the agent's threshold lanes.
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} the multiplier at the agent's temperature, at least 1
 */
export function passiveMultiplier(world, slot) {
    const { config, lanes } = world;
    const t = world.temperature[slot];
    const min = lanes.temperatureOptimalMin[slot];
    const max = lanes.temperatureOptimalMax[slot];
    const extra = config.temperaturePassiveLossFactor - 1;
    if (t < min) {
        return 1 + ((min - t) / min) * extra;
    }
    if (t > max) {
        return 1 + ((t - max) / (config.temperatureMax - max)) * extra;
    }
    return 1;
}

/**
 * The factor on thrust (sprint included) at the agent's temperature, against its threshold lanes.
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} the efficiency, in (0, 1]
 */
export function thrustEfficiency(world, slot) {
    const { config, lanes } = world;
    const t = world.temperature[slot];
    if (t < lanes.temperatureColdStress[slot]) {
        return config.temperatureEfficiencyColdSevere;
    }
    if (t < lanes.temperatureColdModerate[slot]) {
        return config.temperatureEfficiencyColdModerate;
    }
    if (t <= lanes.temperatureOptimalMax[slot]) {
        return 1;
    }
    return t < lanes.temperatureHeatStress[slot]
        ? config.temperatureEfficiencyHeatModerate
        : config.temperatureEfficiencyHeatSevere;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {boolean} true when its temperature is under its `temperatureColdStress` lane or over its
 *   `temperatureHeatStress` lane, so the agent cannot start a mating
 */
export function blocksMating(world, slot) {
    const t = world.temperature[slot];
    return t < world.lanes.temperatureColdStress[slot] || t > world.lanes.temperatureHeatStress[slot];
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
