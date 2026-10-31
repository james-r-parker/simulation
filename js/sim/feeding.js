// The feed phase: agents eat the food they overlap, then biters take energy from the agents they touch.

import { ingestToxin, isSick } from './toxin.js';
import { canBite, couldBite } from './bite-rule.js';
import { cellRange } from './spatial-hash.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy, removeEnergy, transferEnergy } from './energy.js';
import { depletePatchAt } from './food-patches.js';
import { depositPheromone } from './pheromones.js';
import { removeFood } from './world.js';
import { FOOD_KIND } from './carcass.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { specParams } from './spec-params.js';
import { gainTemperature } from './temperature.js';

/**
 * Eats one food if the agent's circle overlaps it.
 * @param {Record<string, any>} world the world
 * @param {number} slot the eating agent
 * @param {number} food the food slot
 * @returns {void}
 */
function tryEat(world, slot, food) {
    const isMeat = world.foodKind[food] === FOOD_KIND.MEAT;
    const table = isMeat ? world.meatFoodBySpec : world.plantFoodBySpec;
    const share = table[world.spec[slot]];
    if (world.foodAlive[food] !== 1 || share === 0 || !canEatNow(world, slot)) {
        return;
    }
    const dx = world.foodX[food] - world.x[slot];
    const dy = world.foodY[food] - world.y[slot];
    if (Math.sqrt(dx * dx + dy * dy) < world.size[slot] + world.foodRadius[food]) {
        const raw = share === 1 ? world.foodValue[food] : world.foodValue[food] * share;
        const value = isMeat ? raw : ingestToxin(world, slot, raw, world.foodTox[food]);
        const stored = addEnergy(world, slot, value, ENERGY_SOURCE.FOOD);
        world.foodEnergy[slot] += stored;
        const { temperatureGainEat, foodEnergy } = world.config;
        gainTemperature(world, slot, (temperatureGainEat * stored) / foodEnergy);
        world.ateTimer[slot] = 0;
        if (!isMeat) {
            depletePatchAt(world, world.foodX[food], world.foodY[food]);
            world.floraIntake[world.season[0] * 6 + world.foodSpecies[food]] += stored;
        }
        removeFood(world, food);
    }
}

/**
 * Satiation (T49): a full agent, or one still digesting its last meal, cannot eat. Both rules are off at 0.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {boolean} whether the agent may eat this tick
 */
export function canEatNow(world, slot) {
    if (isSick(world, slot)) {
        return false;
    }
    const { satiationShare, digestTicks } = world.config;
    if (satiationShare > 0 && world.energy[slot] >= satiationShare * world.maxEnergyBySpec[world.spec[slot]]) {
        return false;
    }
    return digestTicks === 0 || world.ateTimer[slot] >= digestTicks;
}

/**
 * Eats every alive food entry in one hash cell.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} slot the eating agent
 * @param {number} cell the cell index
 * @returns {void}
 */
function eatInCell(world, hash, slot, cell) {
    const { cellStart, entries, maxAgents } = hash;
    for (let e = cellStart[cell]; e < cellStart[cell + 1]; e++) {
        if (entries[e] >= maxAgents) {
            tryEat(world, slot, entries[e] - maxAgents);
        }
    }
}

/**
 * Makes one agent eat every alive food it overlaps.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} slot the eating agent
 * @returns {void}
 */
function eatAround(world, hash, slot) {
    const range = cellRange(hash, world.x[slot], world.y[slot], world.size[slot]);
    const col0 = range[0];
    const row0 = range[1];
    const col1 = range[2];
    const row1 = range[3];
    for (let row = row0; row <= row1; row++) {
        for (let col = col0; col <= col1; col++) {
            eatInCell(world, hash, slot, row * hash.cols + col);
        }
    }
}

/**
 * Whether `biter` bites `victim`: the brain wants to bite and the bite rule (`canBite`) allows it.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {boolean}
 */
function bites(world, biter, victim) {
    return world.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 && canBite(world, biter, victim);
}

