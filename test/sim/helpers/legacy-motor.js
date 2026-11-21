// The thrust, turn and per-tick cost rules as they were written before the effect registry (status-effects Phase 1),
// copied from `origin/main` at 4e56979d: a sequence of multiplications in the order the rules sat in `thrustOf` and
// `tickCost`. They read the world and change nothing, so a test can set them beside the effect path on the same body.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { specParams } from '../../../js/sim/spec-params.js';
import { visionRatioOf } from '../../../js/sim/traits.js';

/**
 * @param {any} world the world
 * @param {number} i the agent slot
 * @returns {number} the old `fatFactor`: `1 - fatSlowShare x energy / maxEnergy`, 1 when the lane is 0
 */
export function oldFat(world, i) {
    const { lanes } = world;
    const share = lanes.fatSlowShare[i];
    return share === 0 ? 1 : 1 - (share * world.energy[i]) / lanes.maxEnergy[i];
}

/**
 * @param {any} world the world
 * @param {number} i the agent slot
 * @returns {number} the old `thrustEfficiency`
 */
function oldEfficiency(world, i) {
    const { config, lanes } = world;
    const t = world.temperature[i];
    if (t < lanes.temperatureColdStress[i]) {
        return config.temperatureEfficiencyColdSevere;
    }
    if (t < lanes.temperatureColdModerate[i]) {
        return config.temperatureEfficiencyColdModerate;
    }
    if (t <= lanes.temperatureOptimalMax[i]) {
        return 1;
    }
    return t < lanes.temperatureHeatStress[i]
        ? config.temperatureEfficiencyHeatModerate
        : config.temperatureEfficiencyHeatSevere;
}

/**
 * @param {any} world the world
 * @param {number} i the agent slot
 * @returns {number} the old `passiveMultiplier`
 */
function oldRamp(world, i) {
    const { config, lanes } = world;
    const t = world.temperature[i];
    const min = lanes.temperatureOptimalMin[i];
    const max = lanes.temperatureOptimalMax[i];
    const extra = config.temperaturePassiveLossFactor - 1;
    if (t < min) {
        return 1 + ((min - t) / min) * extra;
    }
    return t > max ? 1 + ((t - max) / (config.temperatureMax - max)) * extra : 1;
}

/**
 * @param {any} world the world
 * @param {number} i the agent slot
 * @returns {number} the old thrust: the output times the lane, the temperature, graze, sprint, rest, handling and sickness
 *   factors, then fat, in that order (a rest timer is read, not counted down)
 */
export function oldThrust(world, i) {
    const { outputs, config } = world;
    const o = i * OUTPUT_COUNT;
    let thrust = outputs[o + OUTPUT_INDEX.THRUST] * world.lanes.maxThrust[i] * oldEfficiency(world, i);
    if (config.grazeThrust !== 1 && world.huntBySpec[world.spec[i]] !== 1 && outputs[o + OUTPUT_INDEX.BITE] > 0) {
        thrust *= config.grazeThrust;
    }
    if (outputs[o + OUTPUT_INDEX.SPRINT] > 0) {
        thrust *= 1 + config.sprintMultiplier * world.sprintBySpec[world.spec[i]] * world.sprintFactor[i];
    }
    if (config.predatorRestTicks > 0 && world.restTimer[i] > 0) {
        thrust = 0;
    }
    if (world.ateTimer[i] < config.handlingTicks) {
        thrust *= config.handlingThrust;
    }
    if (world.dose[i] >= config.sickDose) {
        thrust *= config.sickThrust;
    }
    return thrust * oldFat(world, i);
}

/**
 * @param {any} world the world
 * @param {number} i the agent slot
 * @returns {number} the old turn: the output times the `maxTurn` lane times fat
 */
export function oldTurn(world, i) {
    return world.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.TURN] * world.lanes.maxTurn[i] * oldFat(world, i);
}

/**
 * @param {any} world the world
 * @param {number} slot the agent slot
 * @returns {number} the old `tickCost`: the standing cost times the temperature ramp, with movement and turn, times the
 *   season's drain and a juvenile's burn, plus the sprint and the upkeep
 */
export function oldCost(world, slot) {
    const c = world.config;
    const sp = specParams(c, world.spec[slot]);
    const m = sp.moveCostMultiplier;
    const speed = Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
    const drain = c.seasons[world.season[0]].energyDrain;
    const vision = visionRatioOf(world, slot);
    const visionLoss = vision > 1 ? c.passiveLoss * c.visionCost * (vision - 1) : 0;
    const standing =
        (world.lanes.passiveLoss[slot] +
            (c.sizeEnergyLoss * world.size[slot] + visionLoss) * sp.passiveLossMultiplier) *
        oldRamp(world, slot);
    const burn =
        world.huntBySpec[world.spec[slot]] === 1 && world.ageTicks[slot] < c.juvenileTicks ? c.juvenileBurn : 1;
    const base =
        (standing + c.movementCost * (speed * speed) * m + c.turnCost * Math.abs(world.turnRate[slot]) * m) *
        drain *
        burn;
    const sprint =
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0
            ? world.lanes.sprintCost[slot] * burn * world.sprintFactor[slot]
            : 0;
    const upkeep = c.specMutationRate > 0 && sp.canHunt ? c.huntUpkeep : 0;
    return base + sprint + upkeep;
}
