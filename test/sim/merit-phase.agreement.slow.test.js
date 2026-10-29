import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { createObserver, observe, observerPhases } from '../../js/evo/observer.js';
import { createNaturalV1 } from '../../js/evo/policies/natural-v1.js';
import { SURVIVABLE_PREDATOR_EVERY, playPredatorWorld, survivableWorld } from '../evo/helpers/predator-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 3000;
const TIMEOUT_MS = scaleTimeout(120_000);

/**
 * Compares, per alive slot after each tick, the `merit` phase's raw deliberate intake with the observer's deliberate
 * food and bite energy. The phase classifies at its own tick stamp and the observer one tick later, each consistently.
 * @returns {{onTick: (world: any, observer: any) => void, stats: Record<string, number>}} the hook and its counts
 */
function phaseHarness() {
    const stats = { checks: 0, mismatches: 0, deliberate: 0 };
    const onTick = (/** @type {any} */ world, /** @type {any} */ { intent }) => {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1 && world.ageTicks[slot] > 0) {
                const expected = intent.deliberateFood[slot] + intent.deliberateBite[slot];
                stats.checks += 1;
                stats.mismatches += world.deliberateIntake[slot] === expected ? 0 : 1;
                stats.deliberate += expected > 0 ? 1 : 0;
            }
        }
    };
    return { onTick, stats };
}

describe('the merit phase agrees with observer.intent', () => {
    it(
        'on the deliberate intake of every slot of the default world, seed 1, 3000 ticks, random brains',
        () => {
            const config = createConfig({ ...FEATURES_OFF, seed: 1 });
            const policy = createNaturalV1({ config }).brain;
            const world = createWorld(config, policy);
            const observer = createObserver(config, fork(createRng(1), 'eval'));
            observe(observer, world);
            const { onTick, stats } = phaseHarness();
            const overrides = observerPhases(observer);
            for (let t = 0; t < TICKS; t++) {
                step(world, policy, overrides);
                observe(observer, world);
                onTick(world, observer);
            }
            expect(stats.checks).toBeGreaterThan(100000);
            expect(stats.mismatches).toBe(0);
        },
        TIMEOUT_MS,
    );

    it.each([1, 2])(
        'on the deliberate intake of every slot of the hunter and fleer duel, seed %i, 3000 ticks',
        (seed) => {
            const { onTick, stats } = phaseHarness();
            const { world } = playPredatorWorld(seed, TICKS, {
                world: survivableWorld,
                config: {},
                predatorEvery: SURVIVABLE_PREDATOR_EVERY,
                onTick,
            });
            expect(world.tick).toBe(TICKS);
            expect(stats.mismatches).toBe(0);
            expect(stats.deliberate).toBeGreaterThan(0);
        },
        TIMEOUT_MS,
    );
});
