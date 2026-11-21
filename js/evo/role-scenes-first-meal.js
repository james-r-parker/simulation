// The first meal in the real sim (docs/designs/role-budget.md, "Cross-check against the sim"): the default world's patches and no
// other agent, a body oracle born at seeded points by one birth rule that either heads for the nearest patch (`reach`) or walks
// straight until food is in view (`find`), and the share that eat before their energy is gone. The readings carry the names of
// the formula's (`reach.share`, `find.share`).

import { detCos, detSin } from '../sim/det-math.js';
import { BORN_CAUSE } from '../sim/events.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork, nextFloat } from '../sim/rng.js';
import { createWorld, spawnAgent } from '../sim/spawn.js';
import { step } from '../sim/step.js';
import { wayfarerBrain } from './forage-oracles.js';
import { bestRangeSpeed, contextOf, lifeOf } from './role-budget-forage.js';
import { roleParams } from './role-budget-params.js';
import { setEnergy } from './role-scenes-thrive.js';
import { viewReach } from './role-budget-senses.js';

const TWO_PI = 2 * Math.PI;

/**
 * The flora table with every plant the same: a grass that always fruits, an item of `foodEnergy` and `foodRadius` (the formula's
 * item), so the scene reads the geometry of the patches and not the mixture of species, which the formulas do not model.
 * @param {Record<string, any>} flora the config's flora table
 * @returns {Record<string, any>} the table with grass the only species, at energy 1, radius 1, span 1 and no spread
 */
function uniformFlora(flora) {
    return Object.fromEntries(
        Object.entries(flora).map(([name, row]) => [
            name,
            {
                ...row,
                share: name === 'grass' ? 1 : 0,
                energy: 1,
                energySpread: 0,
                radius: 1,
                start: 0,
                span: 1,
                toxicity: 0,
            },
        ]),
    );
}

/**
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {{count: number, seed: number}} scene how many bodies and the world's seed
 * @returns {Readonly<Record<string, any>>} the config with no agents, no floor, no herds and the food at its cap: the patches as a
 *   long-running world holds them, and `count` free slots
 */
export function firstMealConfig(config, { count, seed }) {
    return createConfig({
        ...config,
        flora: uniformFlora(config.flora),
        seed,
        initialAgents: 0,
        minAgents: 0,
        maxAgents: count + 8,
        initialFood: config.maxFood,
        herdCount: 0,
        checkInvariants: false,
    });
}

/**
 * Puts a freshly spawned body inside a patch, as a child is born beside a mother that stands in one, with the energy of a gift.
 * @param {Record<string, any>} world the world
 * @param {{slot: number, energy: number, rng: import('../sim/rng.js').Rng}} body the body, its energy and a stream
 * @returns {void}
 */
function bornInPatch(world, { slot, energy, rng }) {
    const patch = Math.floor(nextFloat(rng) * world.config.foodPatchCount);
    const radius = world.config.foodPatchRadius * Math.sqrt(nextFloat(rng));
    const theta = nextFloat(rng) * TWO_PI;
    world.x[slot] = world.patchX[patch] + radius * detCos(theta);
    world.y[slot] = world.patchY[patch] + radius * detSin(theta);
    setEnergy(world, slot, energy);
}

/**
 * @typedef {object} FirstMealScene
 * @property {{share: number, meanTicks: number | null, count: number, eaten: number}} outcome the share that ate before their
 *   energy was gone, the mean ticks to the first meal of those that did, how many were born and how many ate
 */

/**
 * Plays `count` bodies of one spec, all born by `rule`, in the default world's patches with no other agent, each walking at the
 * speed the budget gives it (`bestRangeSpeed`) until its energy is gone or it has eaten. A founder is born by `INITIAL` and an
 * entrant by `FLOOR` at a random clear point (`spawnAgent`); a child inside a patch with half the split gate.
 * @param {Readonly<Record<string, any>>} config the default world's config
 * @param {{spec: string, rule: 'founder' | 'entrant' | 'child', mode: 'reach' | 'find', count?: number, seed?: number}} scene the
 *   spec, the birth rule, whether the body knows where the patches are, how many bodies (256) and the seed
 * @returns {FirstMealScene} the share that ate
 */
export function playFirstMeal(config, { spec, rule, mode, count = 256, seed = 1 }) {
    const world0 = firstMealConfig(config, { count, seed });
    const specIndex = /** @type {Record<string, any>} */ (world0.specialisations)[spec].index;
    const policy = { initSpec: () => specIndex, initBrain() {} };
    const world = createWorld(world0, policy);
    const p = roleParams(world0, spec, {}, { age: 'juvenile' });
    const ctx = contextOf(world0, spec, p);
    const placing = fork(createRng(seed), 'role-budget:first-meal');
    const gift = Math.max(p.repro.splitMin, p.repro.birthReserve / (1 - p.repro.childShare)) * p.repro.childShare;
    const view = viewReach(p, Math.PI / 2);
    const bodies = Array.from({ length: count }, () => {
        const slot = spawnAgent(world, policy, rule === 'founder' ? BORN_CAUSE.INITIAL : BORN_CAUSE.FLOOR);
        if (rule === 'child') {
            bornInPatch(world, { slot, energy: gift, rng: placing });
        }
        const speed = bestRangeSpeed(ctx, world.energy[slot]);
        const limit = Math.ceil(lifeOf(ctx, { energy: world.energy[slot], speed }).ticks * 1.2) + 50;
        return { slot, limit, ate: -1, brain: wayfarerBrain({ slot, mode, speed, view }) };
    });
    const brain = (/** @type {Record<string, any>} */ w) => {
        for (const b of bodies) {
            if (w.alive[b.slot] === 1) {
                b.brain(w);
            }
        }
    };
    const horizon = Math.max(...bodies.map((b) => b.limit));
    for (let n = 1; n <= horizon && bodies.some((b) => b.ate < 0 && world.alive[b.slot] === 1); n++) {
        step(world, policy, { brain });
        for (const b of bodies) {
            b.ate = b.ate < 0 && world.foodEnergy[b.slot] > 0 ? n : b.ate;
        }
    }
    const ate = bodies.filter((b) => b.ate >= 0);
    const ticks = ate.map((b) => b.ate);
    return {
        outcome: {
            share: ate.length / count,
            meanTicks: ate.length === 0 ? null : ticks.reduce((a, t) => a + t, 0) / ate.length,
            count,
            eaten: ate.length,
        },
    };
}
