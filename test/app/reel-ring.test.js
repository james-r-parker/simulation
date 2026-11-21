import { describe, expect, it } from 'vitest';
import {
    createRing,
    density,
    DENSITY_TICKS,
    newest,
    pushSample,
    RING_SAMPLES,
    SAMPLE_MS,
} from '../../js/app/reel-ring.js';

/** @param {number} nowMs the time @param {number} x the camera x @returns {any} a view */
const view = (nowMs, x) => ({ nowMs, x, y: 2, zoom: 3, followId: 4 });

describe('the reel ring', () => {
    it('writes a sample every 100 ms and no more often', () => {
        const ring = createRing();
        pushSample(ring, view(0, 1));
        pushSample(ring, view(SAMPLE_MS - 1, 2));
        expect(ring.n).toBe(1);
        pushSample(ring, view(SAMPLE_MS, 3));
        expect(ring.n).toBe(2);
        expect(newest(ring)).toEqual({ x: 3, y: 2, zoom: 3, followId: 4 });
    });

    it('holds 12 s and then overwrites the oldest', () => {
        const ring = createRing();
        for (let i = 0; i < RING_SAMPLES + 5; i++) {
            pushSample(ring, view(i * SAMPLE_MS, i));
        }
        expect(ring.n).toBe(RING_SAMPLES + 5);
        expect(newest(ring).x).toBe(RING_SAMPLES + 4);
        expect(ring.view[0]).toBe(RING_SAMPLES);
    });
});

describe('the density of a scene', () => {
    it('counts the instances within 10 s of ticks up to a tick, and ignores empty slots and later ones', () => {
        const recent = new Int32Array(8).fill(-1);
        recent.set([100, 400, 700, 900]);
        expect(density(recent, 500)).toBe(2);
        expect(density(recent, 700)).toBe(2);
        expect(density(recent, 1000)).toBe(2);
        expect(density(recent, 100 + DENSITY_TICKS - 1)).toBe(2);
        expect(density(recent, 50)).toBe(0);
    });
});
