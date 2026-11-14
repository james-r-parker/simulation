import { describe, expect, it } from 'vitest';
import { CURVE, FX_CURVES, FX_MOTIONS, FX_SHAPES } from '../../../js/app/renderer/fx-curves.js';
import { createFxPack, motionAt, packFx } from '../../../js/app/renderer/fx-pack.js';
import { createFxPool, spawnFx } from '../../../js/app/renderer/fx-ring.js';

const VIEW = { tick: 105, zoom: 1, callBoost: 1, contrast: 1 };

/** @param {number} curve a curve index @param {Record<string, number>} [over] overrides @returns {any} a record */
function rec(curve, over = {}) {
    return {
        x: 10,
        y: 20,
        angle: 0,
        size: 4,
        r: 1,
        g: 0.5,
        b: 0.2,
        gain: 1,
        tick: 100,
        life: 10,
        curve,
        seed: 0,
        reach: 30,
        stretch: 1,
        minPx: 2,
        ...over,
    };
}

describe('packFx', () => {
    it('packs a live instance into its shape bucket and skips dead ones', () => {
        const pool = createFxPool();
        spawnFx(pool, rec(CURVE.streak));
        spawnFx(pool, rec(CURVE.streak, { tick: 0, life: 5 }));
        const pack = createFxPack(64);
        expect(packFx(pool, pack, VIEW)).toBe(1);
        const b = pack.buckets[FX_SHAPES.indexOf('STREAK')];
        expect(b.count).toBe(1);
        expect(b.pose[0]).toBeGreaterThan(10);
        expect(b.neon[0]).toBeLessThanOrEqual(1);
    });

    it('routes the flash curve to the glow bucket', () => {
        const pool = createFxPool();
        spawnFx(pool, rec(CURVE.flash));
        const pack = createFxPack(64);
        packFx(pool, pack, VIEW);
        expect(pack.glow.count).toBe(1);
        expect(pack.buckets.every((b) => b.count === 0)).toBe(true);
    });

    it('keeps a tiny instance at least half its least px across and stretches along the heading', () => {
        const pool = createFxPool();
        spawnFx(pool, rec(CURVE.crescent, { size: 0.001, minPx: 8, stretch: 3 }));
        const pack = createFxPack(64);
        packFx(pool, pack, { ...VIEW, zoom: 2 });
        const b = pack.buckets[FX_SHAPES.indexOf('CRESCENT')];
        expect(b.pose[3]).toBeCloseTo(2);
        expect(b.rig0[3]).toBe(3);
    });

    it('packs nothing before the first spawn', () => {
        expect(packFx(createFxPool(), createFxPack(4), VIEW)).toBe(0);
    });

    it('has a shape model bucket for every curve', () => {
        for (const c of FX_CURVES) {
            expect(FX_SHAPES).toContain(c.shape);
        }
    });
});

describe('motionAt', () => {
    const at = { t: 0.5, angle: 0, reach: 10, seed: 0 };
    it('moves out, in, rises and falls as the old shader did', () => {
        expect(motionAt(FX_MOTIONS.indexOf('fixed'), at)).toEqual({ x: 0, y: 0 });
        expect(motionAt(FX_MOTIONS.indexOf('out'), at).x).toBeCloseTo(5);
        expect(motionAt(FX_MOTIONS.indexOf('in'), { ...at, t: 0.2 }).x).toBeCloseTo(8);
        expect(motionAt(FX_MOTIONS.indexOf('rise'), at).y).toBeCloseTo(5);
        expect(motionAt(FX_MOTIONS.indexOf('fall'), at).y).toBeCloseTo(-5);
        const orbit = motionAt(FX_MOTIONS.indexOf('orbit'), at);
        expect(Math.hypot(orbit.x, orbit.y)).toBeCloseTo(5);
    });
});
