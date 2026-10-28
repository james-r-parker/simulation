import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { isDeliberate, biteDeliberate, mealDeliberate, trackMerit } from '../../js/sim/merit-state.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { createObserver, observe, observerPhases } from '../../js/evo/observer.js';
import { createNaturalV1 } from '../../js/evo/policies/natural-v1.js';
import { SURVIVABLE_PREDATOR_EVERY, playPredatorWorld, survivableWorld } from '../evo/helpers/predator-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const TICKS = 3000;
const MAX_SLOTS = 4096;

/**
 * The agreement harness: a sim-side mirror of the observer's meal and bite credit, fed the same world each tick.
 * @returns {{onTick: (world: any, observer: any) => void, stats: Record<string, number>}} the per-tick hook and the
 *   counts it gathered
 */
function agreementHarness() {
    const slots = MAX_SLOTS;
    const foodMark = new Float64Array(slots);
    const biteMark = new Float64Array(slots);
    const foodDeliberate = new Float64Array(slots);
    const biteDeliberateSum = new Float64Array(slots);
    const stats = { checks: 0, mismatches: 0, meals: 0, deliberateMeals: 0, bites: 0, deliberateBites: 0 };

    const check = (/** @type {boolean} */ same) => {
        stats.checks += 1;
        stats.mismatches += same ? 0 : 1;
    };

    const onTick = (/** @type {any} */ world, /** @type {any} */ { intent }) => {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 0) {
                continue;
            }
            if (world.ageTicks[slot] === 0) {
                foodMark[slot] = 0;
                biteMark[slot] = 0;
                foodDeliberate[slot] = 0;
                biteDeliberateSum[slot] = 0;
            }
            trackMerit(world, slot);
            if (world.ageTicks[slot] === 0) {
                continue;
            }
            // The classification itself, every tick.
            check(mealDeliberate(world, slot) === isDeliberate(intent.food, slot, world.tick));
            check(biteDeliberate(world, slot) === isDeliberate(intent.prey, slot, world.tick));
            const meal = world.foodEnergy[slot] - foodMark[slot];
            foodMark[slot] = world.foodEnergy[slot];
            const bite = world.biteEnergy[slot] - biteMark[slot];
            biteMark[slot] = world.biteEnergy[slot];
            stats.meals += meal > 0 ? 1 : 0;
            stats.bites += bite > 0 ? 1 : 0;
            if (meal > 0 && mealDeliberate(world, slot)) {
                foodDeliberate[slot] += meal;
                stats.deliberateMeals += 1;
            }
            if (bite > 0 && biteDeliberate(world, slot)) {
                biteDeliberateSum[slot] += bite;
                stats.deliberateBites += 1;
            }
            // The per-slot totals the observer keeps, compared as they stand.
            check(foodDeliberate[slot] === intent.deliberateFood[slot]);
            check(biteDeliberateSum[slot] === intent.deliberateBite[slot]);
        }
    };
    return { onTick, stats };
}

describe('the sim tracker agrees with observer.intent', () => {
    it('on every tick and every slot of the default world, seed 1, 3000 ticks, random brains', () => {
        const config = createConfig({ ...FEATURES_OFF, meritEnabled: false, seed: 1 });
        const policy = createNaturalV1({ config }).brain;
        const world = createWorld(config, policy);
        const observer = createObserver(config, fork(createRng(1), 'eval'));
        observe(observer, world);
        const { onTick, stats } = agreementHarness();
        const overrides = observerPhases(observer);
        for (let t = 0; t < TICKS; t++) {
            step(world, policy, overrides);
            observe(observer, world);
            onTick(world, observer);
        }
        expect(stats.checks).toBeGreaterThan(100000);
        expect(stats.mismatches).toBe(0);
        expect(stats.meals).toBeGreaterThan(0);
    }, 120_000);

    it.each([1, 2])(
        'on every tick and slot of the hunter and fleer duel, seed %i, 3000 ticks, with deliberate meals and bites',
        (seed) => {
            const { onTick, stats } = agreementHarness();
            const { world } = playPredatorWorld(seed, TICKS, {
                world: survivableWorld,
                config: { meritEnabled: false },
                predatorEvery: SURVIVABLE_PREDATOR_EVERY,
                onTick,
            });
            expect(world.tick).toBe(TICKS);
            expect(stats.mismatches).toBe(0);
            expect(stats.deliberateMeals).toBeGreaterThan(0);
            expect(stats.deliberateBites).toBeGreaterThan(0);
            expect(stats.bites).toBeGreaterThan(stats.deliberateBites);
        },
        120_000,
    );
});
