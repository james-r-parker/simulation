// How full each computed effect is (docs/designs/status-effects.md, "Every modifier of today"): the level of a `share` or
// `step` effect, read from the body where the effect is read. Each function is one rule of the sim as it stood before the
// registry, now stated once. Pure reads of the world: no writes, no RNG, no allocation.

import { isJuvenile } from './juvenile.js';

/** @typedef {any} World */

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `fat`: the energy over the store, in [0, 1]
 */
export function fatLevel(world, slot) {
    return world.energy[slot] / world.lanes.maxEnergy[slot];
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `coldBand`: 2 under the `temperatureColdStress` lane, 1 under `temperatureColdModerate`, else 0
 */
export function coldBandLevel(world, slot) {
    const t = world.temperature[slot];
    const { lanes } = world;
    if (t < lanes.temperatureColdStress[slot]) {
        return 2;
    }
    return t < lanes.temperatureColdModerate[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `heatBand`: 0 up to the `temperatureOptimalMax` lane, 1 above it, 2 at `temperatureHeatStress`
 */
export function heatBandLevel(world, slot) {
    const t = world.temperature[slot];
    const { lanes } = world;
    if (t <= lanes.temperatureOptimalMax[slot]) {
        return 0;
    }
    return t < lanes.temperatureHeatStress[slot] ? 1 : 2;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `coldRamp`: `(min - t) / min` under the `temperatureOptimalMin` lane, else 0
 */
export function coldRampLevel(world, slot) {
    const t = world.temperature[slot];
    const min = world.lanes.temperatureOptimalMin[slot];
    return t < min ? (min - t) / min : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `hotRamp`: `(t - max) / (temperatureMax - max)` over the `temperatureOptimalMax` lane, else 0
 */
export function hotRampLevel(world, slot) {
    const t = world.temperature[slot];
    const max = world.lanes.temperatureOptimalMax[slot];
    return t > max ? (t - max) / (world.config.temperatureMax - max) : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `outOfBand`: 1 under the `temperatureColdStress` lane or over `temperatureHeatStress`, else 0
 */
export function outOfBandLevel(world, slot) {
    const t = world.temperature[slot];
    return t < world.lanes.temperatureColdStress[slot] || t > world.lanes.temperatureHeatStress[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `juvenile`: 1 for a hunter under `juvenileTicks`, else 0
 */
export function juvenileLevel(world, slot) {
    return isJuvenile(world, slot) ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `spent`: how far the sprint store is under `sprintFloor`, `1 - level / floor` (0 at or above the
 *   floor, and 0 with the store off)
 */
export function spentLevel(world, slot) {
    const store = world.sprintStore;
    if (store === undefined) {
        return 0;
    }
    const level = store.level[slot];
    return level >= store.floor ? 0 : 1 - level / store.floor;
}
