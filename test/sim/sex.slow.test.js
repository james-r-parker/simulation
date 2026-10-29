import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const TICKS = 2500;
const TIMEOUT_MS = scaleTimeout(120_000);

/**
 * Runs a small crowded world with sexes on.
 * @param {number} seed the seed
 * @returns {{ born: number[][], world: ReturnType<typeof createWorld>, hash: string }} the births as
 *   `[cause, sex]`, the final world and its hash
 */
function run(seed) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(
        createConfig({
            ...FEATURES_OFF,
            worldWidth: 1500,
            worldHeight: 1500,
            maxAgents: 150,
            initialAgents: 60,
            minAgents: 20,
            maxFood: 400,
            initialFood: 200,
            maturityTicks: 50,
            reproductionCooldown: 60,
            pregnancyTicks: 40,
            checkInvariants: true,
            seed,
        }),
        policy,
    );
    const born = [];
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        for (let i = 0; i < readEvents(world.events); i++) {
            const o = i * EVENT_STRIDE;
            if (world.events.data[o] === EVENT_TYPE.AGENT_BORN) {
                born.push([world.events.data[o + 8], world.events.data[o + 9]]);
            }
        }
    }
    return { born, world, hash: hashWorld(world) };
}

describe('sexes over a run', () => {
    it(
        'keeps both sexes alive, bears children of both sexes, keeps invariants and repeats exactly',
        () => {
            const a = run(7);
            const mated = a.born.filter(([cause]) => cause === BORN_CAUSE.MATE);
            expect(mated.length).toBeGreaterThan(0);
            expect(mated.some(([, sex]) => sex === 0)).toBe(true);
            expect(mated.some(([, sex]) => sex === 1)).toBe(true);
            for (const [, sex] of a.born) {
                expect([0, 1]).toContain(sex);
            }
            expect(run(7).hash).toBe(a.hash);
        },
        TIMEOUT_MS,
    );
});
