// Applies toxin doses, sickness costs and recovery to agents.
import { LOSS_CAUSE, removeEnergy } from './energy.js';

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot agent slot
 * @returns {boolean} whether the agent is sick
 */
export function isSick(world, slot) {
    return world.dose[slot] >= world.config.sickDose;
}

/**
 * Adds a dose and returns the nonnegative energy offered by a plant meal; a negative net meal is booked as a cost.
 * @param {import('./world.js').World} world the world
 * @param {number} slot eating agent
 * @param {number} value plant energy after the specialisation share
 * @param {number} toxicity item toxicity in [0, 1]
 * @returns {number} nonnegative meal energy, for the caller to store through addEnergy
 */
export function ingestToxin(world, slot, value, toxicity) {
    world.dose[slot] += toxicity * world.config.toxinDose;
    const net = value * (1 - toxicity * world.config.toxinCost);
    if (net < 0) {
        removeEnergy(world, slot, -net, LOSS_CAUSE.COST);
        return 0;
    }
    return net;
}

/**
 * Drains sick agents and decays existing doses before this tick's meals, so a newly lethal meal reaches reap intact.
 * @param {import('./world.js').World} world the world
 * @returns {void}
 */
export function stepToxin(world) {
    const { alive, dose, config } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || dose[slot] === 0) {
            continue;
        }
        if (isSick(world, slot)) {
            removeEnergy(world, slot, config.sickDrain * dose[slot], LOSS_CAUSE.COST);
        }
        dose[slot] = Math.max(0, dose[slot] - config.doseDecay);
    }
}
