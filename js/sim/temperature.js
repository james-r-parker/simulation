// The body-temperature rules as functions of the world and one temperature value; allocates nothing.

import { coldFactor } from './terrain.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {Readonly<Record<string, any>>} Config */

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
 * (capped at 1), the passive loss cools it, scaled by the season; then clamps to 0 to `temperatureMax`.
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function stepTemperature(world, slot) {
    const c = world.config;
    const vx = world.vx[slot];
    const vy = world.vy[slot];
    const speed = Math.sqrt(vx * vx + vy * vy);
    const modifier = c.seasons[world.season[0]].temperatureModifier;
    const loss = Math.max(0, 1 - modifier * c.temperatureSeasonSlope);
    const next =
        world.temperature[slot] +
        Math.min(speed / c.maxVelocity, 1) * c.temperatureGainMove -
        c.temperatureLossPassive * loss * coldFactor(c, world.y[slot]);
    world.temperature[slot] = Math.min(c.temperatureMax, Math.max(0, next));
}

/**
 * The factor on the passive and size energy terms: 1 inside the optimal band, rising linearly to
 * `temperaturePassiveLossFactor` at 0 and at `temperatureMax`.
 * @param {Config} config the config
 * @param {number} t the temperature
 * @returns {number} the multiplier, at least 1
 */
export function passiveMultiplier(config, t) {
    const extra = config.temperaturePassiveLossFactor - 1;
    if (t < config.temperatureOptimalMin) {
        return 1 + ((config.temperatureOptimalMin - t) / config.temperatureOptimalMin) * extra;
    }
    if (t > config.temperatureOptimalMax) {
        return (
            1 + ((t - config.temperatureOptimalMax) / (config.temperatureMax - config.temperatureOptimalMax)) * extra
        );
    }
    return 1;
}

/**
 * The factor on thrust (sprint included) at temperature `t`.
 * @param {Config} config the config
 * @param {number} t the temperature
 * @returns {number} the efficiency, in (0, 1]
 */
export function thrustEfficiency(config, t) {
    if (t < config.temperatureColdStress) {
        return config.temperatureEfficiencyColdSevere;
    }
    if (t < config.temperatureColdModerate) {
        return config.temperatureEfficiencyColdModerate;
    }
    if (t <= config.temperatureOptimalMax) {
        return 1;
    }
    return t < config.temperatureHeatStress
        ? config.temperatureEfficiencyHeatModerate
        : config.temperatureEfficiencyHeatSevere;
}

/**
 * @param {Config} config the config
 * @param {number} t the temperature
 * @returns {boolean} true when `t` is past either stress threshold, so the agent cannot start a mating
 */
export function blocksMating(config, t) {
    return t < config.temperatureColdStress || t > config.temperatureHeatStress;
}

/**
 * Writes the four temperature inputs at `out[offset]` to `out[offset + 3]`: the temperature as a fraction of the
 * maximum, its distance from the middle of the optimal band, and the cold and heat stress ramps.
 * @param {Config} config the config
 * @param {number} t the temperature
 * @param {Float32Array} out the inputs array
 * @param {number} offset the index of the first of the four inputs
 * @returns {void}
 */
export function temperatureInputs(config, t, out, offset) {
    const { temperatureMax: max, temperatureColdStress: cs, temperatureColdModerate: cm } = config;
    const { temperatureHeatModerate: hm, temperatureHeatStress: hs } = config;
    const middle = (config.temperatureOptimalMin + config.temperatureOptimalMax) / 2;
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
