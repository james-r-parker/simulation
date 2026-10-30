// Moves energy between agents and the world ledger, keeps each agent's size in step with its energy, and charges per-tick costs.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { specParams } from './spec-params.js';
import { baseSizeOf } from './traits.js';
import { passiveMultiplier, stepTemperature } from './temperature.js';
import { TIMER_CAP } from './world.js';

/** Why an agent last lost energy, stored in `lastLoss`; `NONE` means it has not lost any. */
export const LOSS_CAUSE = Object.freeze({
    NONE: 0,
    COST: 1,
    BITE: 2,
    COLLISION: 3,
});

/** Where energy entered the world from outside, for `addEnergy`. Each one is booked in `ledger[0]`. */
export const ENERGY_SOURCE = Object.freeze({
    FOOD: 0,
    INITIAL: 1,
    FLOOR: 2,
    IMMIGRANT: 3,
    KILL: 4,
});

/** @type {number[]} */
const SOURCES = Object.values(ENERGY_SOURCE);
/** @type {number[]} */
const LOSS_CAUSES = [LOSS_CAUSE.COST, LOSS_CAUSE.BITE, LOSS_CAUSE.COLLISION];

/**
 * Throws unless `amount` is a finite, non-negative number.
 * @param {string} fn the calling function's name, for the message
 * @param {number} slot the agent slot, for the message
 * @param {number} amount the value to check
 * @returns {void}
 */
function checkAmount(fn, slot, amount) {
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${fn}: slot ${slot} needs a finite, non-negative amount, got ${amount}`);
    }
}

/**
 * Recomputes `size` from `energy` for one agent.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {void}
 */
export function updateSize(world, slot) {
    const { config, energy, size } = world;
    size[slot] = Math.max(config.minSize, baseSizeOf(world, slot) + energy[slot] / config.energyToSize);
}

/**
 * Adds energy from outside the world, capped at the agent's store (`maxEnergy` x its specialisation's `maxEnergyMultiplier`); books only the stored amount in `ledger[0]`.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @param {number} amount the energy offered, non-negative
 * @param {number} source an `ENERGY_SOURCE` code
 * @returns {number} the energy actually stored
 */
export function addEnergy(world, slot, amount, source) {
    checkAmount('addEnergy', slot, amount);
    if (!SOURCES.includes(source)) {
        throw new Error(`addEnergy: slot ${slot} has unknown energy source ${source}`);
    }
    const { energy, ledger } = world;
    const stored = Math.min(amount, world.maxEnergyBySpec[world.spec[slot]] - energy[slot]);
    energy[slot] += stored;
    ledger[0] += stored;
    updateSize(world, slot);
    return stored;
}

/**
 * Removes up to `amount` energy, never below 0; books the removed amount in `ledger[1]`.
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @param {number} amount the energy to remove, non-negative
 * @param {number} cause a `LOSS_CAUSE` code other than `NONE`, recorded as `lastLoss` when energy was removed
 * @returns {number} the energy actually removed
 */
export function removeEnergy(world, slot, amount, cause) {
    checkAmount('removeEnergy', slot, amount);
    if (!LOSS_CAUSES.includes(cause)) {
        throw new Error(`removeEnergy: slot ${slot} has unknown loss cause ${cause}`);
    }
    const { energy, ledger, lastLoss } = world;
    const removed = Math.min(amount, energy[slot]);
    energy[slot] -= removed;
    ledger[1] += removed;
    if (removed > 0) {
        lastLoss[slot] = cause;
    }
    updateSize(world, slot);
    return removed;
}

/**
 * Moves energy from one agent to another. The giver loses up to `amount`; the receiver gains up to its own store (`maxEnergyBySpec`)
 * and the rest is booked in `ledger[1]`. Does not touch `lastLoss` or the ledger's inflow.
 * @param {import('./world.js').World} world the world
 * @param {number} giver the slot losing energy
 * @param {number} receiver the slot gaining energy; must differ from `giver`
 * @param {number} amount the energy to move, non-negative
 * @returns {number} the energy the giver lost
 */
export function transferEnergy(world, giver, receiver, amount) {
    checkAmount('transferEnergy', giver, amount);
    if (giver === receiver) {
        throw new Error(`transferEnergy: giver and receiver are both slot ${giver}`);
    }
    const { energy, ledger } = world;
    const moved = Math.min(amount, energy[giver]);
    const gained = Math.min(moved, world.maxEnergyBySpec[world.spec[receiver]] - energy[receiver]);
    energy[giver] -= moved;
    energy[receiver] += gained;
    ledger[1] += moved - gained;
    world.transferGained = gained;
    updateSize(world, giver);
    updateSize(world, receiver);
    return moved;
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {number} the extra passive loss of a long-sighted body: `passiveLoss x visionCost x (vision - 1)` above 1
 */
function visionLoss(world, slot) {
    if (!(world.vision[slot] > 1)) {
        return 0;
    }
    return world.config.passiveLoss * world.config.visionCost * (world.vision[slot] - 1);
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {number} the energy the agent loses this tick
 */
function tickCost(world, slot) {
    const c = world.config;
    const sp = specParams(c, world.spec[slot]);
    const m = sp.moveCostMultiplier;
    const vx = world.vx[slot];
    const vy = world.vy[slot];
    const speed = Math.sqrt(vx * vx + vy * vy);
    const drain = c.seasons[world.season[0]].energyDrain;
    const standing =
        (c.passiveLoss + c.sizeEnergyLoss * world.size[slot] + visionLoss(world, slot)) *
        sp.passiveLossMultiplier *
        passiveMultiplier(c, world.temperature[slot]);
    let cost =
        (standing + c.movementCost * (speed * speed) * m + c.turnCost * Math.abs(world.turnRate[slot]) * m) * drain;
    if (world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0) {
        cost += c.sprintCost;
    }
    if (c.specMutationRate > 0 && sp.canHunt) {
        cost += c.huntUpkeep;
    }
    return cost;
}

/**
 * Ages every alive agent, ticks its cooldown and timers, steps its temperature, and charges its per-tick energy cost
 * (loss cause `cost`); the passive and size terms are multiplied by `passiveMultiplier` of the new temperature.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function applyCosts(world) {
    const { alive, ageTicks, cooldown, ateTimer, bittenTimer } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 0) {
            continue;
        }
        ageTicks[slot] += 1;
        cooldown[slot] = Math.max(0, cooldown[slot] - 1);
        ateTimer[slot] = Math.min(TIMER_CAP, ateTimer[slot] + 1);
        bittenTimer[slot] = Math.min(TIMER_CAP, bittenTimer[slot] + 1);
        stepTemperature(world, slot);
        removeEnergy(world, slot, tickCost(world, slot), LOSS_CAUSE.COST);
    }
}
