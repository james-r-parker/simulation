// Deaths, the population floor and immigration.

import { addFertileZone } from './environment.js';
import { LOSS_CAUSE } from './energy.js';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { spawnAgent } from './spawn.js';
import { freeAgent } from './world.js';

/** @typedef {import('./world.js').World} World */
/** @typedef {import('./spawn.js').Policy & {onDeath?: (world: World, slot: number, cause: number) => void}} Policy */

/**
 * @param {World} world the world
 * @param {number} slot an alive agent
 * @returns {number} a `DEATH_CAUSE`, or -1 when the agent survives; a bite this tick counts as eaten even when the
 *   tick's costs took the last of the energy and overwrote `lastLoss`
 */
function deathCause(world, slot) {
    if (world.ageTicks[slot] >= world.config.maxAgeTicks) {
        return DEATH_CAUSE.OLD_AGE;
    }
    if (world.energy[slot] > 0) {
        return -1;
    }
    const loss = world.lastLoss[slot];
    const bittenThisTick = world.lastBiter[slot] !== 0 && world.lastBiteTick[slot] === world.tick;
    if (loss === LOSS_CAUSE.BITE || bittenThisTick) {
        return DEATH_CAUSE.EATEN;
    }
    return loss === LOSS_CAUSE.COLLISION ? DEATH_CAUSE.COLLISION : DEATH_CAUSE.STARVED;
}

/**
 * @param {World} world the world
 * @param {number} slot a slot that was eaten
 * @returns {number} the genome id of the biter before the last one when it bit within `packWindow` ticks, else 0
 */
function packPartner(world, slot) {
    const recent = world.tick - world.prevBiteTick[slot] <= world.config.packWindow;
    return recent ? world.prevBiter[slot] : 0;
}

/**
 * Pushes `AgentDied` for a slot.
 * @param {World} world the world
 * @param {number} slot the dying agent
 * @param {number} cause a `DEATH_CAUSE`
 * @returns {void}
 */
function pushDied(world, slot, cause) {
    const o = pushEvent(world.events, EVENT_TYPE.AGENT_DIED, world.tick);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = world.genomeId[slot];
    d[o + 4] = cause;
    d[o + 5] = cause === DEATH_CAUSE.EATEN ? world.lastBiter[slot] : 0;
    d[o + 6] = world.spec[slot];
    d[o + 7] = world.lineageId[slot];
    d[o + 8] = world.ageTicks[slot];
    d[o + 9] = world.foodEnergy[slot];
    d[o + 10] = world.biteEnergy[slot];
    d[o + 11] = cause === DEATH_CAUSE.EATEN ? packPartner(world, slot) : 0;
}

/**
 * Kills every agent that is too old or out of energy: event, hook, remaining energy to the ledger, fertile zone, free.
 * @param {World} world the world
 * @param {Policy} policy the policy
 * @returns {void}
 */
export function reap(world, policy) {
    const { alive } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        const cause = alive[slot] === 1 ? deathCause(world, slot) : -1;
        if (cause < 0) {
            continue;
        }
        pushDied(world, slot, cause);
        if (policy.onDeath) {
            policy.onDeath(world, slot, cause);
        }
        world.ledger[1] += world.energy[slot];
        addFertileZone(world, world.x[slot], world.y[slot], world.size[slot]);
        freeAgent(world, slot);
    }
}

/**
 * Tops the population up to `minAgents` with new lineages, then adds one immigrant on every `immigrationInterval`.
 * @param {World} world the world
 * @param {Policy} policy the policy
 * @returns {void}
 */
export function fillFloor(world, policy) {
    const { minAgents, maxAgents, immigrationInterval } = world.config;
    let added = 0;
    while (world.population < minAgents) {
        spawnAgent(world, policy, BORN_CAUSE.FLOOR);
        added += 1;
    }
    if (added > 0) {
        const o = pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, world.tick);
        world.events.data[o + 2] = added;
    }
    const due = immigrationInterval > 0 && world.tick > 0 && world.tick % immigrationInterval === 0;
    if (due && world.population < maxAgents) {
        spawnAgent(world, policy, BORN_CAUSE.IMMIGRANT);
    }
}
