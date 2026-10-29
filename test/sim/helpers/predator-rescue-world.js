// A seeded world of non-predators for the predator rescue tests: predators start, never breed and starve.
import { createConfig } from '../../../js/sim/config.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { FEATURES_OFF } from '../../../scripts/lib/features-on.mjs';

export const PREDATOR = 1;
export const STARTING_PREDATORS = 3;
const TICKS = 6000;
const SAMPLE_EVERY = 50;

/**
 * A zero-brain policy that starts `STARTING_PREDATORS` predators and makes every later spawn a forager, as the
 * measured worlds do: predators never earn enough to breed, so only the rescue replaces them.
 * @param {number[]} [genomes] receives the specialisation index of each `initBrain` call
 * @returns {any}
 */
export function foragerPolicy(genomes = []) {
    let calls = 0;
    return {
        initSpec: () => (calls++ < STARTING_PREDATORS ? PREDATOR : 0),
        initBrain: (/** @type {any} */ w, /** @type {number} */ slot) => genomes.push(w.spec[slot]),
        childBrain() {},
    };
}

/**
 * @param {Record<string, any>} over config overrides
 * @returns {Record<string, any>} the config
 */
export function config(over) {
    return createConfig({
        ...FEATURES_OFF,
        worldWidth: 2000,
        worldHeight: 2000,
        maxAgents: 40,
        initialAgents: 12,
        minAgents: 10,
        immigrationInterval: 0,
        maxFood: 100,
        initialFood: 60,
        specialisations: { predator: { plantFoodValue: 0 } },
        initialEnergy: 250,
        seed: 11,
        ...over,
    });
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number} the alive predators
 */
export function predators(world) {
    let n = 0;
    for (let s = 0; s < world.alive.length; s++) {
        n += world.alive[s] === 1 && world.spec[s] === PREDATOR ? 1 : 0;
    }
    return n;
}

/**
 * @param {Record<string, any>} over config overrides
 * @returns {number[]} the alive predator count every `SAMPLE_EVERY` ticks
 */
export function sample(over) {
    const policy = foragerPolicy();
    const world = createWorld(config(over), policy);
    const counts = [];
    for (let t = 1; t <= TICKS; t++) {
        step(world, policy);
        if (t % SAMPLE_EVERY === 0) {
            counts.push(predators(world));
        }
    }
    return counts;
}
