import { describe, expect, it } from 'vitest';
import {
    createFxPool,
    FX_CAPACITY,
    isLive,
    occupancy,
    REBASE_TICKS,
    spawnFx,
} from '../../../js/app/renderer/fx-ring.js';

/**
 * @param {number} [tick] start tick
 * @param {number} [life] life in ticks
 * @returns {import('../../../js/app/renderer/fx-ring.js').FxRecord} a record
 */
function record(tick = 100, life = 20) {
    return {
        x: 1,
        y: 2,
        angle: 0,
        size: 5,
        r: 1,
        g: 0.5,
        b: 0.25,
        gain: 1,
        tick,
        life,
        curve: 0,
        seed: 0.5,
        reach: 10,
        stretch: 1,
        minPx: 2,
    };
}

describe('spawnFx', () => {
    it('writes one instance into the next slot, relative to the base; the first spawn uploads the whole pool', () => {
        const pool = createFxPool();
        expect(spawnFx(pool, record(100))).toBe(0);
        expect(spawnFx(pool, record(101))).toBe(1);
        expect(pool.base).toBe(100);
        expect(pool.time[4]).toBe(1);
        expect(pool.pose[0]).toBe(1);
        expect(pool.dirtyLo).toBe(0);
        expect(pool.dirtyHi).toBe(FX_CAPACITY - 1);
        expect(isLive(pool, 0, 110)).toBe(true);
        expect(isLive(pool, 0, 120)).toBe(false);
        expect(isLive(pool, 5, 110)).toBe(false);
    });

    it('wraps at the capacity and counts live instances it overwrites', () => {
        const pool = createFxPool();
        pool.limit = 8;
        for (let i = 0; i < pool.limit + 3; i++) {
            spawnFx(pool, record(100, 1000));
        }
        expect(pool.next).toBe(3);
        expect(pool.overwrote).toBe(3);
        expect(occupancy(pool)).toBe(pool.limit);
    });

    it('rebases when the playhead passes REBASE_TICKS, shifting every stored start', () => {
        const pool = createFxPool();
        spawnFx(pool, record(10, 1e7));
        const late = REBASE_TICKS + 20;
        spawnFx(pool, record(late, 10));
        expect(pool.base).toBe(late);
        expect(pool.time[0]).toBe(10 - late);
        expect(isLive(pool, 0, late + 1)).toBe(true);
        expect(pool.dirtyLo).toBe(0);
        expect(pool.dirtyHi).toBe(FX_CAPACITY - 1);
    });

    it('keeps the same arrays through 10000 spawns (no allocation)', () => {
        const pool = createFxPool();
        const arrays = [pool.pose, pool.color, pool.time, pool.move];
        const rec = record();
        for (let i = 0; i < 10000; i++) {
            rec.tick = 100 + i;
            spawnFx(pool, rec);
        }
        expect([pool.pose, pool.color, pool.time, pool.move]).toEqual(arrays);
        expect(pool.pose.length).toBe(FX_CAPACITY * 4);
        expect(pool.spawned).toBe(10000);
    });
});
