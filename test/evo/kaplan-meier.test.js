// The Kaplan-Meier median and restricted mean against a naive reference that recomputes the curve at every integer tick,
// on hand-built lists and on seeded random ones.

import { describe, expect, it } from 'vitest';
import { kaplanMeier } from '../../js/evo/kaplan-meier.js';

/**
 * The naive reference for integer times: the curve at tick `k` is the product, over every event time `u <= k`, of one minus
 * the events at `u` over the observations with time at least `u`; the restricted mean sums the curve over ticks `0..H-1`.
 * @param {number[]} times the observation times, integers
 * @param {number[]} events 1 for an event, 0 for a censoring
 * @param {number} horizon an integer horizon
 * @returns {{median: number | null, rmst: number}} the median and restricted mean
 */
function naive(times, events, horizon) {
    const curve = (/** @type {number} */ k) => {
        let s = 1;
        for (let u = 0; u <= k; u++) {
            const d = times.filter((t, i) => t === u && events[i] === 1).length;
            const n = times.filter((t) => t >= u).length;
            s *= d > 0 ? 1 - d / n : 1;
        }
        return s;
    };
    const maxTime = Math.max(0, ...times);
    let median = null;
    for (let k = 0; k <= maxTime && median === null; k++) {
        median = curve(k) <= 0.5 ? k : null;
    }
    let rmst = 0;
    for (let k = 0; k < horizon; k++) {
        rmst += curve(k);
    }
    return { median, rmst: times.length === 0 ? 0 : rmst };
}

/**
 * @param {number} seed a seed
 * @returns {() => number} a deterministic generator of numbers in [0, 1)
 */
function lcg(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

describe('kaplanMeier', () => {
    it('gives the textbook curve for a small list with a censoring', () => {
        // times 2 (event), 3 (censored), 4 (event), 4 (event), 6 (censored): S = 0.8 at 2, 0.8 x (1 - 2/3) = 0.2667 at 4
        const km = kaplanMeier([2, 3, 4, 4, 6], [1, 0, 1, 1, 0], 6);
        expect(km.median).toBe(4);
        expect(km.rmst).toBeCloseTo(2 * 1 + 2 * 0.8 + 2 * (0.8 / 3), 12);
    });

    it('has no median while the curve stays above one half, and counts every observation in the area', () => {
        const km = kaplanMeier([10, 20, 30, 40, 50], [1, 0, 0, 0, 0], 100);
        expect(km.median).toBeNull();
        expect(km.rmst).toBeCloseTo(10 + 90 * 0.8, 12);
    });

    it('is all censored: the curve is 1 and the area is the horizon', () => {
        const km = kaplanMeier([5, 9], [0, 0], 40);
        expect(km).toEqual({ median: null, rmst: 40 });
    });

    it('keeps an observation censored at an event time at risk at that time', () => {
        const km = kaplanMeier([5, 5], [1, 0], 10);
        expect(km.median).toBe(5);
        expect(km.rmst).toBeCloseTo(5 + 5 * 0.5, 12);
    });

    it('stops the area at the horizon but still finds a median beyond it', () => {
        const km = kaplanMeier([100, 200], [1, 1], 50);
        expect(km.rmst).toBe(50);
        expect(km.median).toBe(100);
    });

    it('is empty with no observation', () => {
        expect(kaplanMeier([], [], 10)).toEqual({ median: null, rmst: 0 });
    });

    it('throws when the lists differ in length', () => {
        expect(() => kaplanMeier([1, 2], [1], 5)).toThrow(/2 times but 1 events/);
    });

    it.each([1, 2, 3, 4, 5, 6])('matches the naive reference on a random list (seed %i)', (seed) => {
        const next = lcg(seed);
        const n = 5 + Math.floor(next() * 40);
        const times = Array.from({ length: n }, () => 1 + Math.floor(next() * 60));
        const events = times.map(() => (next() < 0.45 ? 1 : 0));
        const horizon = 10 + Math.floor(next() * 50);
        const expected = naive(times, events, horizon);
        const km = kaplanMeier(times, events, horizon);
        expect(km.median).toBe(expected.median);
        expect(km.rmst).toBeCloseTo(expected.rmst, 9);
    });
});
