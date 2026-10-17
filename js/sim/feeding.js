// The feed phase: agents eat the food they overlap, then biters take energy from the agents they touch.

import { detCos, detSin } from './det-math.js';
import { cellRange } from './spatial-hash.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy, transferEnergy } from './energy.js';
import { isKin } from './kin.js';
import { depositPheromone } from './pheromones.js';
import { removeFood } from './world.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { specParams } from './spec-params.js';
import { gainTemperature } from './temperature.js';

const PI = 3.141592653589793;

/**
 * Eats one food if the agent's circle overlaps it.
 * @param {Record<string, any>} world the world
 * @param {number} slot the eating agent
 * @param {number} food the food slot
 * @returns {void}
 */
function tryEat(world, slot, food) {
    if (world.foodAlive[food] !== 1) {
        return;
    }
    const dx = world.foodX[food] - world.x[slot];
    const dy = world.foodY[food] - world.y[slot];
    if (Math.sqrt(dx * dx + dy * dy) < world.size[slot] + world.foodRadius[food]) {
        const stored = addEnergy(world, slot, world.foodValue[food], ENERGY_SOURCE.FOOD);
        world.foodEnergy[slot] += stored;
        const { temperatureGainEat, foodEnergy } = world.config;
        gainTemperature(world, slot, (temperatureGainEat * stored) / foodEnergy);
        world.ateTimer[slot] = 0;
        removeFood(world, food);
    }
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
 * Whether the victim's centre lies within `biteArc` of the biter's heading. A `biteArc` of PI is any direction.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {boolean}
 */
function inJaws(world, biter, victim) {
    if (world.config.biteArc >= PI) {
        return true;
    }
    const dx = world.x[victim] - world.x[biter];
    const dy = world.y[victim] - world.y[biter];
    const heading = world.angle[biter];
    return dx * detCos(heading) + dy * detSin(heading) >= world.biteCos[0] * Math.sqrt(dx * dx + dy * dy);
}

/**
 * Whether `biter` bites `victim`: it can hunt, wants to bite, is not kin, is big enough and faces the victim.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {boolean}
 */
function bites(world, biter, victim) {
    const { config, outputs, size, spec } = world;
    return (
        specParams(config, spec[biter]).canHunt &&
        outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 &&
        !isKin(world, biter, victim) &&
        size[biter] > config.huntSizeRatio * size[victim] &&
        inJaws(world, biter, victim)
    );
}

/**
 * Resolves one bite: moves energy, records the loss and deposits pheromones.
 * @param {Record<string, any>} world the world
 * @param {number} biter the biting slot
 * @param {number} victim the bitten slot
 * @returns {void}
 */
function applyBite(world, biter, victim) {
    const { config, x, y } = world;
    const taken = specParams(config, world.spec[victim]).biteTakenMultiplier;
    const bite = config.biteEnergy * world.biteBySpec[world.spec[biter]];
    transferEnergy(world, victim, biter, bite * taken);
    world.biteEnergy[biter] += world.transferGained;
    gainTemperature(world, biter, (config.temperatureGainEat * world.transferGained) / config.foodEnergy);
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
        if (bites(world, a, b)) {
            applyBite(world, a, b);
        }
        if (bites(world, b, a)) {
            applyBite(world, b, a);
        }
    }
}
