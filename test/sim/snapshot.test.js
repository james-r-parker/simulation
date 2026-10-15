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

describe('writeSnapshot exact layout', () => {
    /**
     * @param {ReturnType<typeof smallWorld>} world the world
     * @returns {{f32: Float32Array, u32: Uint32Array}} views over a fresh buffer of the exact size
     */
    function freshViews(world) {
        return createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes));
    }

    it('writes every agent field at its own offset and leaves the rest of the buffer zero', () => {
        const world = smallWorld({ maxEnergy: 1000 });
        world.alive[3] = 1;
        world.x[3] = 11;
        world.y[3] = 12;
        world.angle[3] = 1.5;
        world.size[3] = 13;
        world.energy[3] = 250;
        world.spec[3] = 4;
        world.lineageId[3] = 21;
        world.genomeId[3] = 22;
        const views = freshViews(world);
        writeSnapshot(world, views);
        const { f32, u32 } = views;
        expect(Array.from(f32.subarray(4, 8))).toEqual([11, 12, 1.5, 13]);
        expect(f32[8]).toBe(0.25);
        expect(Array.from(u32.subarray(9, 13))).toEqual([4, 21, 22, 3]);
        expect(Array.from(u32.subarray(0, 4))).toEqual([0, 1, 0, 2]);
        const obstacleStart = 4 + 9;
        expect(f32[obstacleStart]).toBe(world.obsX[0]);
        expect(f32[obstacleStart + 6]).toBe(0);
        expect(Array.from(u32.subarray(obstacleStart + 6))).toEqual(new Array(u32.length - obstacleStart - 6).fill(0));
    });

    it('accepts a buffer of exactly the layout size and rejects one word less', () => {
        const world = smallWorld();
        const { bytes } = snapshotLayout(world.config);
        expect(() => writeSnapshot(world, createSnapshotViews(new ArrayBuffer(bytes)))).not.toThrow();
        expect(() => writeSnapshot(world, createSnapshotViews(new ArrayBuffer(bytes - 4)))).toThrow(
            `writeSnapshot: buffer holds ${bytes - 4} bytes, the config needs ${bytes}`,
        );
    });
});
