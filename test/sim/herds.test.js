import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { assertInvariants, INVARIANT } from '../../js/sim/invariants.js';
import { createHerds } from '../../js/sim/herds.js';
import { fork, createRng } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { allocateWorld } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { testPolicy } from './helpers/test-policy.js';

const SMALL = {
    worldWidth: 2000,
    worldHeight: 1200,
    maxAgents: 4,
    initialAgents: 0,
    minAgents: 0,
    maxFood: 4,
    initialFood: 0,
    herdCount: 2,
    herdSize: 3,
};

function build(over = {}) {
    return createWorld(createConfig({ ...SIMPLE_WORLD, ...SMALL, ...over }), testPolicy);
}

describe('createHerds', () => {
    it('places seeded groups with stable ids, ages, stores and rock clearance', () => {
        const world = build({ seed: 71 });
        expect(world.herdMax).toBe(6);
        expect(Array.from(world.herdAlive)).toEqual([1, 1, 1, 1, 1, 1]);
        expect(Array.from(world.herdGroup)).toEqual([0, 0, 0, 1, 1, 1]);
        expect(Array.from(world.herdId)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(world.herdNextId).toBe(7);
        expect(Array.from(world.herdStore)).toEqual(Array(6).fill(world.config.herdStoreMax / 2));
        for (let slot = 0; slot < world.herdMax; slot++) {
            expect(world.herdAge[slot]).toBeGreaterThanOrEqual(0);
            expect(world.herdAge[slot]).toBeLessThan(world.config.herdLifeTicks);
            expect(world.herdLife[slot]).toBeGreaterThan(0);
            for (let rock = 0; rock < world.obsRadius.length; rock++) {
                expect(
                    Math.hypot(world.herdX[slot] - world.obsX[rock], world.herdY[slot] - world.obsY[rock]),
                ).toBeGreaterThanOrEqual(world.config.herdRadius + world.obsRadius[rock]);
            }
        }
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('replays the same layout from its world seed and changes with another seed', () => {
        const first = build({ seed: 17 });
        const repeat = build({ seed: 17 });
        const other = build({ seed: 18 });
        expect(hashWorld(repeat)).toBe(hashWorld(first));
        expect(hashWorld(other)).not.toBe(hashWorld(first));
    });

    it('allocates the herds stream but places nothing when herdCount is zero', () => {
        const world = build({ herdCount: 0 });
        expect(world.herdAlive).toHaveLength(0);
        expect(world.herdNextId).toBe(1);
        expect(world.rng.herds).toBeDefined();
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('checks dead herd slots do not retain food stores', () => {
        const world = build();
        world.herdAlive[0] = 0;
        world.herdStore[0] = 1;
        expect(() => assertInvariants(world)).toThrow(expect.objectContaining({ invariant: INVARIANT.HERDS, slot: 0 }));
    });

    it('fails loudly when every seeded centre placement overlaps a rock', () => {
        const world = allocateWorld(
            createConfig({ ...SIMPLE_WORLD, ...SMALL, herdCount: 1, placementTries: 1, seed: 71 }),
        );
        world.rng = { herds: fork(createRng(71), 'herds') };
        world.obsRadius.fill(100000);
        expect(() => createHerds(world)).toThrow(/herd placement failed at tick 0/);
    });
});
