// The feed phase: agents eat the food they overlap, then biters take energy from the agents they touch.

import { carryPollen } from './pollination.js';
import { ingestToxin, isSick } from './toxin.js';
import { canBite, couldBite, inJaws } from './bite-rule.js';
import { cellRange } from './spatial-hash.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy, removeEnergy, transferEnergy } from './energy.js';
import { depletePatchAt } from './food-patches.js';
import { INCOME, noteBiteLedger, noteIncome } from './hunter-ledger.js';
import { depositPheromone } from './pheromones.js';
import { FOOD_GONE, removeFood } from './world.js';
import { FOOD_KIND, FOOD_ORIGIN } from './carcass.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { specParams } from './spec-params.js';
import { gainTemperature } from './temperature.js';
import { REWARD_SOURCE, noteReward } from './reward.js';

const HERD_CARCASS_BITE = 400;

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the eating agent
 * @param {number} food the food slot
 * @returns {number} the share of the food's value the agent's specialisation takes (0 for none)
 */
function shareOf(world, slot, food) {
    const table = world.foodKind[food] === FOOD_KIND.MEAT ? world.meatFoodBySpec : world.plantFoodBySpec;
    return table[world.spec[slot]];
}

/**
 * Eats one food if the agent's circle overlaps it.
 * @param {Record<string, any>} world the world
 * @param {number} slot the eating agent
 * @param {number} food the food slot
 * @returns {void}
 */
function tryEat(world, slot, food) {
    if (world.foodAlive[food] !== 1 || shareOf(world, slot, food) === 0) {
        return;
    }
    if (!canEatNow(world, slot)) {
        return;
    }
    const dx = world.foodX[food] - world.x[slot];
    const dy = world.foodY[food] - world.y[slot];
    if (Math.sqrt(dx * dx + dy * dy) < world.size[slot] + world.foodRadius[food]) {
        consumeFood(world, slot, food);
    }
}

