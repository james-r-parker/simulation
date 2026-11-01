import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { easeOut } from '../../../js/app/renderer/curves.js';
import {
    createRingLayer,
    createRingPool,
    packRings,
    RING_CAPACITY,
    ringAt,
    spawnRing,
} from '../../../js/app/renderer/rings.js';

const ring = (/** @type {number} */ tick, /** @type {any} */ extra = {}) => ({
    kind: /** @type {'alarm'} */ ('alarm'),
    x: 5,
    y: 6,
    tick,
    radius: 300,
    life: 40,
    rgb: [1, 0.5, 0.25],
    ...extra,
});

describe('ringAt', () => {
    it('alarm: radius eases out, alpha 0.35 x (1 - age)^2, 1.5 px', () => {
        const r = ringAt('alarm', 0.5, 300);
        expect(r.radius).toBeCloseTo(300 * easeOut(0.5));
        expect(r.alpha).toBeCloseTo(0.35 * 0.25);
        expect(r.width).toBe(1.5);
        expect(ringAt('alarm', 0, 300).alpha).toBe(0.35);
        expect(ringAt('alarm', 1, 300).alpha).toBe(0);
    });

    it('hunt: three pulses of 0.25 to 0.6 of the radius, 2 px', () => {
        expect(ringAt('hunt', 0, 300).radius).toBeCloseTo(75);
        expect(ringAt('hunt', 1 / 6, 300).radius).toBeCloseTo(300 * (0.25 + 0.35 * 0.5));
        expect(ringAt('hunt', 1 / 3 - 1e-9, 300).radius).toBeCloseTo(300 * 0.6, 3);
        expect(ringAt('hunt', 1 / 3 + 1e-9, 300).radius).toBeCloseTo(75, 3);
        const r = ringAt('hunt', 0.25, 300);
        expect(r.alpha).toBeCloseTo(0.35 * 0.75 * (0.6 + 0.4 * Math.sin(1.5 * Math.PI)));
        expect(r.width).toBe(2);
    });

    it('birth: a soft expanding ring', () => {
        expect(ringAt('birth', 0, 70).alpha).toBe(0.5);
        expect(ringAt('birth', 1, 70).radius).toBe(70);
    });
});

describe('ring pool', () => {
    it('recycles the oldest ring when full', () => {
        const pool = createRingPool();
        for (let i = 0; i < RING_CAPACITY + 3; i++) {
            spawnRing(pool, ring(i * 100, { x: i }));
        }
        expect(pool.x[0]).toBe(RING_CAPACITY);
        expect(pool.x[2]).toBe(RING_CAPACITY + 2);
        expect(pool.x[3]).toBe(3);
        expect(pool.next).toBe(3);
    });

    it('packs only rings that are alive at the tick, and boosts calls but not births', () => {
        const pool = createRingPool();
        spawnRing(pool, ring(100));
        spawnRing(pool, ring(100, { kind: 'birth', life: 30, radius: 70 }));
        spawnRing(pool, ring(500));
        const out = { ring: new Float32Array(RING_CAPACITY * 4), color: new Float32Array(RING_CAPACITY * 4) };
        expect(packRings(pool, 99, out)).toBe(0);
        expect(packRings(pool, 120, out)).toBe(2);
        const call = out.color[3];
        const birth = out.color[7];
        expect(packRings(pool, 120, out, 1 / 0.35)).toBe(2);
        expect(out.color[3]).toBeCloseTo(call / 0.35);
        expect(out.color[7]).toBeCloseTo(birth);
        expect(packRings(pool, 140, out)).toBe(0);
        expect(Array.from(out.ring.slice(0, 2))).toEqual([5, 6]);
    });

    it('freezes while the tick holds still (a paused sim)', () => {
        const pool = createRingPool();
        spawnRing(pool, ring(100));
        const out = { ring: new Float32Array(RING_CAPACITY * 4), color: new Float32Array(RING_CAPACITY * 4) };
        packRings(pool, 110, out);
        const first = Array.from(out.ring.slice(0, 4));
        packRings(pool, 110, out);
        expect(Array.from(out.ring.slice(0, 4))).toEqual(first);
    });
});

describe('createRingLayer', () => {
    it('clears pollen rings when flora is disabled without touching other rings', () => {
        const pool = createRingPool();
        spawnRing(pool, ring(0, { kind: 'pollen' }));
        spawnRing(pool, ring(0, { kind: 'birth' }));
        const layer = createRingLayer({ pool });
        layer.setLook?.({ flora: 0 });
        expect(pool.startTick[0]).toBe(0);
        layer.setLook?.({ flora: -1 });
        expect(pool.startTick[0]).toBe(-Infinity);
        expect(pool.startTick[1]).toBe(0);
        layer.dispose();
    });

    it('uploads the live rings each frame', () => {
        const pool = createRingPool();
        spawnRing(pool, ring(0));
        const layer = createRingLayer({ pool });
        const camera = createCameraController({
            canvas: { width: 100, height: 100 },
            world: { width: 100, height: 100 },
        });
        layer.update?.(/** @type {any} */ ({ tick: 10, camera, lenses: { calls: false } }));
        expect(layer.object.count).toBe(1);
        layer.update?.(/** @type {any} */ ({ tick: 10, camera, lenses: { calls: true } }));
        layer.update?.(/** @type {any} */ ({ tick: 100, camera, lenses: { calls: false } }));
        expect(layer.object.count).toBe(0);
        layer.dispose();
    });
});
