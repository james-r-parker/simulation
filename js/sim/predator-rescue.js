// The predator rescue: while too few predators are alive, one immigrant arrives as a predator on a timer.

import { BORN_CAUSE, EVENT_TYPE, pushEvent } from './events.js';
import { SPEC_COUNT } from './spec-rescue.js';
import { specParams } from './spec-params.js';
import { spawnAgent } from './spawn.js';

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @returns {number} the index of the first specialisation that can hunt, or -1 when none can
 */
function hunterSpec(world) {
    for (let spec = 0; spec < SPEC_COUNT; spec++) {
        if (specParams(world.config, spec).canHunt) {
            return spec;
        }
    }
    return -1;
}

/**
 * @param {World} world the world
 * @returns {number} how many alive agents have a specialisation that can hunt
 */
function countHunters(world) {
    let hunters = 0;
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && specParams(world.config, world.spec[slot]).canHunt) {
            hunters += 1;
        }
    }
    return hunters;
}

/**
 * Every `predatorRescueInterval` ticks, when fewer than `predatorRescueMin` predators are alive and the world is below
 * `maxAgents`, spawns one immigrant as a predator and pushes `PredatorRescue`. The specialisation is forced and the
 * policy's `initBrain` gives the genome for it (the map-elites seeder reads the predator cell). Off at `predatorRescueMin`
 * 0, where it reads nothing and draws nothing.
 * @param {World} world the world
 * @param {import('./spawn.js').Policy} policy the brain policy
 * @returns {void}
 */
export function rescuePredators(world, policy) {
    const { predatorRescueMin, predatorRescueInterval, maxAgents } = world.config;
    if (predatorRescueMin === 0 || world.tick === 0 || world.tick % predatorRescueInterval !== 0) {
        return;
    }
    const spec = hunterSpec(world);
    if (spec < 0 || world.population >= maxAgents) {
        return;
    }
    const alive = countHunters(world);
    if (alive >= predatorRescueMin) {
        return;
    }
    spawnAgent(world, policy, BORN_CAUSE.IMMIGRANT, spec);
    const o = pushEvent(world.events, EVENT_TYPE.PREDATOR_RESCUE, world.tick);
    world.events.data[o + 2] = alive;
    world.events.data[o + 3] = BORN_CAUSE.IMMIGRANT;
}
