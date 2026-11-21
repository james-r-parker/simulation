// Applies toxin doses, sickness costs and recovery to agents.
import { EVENT_TYPE, pushEvent, EVENT } from './events.js';
import { LOSS_CAUSE, removeEnergy } from './energy.js';
import { drainEffect } from './effect-appliers.js';
import { EFFECT, levelOf } from './effects.js';

/**
 * Adds a dose and returns the nonnegative energy offered by a plant meal; a negative net meal is booked as a cost.
 * @param {import('./world.js').World} world the world
 * @param {number} slot eating agent
 * @param {number} value plant energy after the specialisation share
 * @param {number} toxicity item toxicity in [0, 1]
 * @returns {number} nonnegative meal energy, for the caller to store through addEnergy
 */
export function ingestToxin(world, slot, value, toxicity) {
    const before = levelOf(world, slot, EFFECT.SICK) > 0;
    world.dose[slot] += toxicity * world.config.toxinDose;
    if (!before && levelOf(world, slot, EFFECT.SICK) > 0) {
        const at = pushEvent(world.events, EVENT_TYPE.AGENT_SICKENED, world.tick);
        world.events.data[at + EVENT.AGENT_SICKENED.SLOT] = slot;
        world.events.data[at + EVENT.AGENT_SICKENED.GENOME_ID] = world.genomeId[slot];
        world.events.data[at + EVENT.AGENT_SICKENED.DOSE] = world.dose[slot];
    }
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
        drainEffect(world, slot, EFFECT.SICK);
        dose[slot] = Math.max(0, dose[slot] - config.doseDecay);
    }
}
