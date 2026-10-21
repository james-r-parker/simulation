import { describe, expect, it } from 'vitest';
import { SNAPSHOT_FLAG, createSnapshotViews, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { spawnAgent } from '../../js/sim/spawn.js';
import { OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { smallWorld } from './helpers/small-world.js';
import { testPolicy } from './helpers/test-policy.js';

describe('snapshotLayout', () => {
    it('sizes the buffer for the config maxima', () => {
        const layout = snapshotLayout(smallWorld().config);
        expect(layout).toMatchObject({
            headerWords: 6,
            agentStride: 12,
            rayStride: 4,
            foodStride: 3,
            obstacleStride: 3,
            cloudStride: 3,
        });
        expect(layout.bytes).toBe((6 + 8 * (12 + 4) + 4 * 3 + 2 * 3 + 32 * 3) * 4);
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

        expect(Array.from(u32.subarray(0, 6))).toEqual([12, 2, 1, world.config.obstacleCount, 0, 0]);
        expect(u32[6 + 8]).toBe(0);
        expect(u32[6 + 12 + 8]).toBe(2);
        expect(f32[6 + 12]).toBe(world.x[2]);
        expect(f32[6 + 12 + 4]).toBeCloseTo(world.energy[2] / 100, 6);
        expect(Array.from(f32.subarray(30, 33))).toEqual([5, 6, 7]);
        expect(f32[33]).toBe(world.obsX[0]);
        expect(f32[35]).toBe(world.obsRadius[0]);
    });

    it('writes the live clouds after the obstacles as x, y and the share of smokeTicks left', () => {
        const world = smallWorld({ smokeTicks: 200 });
        world.cloudCount = 2;
        world.cloudX.set([10, 30]);
        world.cloudY.set([20, 40]);
        world.cloudTtl.set([100, 50]);
        const views = createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes));
        writeSnapshot(world, views);
        const start = 6 + 2 * 3;
        expect(views.u32[4]).toBe(2);
        expect(Array.from(views.f32.subarray(start, start + 9))).toEqual([10, 20, 0.5, 30, 40, 0.25, 0, 0, 0]);
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
        expect(Array.from(f32.subarray(6, 10))).toEqual([11, 12, 1.5, 13]);
        expect(f32[10]).toBe(0.25);
        expect(Array.from(u32.subarray(11, 15))).toEqual([4, 21, 22, 3]);
        expect(Array.from(u32.subarray(0, 6))).toEqual([0, 1, 0, 2, 0, 0]);
        const obstacleStart = 6 + 12;
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

describe('writeSnapshot agent extras', () => {
    /**
     * @param {Record<string, any>} [over] config overrides
     * @returns {{world: ReturnType<typeof smallWorld>, views: ReturnType<typeof createSnapshotViews>}} a world with
     *   one alive agent in slot 0 and views over a fresh buffer
     */
    function oneAgent(over = {}) {
        const world = smallWorld(over);
        world.alive[0] = 1;
        const views = createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes));
        return { world, views };
    }
    const FLAGS = 6 + 11;

    it('writes the temperature as a share of temperatureMax and the speed as the length of the velocity', () => {
        const { world, views } = oneAgent({ temperatureMax: 100 });
        world.temperature[0] = 25;
        world.vx[0] = 3;
        world.vy[0] = 4;
        writeSnapshot(world, views);
        expect(views.f32[6 + 9]).toBe(0.25);
        expect(views.f32[6 + 10]).toBe(5);
    });

    it('packs the ate and bitten timers into their fields', () => {
        const { world, views } = oneAgent();
        world.ateTimer[0] = 1;
        world.bittenTimer[0] = 30;
        writeSnapshot(world, views);
        const flags = views.u32[FLAGS];
        expect((flags >> SNAPSHOT_FLAG.ATE_SHIFT) & SNAPSHOT_FLAG.TIMER_MASK).toBe(1);
        expect((flags >> SNAPSHOT_FLAG.BITTEN_SHIFT) & SNAPSHOT_FLAG.TIMER_MASK).toBe(30);
        expect(flags & ~0x3ff).toBe(0);
    });

    it('sets alarming, hunt calling and pregnant from their timers', () => {
        const { world, views } = oneAgent();
        world.alarmTimer[0] = 1;
        world.huntTimer[0] = 2;
        world.pregnancy[0] = 3;
        writeSnapshot(world, views);
        const flags = views.u32[FLAGS];
        expect(flags & SNAPSHOT_FLAG.ALARMING).not.toBe(0);
        expect(flags & SNAPSHOT_FLAG.HUNT_CALLING).not.toBe(0);
        expect(flags & SNAPSHOT_FLAG.PREGNANT).not.toBe(0);
        expect(flags & SNAPSHOT_FLAG.JAW_OPEN).toBe(0);
    });

    it('sets the male bit for a male and leaves it clear for a female', () => {
        const { world, views } = oneAgent();
        writeSnapshot(world, views);
        expect(views.u32[FLAGS] & SNAPSHOT_FLAG.MALE).toBe(0);
        world.sex[0] = 1;
        writeSnapshot(world, views);
        expect(views.u32[FLAGS] & SNAPSHOT_FLAG.MALE).toBe(1 << 14);
    });

    it('opens the jaw only for a specialisation that can hunt while the bite output is above 0', () => {
        const { world, views } = oneAgent();
        const biteAt = OUTPUT_INDEX.BITE;
        const cases = [
            { spec: 1, bite: 0.5, open: true },
            { spec: 1, bite: 0, open: false },
            { spec: 0, bite: 0.5, open: false },
        ];
        for (const { spec, bite, open } of cases) {
            world.spec[0] = spec;
            world.outputs[biteAt] = bite;
            writeSnapshot(world, views);
            expect((views.u32[FLAGS] & SNAPSHOT_FLAG.JAW_OPEN) !== 0).toBe(open);
        }
    });
});

describe('writeSnapshot rays', () => {
    /**
     * @returns {{world: ReturnType<typeof smallWorld>, views: ReturnType<typeof createSnapshotViews>}} a world with
     *   alive agents in slots 1 and 3 whose first ray channel is set, and views over a fresh buffer
     */
    function twoAgents() {
        const world = smallWorld();
        const stride = world.layout.inputCount;
        for (const slot of [1, 3]) {
            world.alive[slot] = 1;
            for (let k = 0; k < world.config.rayCount; k++) {
                world.inputs[slot * stride + k * RAY_CHANNELS] = slot / 10 + k / 100;
            }
        }
        return { world, views: createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes)) };
    }

    it('writes the ray count and each alive agent proximities after the clouds when asked', () => {
        const { world, views } = twoAgents();
        world.cloudCount = 1;
        writeSnapshot(world, views, true);
        const { rayCount } = world.config;
        const start = 6 + 2 * 12 + 0 * 3 + world.config.obstacleCount * 3 + 3;
        expect(views.u32[5]).toBe(rayCount);
        const expected = [1, 3].flatMap((slot) => Array.from({ length: rayCount }, (_, k) => slot / 10 + k / 100));
        expect(Array.from(views.f32.subarray(start, start + 2 * rayCount))).toEqual(expected.map(Math.fround));
    });

    it('writes no ray part and a ray count of 0 by default, even over an old buffer', () => {
        const { world, views } = twoAgents();
        writeSnapshot(world, views, true);
        writeSnapshot(world, views);
        expect(views.u32[5]).toBe(0);
    });
});
