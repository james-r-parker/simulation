import { describe, expect, it } from 'vitest';
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { plainBrain } from '../../js/evo/plain-brain.js';
import { createPreStep5Config, preStep5 } from '../helpers/pre-step5.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { populationAfter as guardPopulationAfter } from '../../scripts/lib/heat-guard.mjs';

// The scripted sweet-spot world is defined on the numbers before the step 5 adoption: at the step 5 defaults the
// gentle forager's seed 1 holds at the start population (100; seeds 2 and 3 still grow) as the status effects chill and
// stagger it, which is a property of the new world, not of the temperature rule this file pins.
// The guard spreads its overrides over the sweet-spot world, so the specialisations key (the predator's drain, read
// only with the sprint store on) is left out: it would replace the world's own predator multipliers.
const PRE_FLAT = Object.fromEntries(Object.entries(preStep5()).filter(([key]) => key !== 'specialisations'));
const COLD_START = 20;
const COLD_TICKS = 3000;

/**
 * @param {keyof typeof SCRIPTED_CONTROLLERS} name a `SCRIPTED_CONTROLLERS` key
 * @returns {number} the mean population at the end over seeds 1 to 3
 */
const pooled = (name) => [1, 2, 3].reduce((sum, seed) => sum + guardPopulationAfter(name, PRE_FLAT, seed), 0) / 3;

/** @param {keyof typeof SCRIPTED_CONTROLLERS} name a `SCRIPTED_CONTROLLERS` key @returns {number} the population at the end (shared with the heat guard) */
const populationAfter = (name) => guardPopulationAfter(name, PRE_FLAT);

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
            // Judged on the populations pooled over seeds 1 to 3: one seed's rusher can hold on (74 on seed 1 against a
            // gentle 120) while the pool keeps the gap the rule is about.
            const rusher = pooled('thrust100');
            expect(rusher).toBeLessThan(config100());
            expect(rusher).toBeLessThan(pooled('thrust20') / 2);
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
            const config = createPreStep5Config({
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
    return createPreStep5Config({ ...SIMPLE_WORLD }).initialAgents;
}