/** @param {Record<string, any>} world @param {number} slot @param {number} food */
function consumeFood(world, slot, food) {
    const share = shareOf(world, slot, food);
    const isMeat = world.foodKind[food] === FOOD_KIND.MEAT;
    const herdCarcass = world.foodOrigin[food] === FOOD_ORIGIN.HERD_CARCASS;
    const available = herdCarcass ? Math.min(HERD_CARCASS_BITE, world.foodValue[food]) : world.foodValue[food];
    const raw = share === 1 ? available : available * share;
    const value = isMeat ? raw : ingestToxin(world, slot, raw, world.foodTox[food]);
    const stored = addEnergy(world, slot, value, ENERGY_SOURCE.FOOD);
    world.foodEnergy[slot] += stored;
    if (isMeat) {
        world.ledgerCarcass[slot] += stored;
        noteIncome(world, slot, { kind: herdCarcass ? INCOME.HERD : INCOME.CARCASS, stored });
        noteReward(world, slot, REWARD_SOURCE.SCAVENGE, stored);
    }
    world.foodEatenBySpec[world.spec[slot]] += stored;
    const { temperatureGainEat, foodEnergy } = world.config;
    gainTemperature(world, slot, (temperatureGainEat * stored) / foodEnergy);
    world.ateTimer[slot] = 0;
    if (!isMeat) {
        carryPollen(world, slot, food);
        depletePatchAt(world, world.foodX[food], world.foodY[food]);
        world.floraIntake[world.season[0] * 6 + world.foodSpecies[food]] += stored;
        if (world.foodOrigin[food] === FOOD_ORIGIN.DUNG_ZONE) {
            world.dungFoodIntake += stored;
        }
        world.floraMeals[0]++;
        world.floraMeals[1] += Number(world.foodTox[food] > 0);
    }
    if (herdCarcass) {
        world.foodValue[food] -= stored / share;
        world.herdTotals[1] += stored;
        world.herdCarcassEatenBySpec[world.spec[slot]] += stored;
        if (world.foodValue[food] < 1) {
            removeFood(world, food, FOOD_GONE.EATEN, stored);
        }
    } else {
        removeFood(world, food, FOOD_GONE.EATEN, stored);
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
 * G1 (eat-choice): a non-hunter eats only while it holds `BITE` above 0, so eating is a choice the brain makes; a
 * hunter's carcass meals need no bite. The choice is per tick, not per item: a biting forager eats every edible item it
 * overlaps, and declines a toxic one only by releasing `BITE`.
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {boolean} whether the agent takes food this tick
 */
function choosesToEat(world, slot) {
    return world.huntBySpec[world.spec[slot]] === 1 || world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0;
}

/**
 * Makes one agent eat every alive food it overlaps, when it chooses to eat (`choosesToEat`).
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @param {number} slot the eating agent
 * @returns {void}
 */
function eatAround(world, hash, slot) {
    if (!choosesToEat(world, slot)) {
        return;
    }
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
    const fatal = wasAlive && world.energy[victim] <= 0;
    noteFatalBiteObservation(world, biter, victim, fatal);
    let gained = world.transferGained;
    if (fatal && config.predatorKillEnergy > 0) {
        gained += addEnergy(world, biter, config.predatorKillEnergy, ENERGY_SOURCE.KILL);
    }
    if (fatal && config.predatorRestTicks > 0 && specParams(config, world.spec[biter]).canHunt) {
        world.restTimer[biter] = config.predatorRestTicks;
    }
    gainTemperature(world, biter, (config.temperatureGainEat * world.transferGained) / config.foodEnergy);
    const paid = removeEnergy(world, biter, kick, LOSS_CAUSE.COST);
    noteReward(world, biter, fatal ? REWARD_SOURCE.KILL : REWARD_SOURCE.BITE, gained);
    world.lastLoss[victim] = LOSS_CAUSE.BITE;
    const biterId = world.genomeId[biter];
    if (world.lastBiter[victim] !== biterId) {
        world.prevBiter[victim] = world.lastBiter[victim];
        world.prevBiteTick[victim] = world.lastBiteTick[victim];
    }
    world.lastBiter[victim] = biterId;
    world.lastBiteTick[victim] = world.tick;
    noteBiteLedger(world, biter, { gained, fatal, kick: paid, victim });
    world.bittenTimer[victim] = 0;
    depositPheromone(world, world.attack, x[biter], y[biter]);
    depositPheromone(world, world.danger, x[victim], y[victim]);
}

/** @param {Record<string, any>} world sim world @param {number} biter biter @param {number} victim victim @param {boolean} fatal whether the bite killed */
function noteFatalBiteObservation(world, biter, victim, fatal) {
    if (!fatal) {
        return;
    }
    // `applyBite` is reached only through `canBite`, which requires a hunter and a prey-sized non-kin target.
    const at = biter * 8;
    world.fatalBiteObservations[at + 3] += 1;
    world.fatalBiteObservations[at + 7] += 1;
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
    const charged = removeEnergy(world, hunter, config.recoilEnergy, LOSS_CAUSE.COST);
    world.ledgerBiteCost[hunter] += charged;
    world.recoilEnergyLife[hunter] += charged;
}

/**
 * Resolves one direction of a contact: a bite when the rule allows it, else the recoil of a refused lunge. A
 * `canHunt` biter that `canEatNow` refuses does neither.
 * @param {Record<string, any>} world the world
 * @param {number} biter the slot that may bite
 * @param {number} other the slot it touches
 * @returns {void}
 */
function lunge(world, biter, other) {
    if (!canEatNow(world, biter) && specParams(world.config, world.spec[biter]).canHunt) {
        return; // realistic-keepers T1: a full or digesting hunter does not bite (no damage, recoil or pheromone)
    }
    if (bites(world, biter, other)) {
        applyBite(world, biter, other);
    } else if (world.config.recoilEnergy > 0) {
        recoil(world, biter, other);
    }
}

/**
 * eat-choice G4: stamps a hunter that has a body in its jaws this tick (tick + 1, so a fresh slot's 0 never matches;
 * derived state outside `worldHash`, cleared by `freeAgent`).
 * @param {Record<string, any>} world the world
 * @param {number} hunter the slot that may have a body in its jaws
 * @param {number} body the slot it touches
 * @returns {void}
 */
function noteJaws(world, hunter, body) {
    if (world.huntBySpec[world.spec[hunter]] === 1 && inJaws(world, hunter, body)) {
        world.jawsStamp[hunter] = world.tick + 1;
    }
}

/**
 * eat-choice G4: a hunter holding `BITE` above 0 with no body in its jaws (`noteJaws`) loses `strikeMissCost` this tick,
 * booked as a bite cost.
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function chargeStrikeMisses(world) {
    const { alive, outputs, jawsStamp, config } = world;
    const stamp = world.tick + 1;
    for (let slot = 0; slot < alive.length; slot++) {
        if (
            alive[slot] === 1 &&
            world.huntBySpec[world.spec[slot]] === 1 &&
            outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 &&
            jawsStamp[slot] !== stamp
        ) {
            world.ledgerBiteCost[slot] += removeEnergy(world, slot, config.strikeMissCost, LOSS_CAUSE.COST);
        }
    }
}

/**
 * Runs the feed phase: every alive agent eats, then bites resolve over the contact list in order, then a hunter that
 * struck at nothing pays `strikeMissCost` (skipped at 0).
 * @param {Record<string, any>} world the world
 * @param {import('./spatial-hash.js').SpatialHash} hash the hash built this tick
 * @returns {void}
 */
export function feed(world, hash) {
    const { alive, contacts, contactCount } = world;
    world.fatalBiteObservations.fill(0);
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            eatAround(world, hash, slot);
        }
    }
    const strikes = world.config.strikeMissCost > 0;
    for (let c = 0; c < contactCount; c++) {
        const a = contacts[2 * c];
        const b = contacts[2 * c + 1];
        if (strikes) {
            noteJaws(world, a, b);
            noteJaws(world, b, a);
        }
        lunge(world, a, b);
        lunge(world, b, a);
    }
    if (strikes) {
        chargeStrikeMisses(world);
    }
}
