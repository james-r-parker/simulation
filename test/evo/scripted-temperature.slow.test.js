import { describe, expect, it } from 'vitest';
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { plainBrain } from '../../js/evo/plain-brain.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { populationAfter as guardPopulationAfter } from '../../scripts/lib/heat-guard.mjs';

const COLD_START = 20;
const COLD_TICKS = 3000;

/** @param {keyof typeof SCRIPTED_CONTROLLERS} name a `SCRIPTED_CONTROLLERS` key @returns {number} the population at the end (shared with the heat guard) */
const populationAfter = (name) => guardPopulationAfter(name);

// Each run takes about 10 s alone and several times that under the gate's coverage instrumentation, so each case has
// its own generous timeout.
const TIMEOUT_MS = scaleTimeout(300_000);

describe('body temperature sweet spot', () => {
    it(
        'a sitter freezes',
        () => {
            expect(populationAfter('thrust0')).toBe(0);
        },
        TIMEOUT_MS,
    );

    it(
        'a rusher cannot sustain itself on food a gentle forager grows on',
        () => {
            const rusher = populationAfter('thrust100');
            expect(rusher).toBeLessThan(config100());
            expect(rusher).toBeLessThan(populationAfter('thrust20') / 2);
        },
        TIMEOUT_MS,
    );

    it(
        'a forager at a gentle speed grows',
        () => {
            expect(populationAfter('thrust20')).toBeGreaterThan(config100());
        },
        TIMEOUT_MS,
    );
});

describe('body temperature cold band', () => {
    it(
        'a foodSeeker started below the cold stress threshold moves, eats and rises above it',
        () => {
            // This pins body temperature, not predation, so the predator keeps the neutral multipliers: the tuned ones
            // slow the scripted foodSeeker's warm-up past COLD_TICKS.
            const config = createConfig({
                ...SIMPLE_WORLD,
                seed: 1,
                initialAgents: 30,
                minAgents: 0,
                specialisations: { predator: { biteMultiplier: 1, turnMultiplier: 1, sprintBoost: 1 } },
            });
            const brain = plainBrain;
            const world = createWorld(config, brain);
            const run = SCRIPTED_CONTROLLERS.foodSeeker({ world, rng: fork(createRng(1), 'scripted') });
            /** @type {Map<number, number>} slot to the genome that started cold there */
            const starters = new Map();
            for (let slot = 0; slot < world.alive.length; slot++) {
                if (world.alive[slot]) {
                    world.temperature[slot] = COLD_START;
                    starters.set(slot, world.genomeId[slot]);
                }
            }
            const ate = new Set();
            let recovered = false;
            for (let t = 0; t < COLD_TICKS && !recovered; t++) {
                step(world, brain, { brain: run });
                for (let slot = 0; slot < world.alive.length; slot++) {
                    if (!world.alive[slot] || starters.get(slot) !== world.genomeId[slot]) {
                        continue;
                    }
                    if (world.foodEnergy[slot] > 0) {
                        ate.add(slot);
                    }
                    if (ate.has(slot) && world.temperature[slot] > config.temperatureColdStress) {
                        recovered = true;
                    }
                }
            }
            expect(ate.size).toBeGreaterThan(0);
            expect(recovered).toBe(true);
        },
        TIMEOUT_MS,
    );
});

/** @returns {number} the starting population, which the gentle forager must exceed */
function config100() {
    return createConfig({ ...SIMPLE_WORLD }).initialAgents;
}
