import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import {
    BIRTH_MOTE_TICKS,
    BITE_STREAKS,
    BITE_TICKS,
    createSparkLayer,
    createSparkPool,
    DEATH_MOTES,
    DEATH_TICKS,
    EATEN_FLASH_TICKS,
    packSparks,
    spawnBurst,
    SPARK_CAPACITY,
} from '../../../js/app/renderer/sparks.js';

const out = () => ({
    pose: new Float32Array(SPARK_CAPACITY * 4),
    color: new Float32Array(SPARK_CAPACITY * 4),
    shape: new Float32Array(SPARK_CAPACITY * 4),
});
const base = { x: 100, y: 200, tick: 10, size: 20, rgb: [0.2, 0.4, 0.8] };

describe('spawnBurst', () => {
    it('a bite is 8 streaks lasting 12 ticks', () => {
        const pool = createSparkPool(1);
        expect(spawnBurst(pool, { ...base, kind: 'bite' })).toBe(BITE_STREAKS);
        const o = out();
        expect(packSparks(pool, 10, o)).toBe(8);
        expect(packSparks(pool, 10 + BITE_TICKS - 0.5, o)).toBe(8);
        expect(packSparks(pool, 10 + BITE_TICKS, o)).toBe(0);
        expect(packSparks(pool, 9, o)).toBe(0);
    });

    it('a bite spreads its streaks evenly round the compass from the origin', () => {
        const pool = createSparkPool(2);
        spawnBurst(pool, { ...base, kind: 'bite' });
        const o = out();
        packSparks(pool, 10, o);
        const angles = Array.from({ length: 8 }, (_, i) => o.pose[i * 4 + 2]).sort((a, b) => a - b);
        expect(angles[1] - angles[0]).toBeCloseTo(Math.PI / 4, 5);
        expect(o.pose[0]).toBe(100);
        expect(o.pose[1]).toBe(200);
        expect(o.pose[3]).toBeGreaterThan(0);
    });

    it('a birth is 6 motes in the child colour lasting 30 ticks', () => {
        const pool = createSparkPool(1);
        expect(spawnBurst(pool, { ...base, kind: 'born' })).toBe(6);
        const o = out();
        expect(packSparks(pool, 20, o)).toBe(6);
        expect(Array.from(o.color.slice(0, 3))).toEqual(Array.from(Float32Array.from(base.rgb)));
        expect(packSparks(pool, 10 + BIRTH_MOTE_TICKS, o)).toBe(0);
    });

    it('a death is 10 motes lasting 40 ticks, plus a 6-tick flash when eaten', () => {
        const a = createSparkPool(1);
        expect(spawnBurst(a, { ...base, kind: 'died' })).toBe(DEATH_MOTES);
        const b = createSparkPool(1);
        expect(spawnBurst(b, { ...base, kind: 'died', eaten: true })).toBe(DEATH_MOTES + 1);
        const o = out();
        expect(packSparks(b, 12, o)).toBe(11);
        expect(packSparks(b, 10 + EATEN_FLASH_TICKS, o)).toBe(10);
        expect(packSparks(b, 10 + DEATH_TICKS, o)).toBe(0);
    });

    it('fades each spark to nothing by the end of its life', () => {
        const pool = createSparkPool(1);
        spawnBurst(pool, { ...base, kind: 'died' });
        const o = out();
        packSparks(pool, 11, o);
        const early = o.color[3];
        packSparks(pool, 49, o);
        expect(o.color[3]).toBeLessThan(early / 4);
    });

    it('is the same for the same seed', () => {
        const run = (/** @type {number} */ seed) => {
            const pool = createSparkPool(seed);
            spawnBurst(pool, { ...base, kind: 'died' });
            return Array.from(pool.angle.slice(0, 10));
        };
        expect(run(5)).toEqual(run(5));
        expect(run(5)).not.toEqual(run(6));
    });

    it('recycles the oldest when full', () => {
        const pool = createSparkPool(1);
        for (let i = 0; i < 70; i++) {
            spawnBurst(pool, { ...base, kind: 'bite', tick: i });
        }
        expect(pool.next).toBe((70 * 8) % SPARK_CAPACITY);
        expect(pool.startTick[(pool.next + 5) % SPARK_CAPACITY]).toBeLessThan(pool.startTick[pool.next - 1]);
    });
});

describe('createSparkLayer', () => {
    it('uploads the live sparks each frame', () => {
        const pool = createSparkPool(1);
        spawnBurst(pool, { ...base, kind: 'bite' });
        const layer = createSparkLayer({ pool });
        const camera = createCameraController({
            canvas: { width: 100, height: 100 },
            world: { width: 100, height: 100 },
        });
        layer.update?.(/** @type {any} */ ({ tick: 12, camera }));
        expect(layer.object.count).toBe(8);
        layer.dispose();
    });
});
