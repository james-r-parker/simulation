import { describe, expect, it } from 'vitest';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { createNaturalV1 } from '../../../js/evo/policies/natural-v1.js';
import { SIGMA_START } from '../../../js/evo/mutation.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { hashWorld } from '../../../js/sim/world-hash.js';
import { scaleTimeout } from '../../../scripts/lib/test-timeout.mjs';

/**
 * @param {number} seed
 * @param {number} ticks
 * @param {boolean} observed
 * @returns {{policy: any, world: any, hash: string}}
 */
function run(seed, ticks, observed) {
    const config = createConfig({ seed, maxAgents: 60, initialAgents: 30, minAgents: 10, rayCount: 4, brainHidden: 6 });
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    const policy = createNaturalV1({ config, observer });
    const world = createWorld(config, policy.brain);
    const phases = observed ? observerPhases(observer) : undefined;
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        if (observed) {
            observe(observer, world, policy.fitness);
        }
        policy.afterStep(world);
    }
    return { policy, world, hash: String(hashWorld(world)) };
}

/** Real worlds share CI's few cores with the golden runs, so these get more than the 5 s default. */
const REAL_WORLD_TIMEOUT_MS = scaleTimeout(30_000);

describe('in a real world', () => {
    it(
        'is deterministic: the same seed gives the same hash and sigma',
        () => {
            const a = run(3, 400, true);
            const b = run(3, 400, true);
            expect(a.hash).toBe(b.hash);
            expect(Array.from(a.policy.sigma)).toEqual(Array.from(b.policy.sigma));
        },
        REAL_WORLD_TIMEOUT_MS,
    );

    it(
        'steps bit-identically with and without an observer, and breeds children',
        () => {
            const withObserver = run(4, 600, true);
            const replay = run(4, 600, false);
            expect(replay.hash).toBe(withObserver.hash);
            const bred = Array.from(replay.policy.sigma).filter((s) => s !== 0 && s !== SIGMA_START);
            expect(bred.length).toBeGreaterThan(0);
        },
        REAL_WORLD_TIMEOUT_MS,
    );
});
