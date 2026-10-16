import { describe, expect, it } from 'vitest';
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';

const TICKS = 7000;

/**
 * Runs one constant-thrust controller on the default world with no floor and no immigrants.
 * @param {string} name a `SCRIPTED_CONTROLLERS` key
 * @returns {number} the population at the end
 */
function populationAfter(name) {
    const config = createConfig({ seed: 1, minAgents: 0, immigrationInterval: 0 });
    const brain = createBaselineV5().brain;
    const world = createWorld(config, brain);
    const run = SCRIPTED_CONTROLLERS[name]({ world, rng: fork(createRng(1), 'scripted') });
    for (let t = 0; t < TICKS && world.population > 0; t++) {
        step(world, brain, { brain: run });
    }
    return world.population;
}

describe('body temperature sweet spot', () => {
    it('a forager at a gentle speed grows while a sitter freezes and a rusher overheats out', () => {
        expect(populationAfter('thrust0')).toBe(0);
        expect(populationAfter('thrust100')).toBe(0);
        expect(populationAfter('thrust20')).toBeGreaterThan(config100());
    }, 120_000);
});

/** @returns {number} the starting population, which the gentle forager must exceed */
function config100() {
    return createConfig().initialAgents;
}
