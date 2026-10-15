import { describe, expect, it } from 'vitest';
import { createSnapshotViews, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { spawnAgent } from '../../js/sim/spawn.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { smallWorld } from './helpers/small-world.js';
import { testPolicy } from './helpers/test-policy.js';

describe('snapshotLayout', () => {
    it('sizes the buffer for the config maxima', () => {
        const layout = snapshotLayout(smallWorld().config);
        expect(layout).toMatchObject({ headerWords: 4, agentStride: 9, foodStride: 3, obstacleStride: 3 });
        expect(layout.bytes).toBe((4 + 8 * 9 + 4 * 3 + 2 * 3) * 4);
    });
});

describe('writeSnapshot', () => {
    it('writes the header, alive agents by ascending slot, alive food and the obstacles', () => {
        const world = smallWorld({ initialEnergy: 50, maxEnergy: 100 });
        spawnAgent(world, testPolicy, BORN_CAUSE.INITIAL);
        spawnAgent(world, testPolicy, BORN_CAUSE.INITIAL);
        spawnAgent(world, testPolicy, BORN_CAUSE.INITIAL);
        world.alive[1] = 0;
        world.population = 2;
        world.tick = 12;
        world.foodAlive[2] = 1;
        world.foodX[2] = 5;
        world.foodY[2] = 6;
        world.foodRadius[2] = 7;
        world.foodCount = 1;
        const buffer = new ArrayBuffer(snapshotLayout(world.config).bytes);
        const { f32, u32 } = createSnapshotViews(buffer);
        writeSnapshot(world, { f32, u32 });

        expect(Array.from(u32.subarray(0, 4))).toEqual([12, 2, 1, world.config.obstacleCount]);
        expect(u32[4 + 8]).toBe(0);
        expect(u32[4 + 9 + 8]).toBe(2);
        expect(f32[4 + 9]).toBe(world.x[2]);
        expect(f32[4 + 9 + 4]).toBeCloseTo(world.energy[2] / 100, 6);
        expect(Array.from(f32.subarray(22, 25))).toEqual([5, 6, 7]);
        expect(f32[25]).toBe(world.obsX[0]);
        expect(f32[27]).toBe(world.obsRadius[0]);
    });

    it('throws when the buffer is too small', () => {
        const world = smallWorld();
        const views = createSnapshotViews(new ArrayBuffer(16));
        expect(() => writeSnapshot(world, views)).toThrow(/needs/);
    });
});