/**
 * The kick a landed bite costs the biter: `biteCost` x (victim size / biter size) x (0.5 + victim energy /
 * its own store) x the victim's `kickMultiplier`. A big, fed or defender victim kicks hardest, a small, starving one
 * barely at all. Read before the bite moves energy.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {number} the energy the biter loses
 */
function kickOf(world, biter, victim) {
    const { config } = world;
    const sizeRatio = world.size[victim] / world.size[biter];
    const fullness = 0.5 + world.energy[victim] / world.maxEnergyBySpec[world.spec[victim]];
    return config.biteCost * sizeRatio * fullness * specParams(config, world.spec[victim]).kickMultiplier;
}

/**
 * Resolves one bite: moves energy, records the loss, charges the biter's kick and deposits pheromones.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {void}
 */
function applyBite(world, biter, victim) {
    const { config, x, y } = world;
    const taken = specParams(config, world.spec[victim]).biteTakenMultiplier;
    const bite = config.biteEnergy * world.biteBySpec[world.spec[biter]];
    const wasAlive = world.energy[victim] > 0;
    const kick = kickOf(world, biter, victim);
    transferEnergy(world, victim, biter, bite * taken);
    world.biteEnergy[biter] += world.transferGained;
    if (wasAlive && world.energy[victim] <= 0 && config.predatorKillEnergy > 0) {
        addEnergy(world, biter, config.predatorKillEnergy, ENERGY_SOURCE.KILL);
    }
    gainTemperature(world, biter, (config.temperatureGainEat * world.transferGained) / config.foodEnergy);
    removeEnergy(world, biter, kick, LOSS_CAUSE.COST);
    world.lastLoss[victim] = LOSS_CAUSE.BITE;
    const biterId = world.genomeId[biter];
    if (world.lastBiter[victim] !== biterId) {
        world.prevBiter[victim] = world.lastBiter[victim];
        world.prevBiteTick[victim] = world.lastBiteTick[victim];
    }
    world.lastBiter[victim] = biterId;
    world.lastBiteTick[victim] = world.tick;
    world.bittenTimer[victim] = 0;
    depositPheromone(world, world.attack, x[biter], y[biter]);
    depositPheromone(world, world.danger, x[victim], y[victim]);
}

/**
 * Charges `recoilEnergy` to a hunter that tries to bite something the bite rule refuses (kin, or too large), once per
 * tick however many it touches. The stamp (tick + 1, so a fresh slot's 0 never matches) is derived state outside
 * `worldHash`, cleared by `freeAgent`. A refusal for the jaws alone is not a recoil: `couldBite` still holds.
 * @param {Record<string, any>} world the world
 * @param {number} hunter the slot that wants to bite
 * @param {number} target the slot it touches
 * @returns {void}
 */
function recoil(world, hunter, target) {
    const { config, recoilStamp } = world;
    const wants = world.outputs[hunter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
    if (!wants || recoilStamp[hunter] === world.tick + 1 || !specParams(config, world.spec[hunter]).canHunt) {
        return;
    }
    if (couldBite(world, hunter, target)) {
        return;
    }
    recoilStamp[hunter] = world.tick + 1;
    removeEnergy(world, hunter, config.recoilEnergy, LOSS_CAUSE.COST);
}

/**
 * Resolves one direction of a contact: a bite when the rule allows it, else the recoil of a refused lunge.
 * @param {Record<string, any>} world the world
 * @param {number} biter the slot that may bite
 * @param {number} other the slot it touches
 * @returns {void}
 */
function lunge(world, biter, other) {
    if (bites(world, biter, other)) {
        applyBite(world, biter, other);
    } else if (world.config.recoilEnergy > 0) {
        recoil(world, biter, other);
    }
}

/**
 * Runs the feed phase: every alive agent eats, then bites resolve over the contact list in order.
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function feed(world, hash) {
    const { alive, contacts, contactCount } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            eatAround(world, hash, slot);
        }
    }
    for (let c = 0; c < contactCount; c++) {
        const a = contacts[2 * c];
        const b = contacts[2 * c + 1];
        lunge(world, a, b);
        lunge(world, b, a);
    }
}
