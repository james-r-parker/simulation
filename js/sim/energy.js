// Moves energy between agents and the world ledger, keeps each agent's size in step with its energy, and charges per-tick costs.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { causeList, causeMap } from './events.js';
import { liveOf } from './effects.js';
import { specParams } from './spec-params.js';
import { baseSizeOf, visionRatioOf } from './traits.js';
import { stepTemperature } from './temperature.js';
import { TIMER_CAP } from './world.js';

/** Why an agent last lost energy, in code order; `NONE` means it has not lost any. */
export const LOSS_CAUSE_LIST = causeList([
    ['NONE', 'none', '#8a9bb0'],
    ['COST', 'cost', '#6cc6ff'],
    ['BITE', 'bite', '#ff5d73'],
    ['COLLISION', 'collision', '#ffb454'],
    ['TRAMPLE', 'trample', '#b48cff'],
    ['DISEASE', 'disease', '#5ee6a8'],
]);

/** Why an agent last lost energy, stored in `lastLoss`; `NONE` means it has not lost any. */
export const LOSS_CAUSE = causeMap(LOSS_CAUSE_LIST);

/** Where energy entered the world from outside, for `addEnergy`. Each one is booked in `ledger[0]`. */
export const ENERGY_SOURCE = Object.freeze({
    FOOD: 0,
    INITIAL: 1,
    FLOOR: 2,
    IMMIGRANT: 3,
});

/** @type {number[]} */
const SOURCES = Object.values(ENERGY_SOURCE);
/** @type {number[]} */
const LOSS_CAUSES = [LOSS_CAUSE.COST, LOSS_CAUSE.BITE, LOSS_CAUSE.COLLISION, LOSS_CAUSE.TRAMPLE, LOSS_CAUSE.DISEASE];

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
 * Adds energy from outside the world, capped at the agent's store (its `maxEnergy` lane); books only the stored amount in `ledger[0]`.
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
    const stored = Math.min(amount, world.lanes.maxEnergy[slot] - energy[slot]);
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
 * Moves energy from one agent to another. The giver loses up to `amount`; the receiver gains up to its own store (its `maxEnergy` lane)
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
    const gained = Math.min(moved, world.lanes.maxEnergy[receiver] - energy[receiver]);
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
 * @returns {number} the extra passive loss of a long-sighted body: `passiveLoss x visionCost x (vision - 1)` above 1,
 *   where `vision` is its ray length over its specialisation's base (`visionRatioOf`) and `visionCost` is its lane with
 *   its effects applied
 */
function visionLoss(world, slot) {
    const vision = visionRatioOf(world, slot);
    if (!(vision > 1)) {
        return 0;
    }
    return world.config.passiveLoss * liveOf(world, slot, 'visionCost') * (vision - 1);
}

/** The nominal standing, movement and sprint cost of the hunter `tickCost` last priced; a scratch for `applyCosts`. */
const nominal = new Float64Array(3);

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot the agent slot
 * @returns {number} the energy the agent loses this tick
 */
function tickCost(world, slot) {
    const c = world.config;
    const sp = specParams(c, world.spec[slot]);
    const vx = world.vx[slot];
    const vy = world.vy[slot];
    const speed = Math.sqrt(vx * vx + vy * vy);
    const drain = c.seasons[world.season[0]].energyDrain;
    // Every cost lane is read with its effects applied (the temperature ramps and a juvenile's burn). The `passiveLoss`
    // lane holds the spec's multiplier (and the `burn` trait); the size and vision terms take the spec's multiplier
    // alone, and the `movementCost` lane holds the spec's move multiplier, which the turn term takes on its own.
    const standing =
        liveOf(world, slot, 'passiveLoss') +
        (liveOf(world, slot, 'sizeEnergyLoss') * world.size[slot] + visionLoss(world, slot)) * sp.passiveLossMultiplier;
    const turn = liveOf(world, slot, 'turnCost') * Math.abs(world.turnRate[slot]) * sp.moveCostMultiplier;
    const base = (standing + liveOf(world, slot, 'movementCost') * (speed * speed) + turn) * drain;
    let cost = base;
    // fair-chase: the cost of the sprint delivered, times the sprint-store factor (1 with the store off).
    const sprint =
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] > 0
            ? liveOf(world, slot, 'sprintCost') * world.sprintFactor[slot]
            : 0;
    cost += sprint;
    const upkeep = c.specMutationRate > 0 && sp.canHunt ? c.huntUpkeep : 0;
    cost += upkeep;
    if (sp.canHunt) {
        // The hunter ledger (hunter-ledger.js): standing is the passive terms and the upkeep, movement the rest of the base.
        nominal[0] = standing * drain + upkeep;
        nominal[1] = base - standing * drain;
        nominal[2] = sprint;
    }
    return cost;
}

/**
 * Ages every alive agent, ticks its cooldown and timers, steps its temperature, and charges its per-tick energy cost
 * (loss cause `cost`); the cost lanes are read with the effects of the new temperature applied.
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
        const cost = tickCost(world, slot);
        const removed = removeEnergy(world, slot, cost, LOSS_CAUSE.COST);
        if (world.huntBySpec[world.spec[slot]] === 1 && cost > 0) {
            // The ledger books the energy removed, split in proportion to the nominal terms (a starving tick removes less).
            const share = removed / cost;
            world.ledgerStanding[slot] += nominal[0] * share;
            world.ledgerMove[slot] += nominal[1] * share;
            world.ledgerSprint[slot] += nominal[2] * share;
        }
    }
}
