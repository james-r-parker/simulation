import { describe, expect, it } from 'vitest';
import { createHerdTrack, trackHerds } from '../../../js/app/renderer/herd-track.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const RULES = { runSpeed: 6.5, radius: 80 };

/**
 * @param {number} tick the tick
 * @param {number[][]} herds `[x, y, slot, speed, heading, group]` rows
 * @returns {ReturnType<typeof makeSnapshot>} a snapshot holding only herds
 */
const snap = (tick, herds) => makeSnapshot(tick, [], { herds });

describe('trackHerds', () => {
    it('blends a matched animal at alpha, by slot even when the record order changes', () => {
        const track = createHerdTrack(8);
        const prev = snap(10, [
            [0, 0, 3, 0.2, 0, 1],
            [100, 100, 5, 0, 0, 2],
        ]);
        const next = snap(12, [
            [104, 100, 5, 0.4, 0, 2],
            [10, 0, 3, 0.6, 0, 1],
        ]);
        expect(trackHerds(prev, next, 0.25, { track, ...RULES })).toBe(2);
        expect(track.x[0]).toBeCloseTo(101);
        expect(track.slot[0]).toBe(5);
        expect(track.x[1]).toBeCloseTo(2.5);
        expect(track.speed[1]).toBeCloseTo(0.3);
        expect(track.group[1]).toBe(1);
    });

    it('takes the shorter arc for the heading', () => {
        const track = createHerdTrack(2);
        trackHerds(snap(1, [[0, 0, 0, 0, 3.1, 0]]), snap(2, [[0, 0, 0, 0, -3.1, 0]]), 0.5, { track, ...RULES });
        expect(Math.abs(Math.abs(track.heading[0]) - Math.PI)).toBeLessThan(1e-5);
    });

    it('does not blend a slot reused by a calf far from the dead animal', () => {
        const track = createHerdTrack(2);
        trackHerds(snap(1, [[0, 0, 1, 0, 0, 0]]), snap(2, [[500, 0, 1, 0, 0, 0]]), 0.5, { track, ...RULES });
        expect(track.x[0]).toBe(500);
    });

    it('drops a dead animal and places a newborn at its newest position', () => {
        const track = createHerdTrack(4);
        trackHerds(snap(1, [[0, 0, 0, 0, 0, 0]]), snap(2, [[50, 50, 2, 0, 0, 0]]), 0.5, { track, ...RULES });
        expect(track.count).toBe(1);
        expect(track.x[0]).toBe(50);
        expect(Array.from(track.previous)).toEqual([0, 0, 0, 0]);
    });

    it('draws the newest snapshot alone when there is no older one, and allocates nothing', () => {
        const track = createHerdTrack(2);
        const next = snap(2, [[7, 8, 0, 0, 0, 0]]);
        const x = track.x;
        trackHerds(null, next, 0.5, { track, ...RULES });
        trackHerds(null, next, 0.5, { track, ...RULES });
        expect(track.x).toBe(x);
        expect(track.x[0]).toBe(7);
    });

    it('caps the count at capacity', () => {
        const track = createHerdTrack(1);
        const next = snap(2, [
            [1, 0, 0, 0, 0, 0],
            [2, 0, 1, 0, 0, 0],
        ]);
        expect(trackHerds(null, next, 1, { track, ...RULES })).toBe(1);
    });
});
