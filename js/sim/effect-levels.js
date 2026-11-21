// How full each computed effect is (docs/designs/status-effects.md, "Every modifier of today"): the level of a `share` or
// `step` effect, read from the body where the effect is read. Each function is one rule of the sim as it stood before the
// registry, now stated once. Pure reads of the world: no writes, no RNG, no allocation.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
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
 * @returns {number} `grazing`: 1 for a non-hunter holding `BITE` above 0 this tick, else 0
 */
export function grazingLevel(world, slot) {
    return world.huntBySpec[world.spec[slot]] !== 1 && world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0
        ? 1
        : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `handling`: 1 while `ateTimer` is under the `handlingTicks` lane, else 0
 */
export function handlingLevel(world, slot) {
    return world.ateTimer[slot] < world.lanes.handlingTicks[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `digesting`: 1 while `ateTimer` is under the `digestTicks` lane, else 0
 */
export function digestingLevel(world, slot) {
    return world.ateTimer[slot] < world.lanes.digestTicks[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `sated`: 1 once energy is at or above the `satiationShare` lane of the store, 0 at a share of 0
 */
export function satedLevel(world, slot) {
    const share = world.lanes.satiationShare[slot];
    return share > 0 && world.energy[slot] >= share * world.lanes.maxEnergy[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `resting`: 1 while the rest timer a kill started is above 0 (it exists with `predatorRestTicks`)
 */
export function restingLevel(world, slot) {
    return world.restTimer !== undefined && world.restTimer[slot] > 0 ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `sick`: 1 once the toxin dose is at or above the `sickDose` lane, else 0
 */
export function sickLevel(world, slot) {
    return world.dose[slot] >= world.lanes.sickDose[slot] ? 1 : 0;
}

/**
 * @param {World} world the world
 * @param {number} slot the agent slot
 * @returns {number} `diseased`: 1 while the slot carries a strain, else 0
 */
export function diseasedLevel(world, slot) {
    return world.infection[slot] === 0 ? 0 : 1;
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
