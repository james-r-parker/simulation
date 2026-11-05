// The ecological guards (hunter-learning.md T2b): prey extinctions counted per alive-to-none transition, and the boom-bust
// scan against hand-built series and a naive reference that searches each episode step by step from a boundary.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    BOOM_BUST_WINDOW,
    GUARD_DIRECTIONS,
    boomBustCount,
    createGuardScene,
    guardMetrics,
    sampleGuards,
} from '../../js/evo/scene-guards.js';

const CONFIG = { specialisations: { forager: {}, predator: {}, scout: {} } };
const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;

/**
 * A hand-built world: spec 0 and 2 are prey, spec 1 hunts.
 * @param {number} tick the tick
 * @param {number[]} specs the specialisation of each alive agent
 * @returns {Record<string, any>} the world
 */
function world(tick, specs) {
    const w = {
        tick,
        alive: new Uint8Array(16),
        spec: new Uint8Array(16),
        huntBySpec: new Float64Array([0, 1, 0]),
    };
    specs.forEach((spec, slot) => {
        w.alive[slot] = 1;
        w.spec[slot] = spec;
    });
    return w;
}

/**
 * The naive reference: searches each episode from a boundary, step by step, recomputing the trough and the peak from scratch.
 * @param {number[]} h the hunters at each checkpoint
 * @param {number[]} p the prey at each checkpoint
 * @returns {number} the episodes
 */
function naive(h, p) {
    const n = h.length;
    let count = 0;
    let b = 0;
    while (b < n) {
        if (h[b] === 0) {
            b += 1;
            continue;
        }
        let zero = h.indexOf(0, b);
        zero = zero < 0 ? n : zero;
        const troughAt = (/** @type {number} */ t) => {
            let at = b;
            for (let i = b; i <= t; i++) {
                at = h[i] <= h[at] ? i : at;
            }
            return at;
        };
        let boom = -1;
        for (let t = b + 1; t < zero && boom < 0; t++) {
            const tr = troughAt(t);
            boom = t > tr && h[t] >= 2 * h[tr] && p[tr] >= 1 ? t : -1;
        }
        if (boom < 0) {
            b = zero + 1;
            continue;
        }
        const tr = troughAt(boom);
        const last = Math.min(tr + BOOM_BUST_WINDOW, n - 1);
        let preyFall = -1;
        for (let t = boom + 1; t <= Math.min(last, zero - 1) && preyFall < 0; t++) {
            preyFall = p[t] <= 0.5 * p[tr] ? t : -1;
        }
        let crash = -1;
        for (let t = preyFall + 1; preyFall >= 0 && t <= last && crash < 0; t++) {
            crash = h[t] <= 0.5 * Math.max(...h.slice(boom, t)) ? t : -1;
        }
        if (crash >= 0) {
            count += 1;
            b = h[crash] === 0 ? crash + 1 : crash;
        } else {
            b = preyFall < 0 && zero <= last ? zero + 1 : tr + BOOM_BUST_WINDOW + 1;
        }
    }
    return count;
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

describe('prey extinctions', () => {
    it('are null with a reason before a checkpoint after burn-in, and sample nothing off the checkpoint grid or before burn-in', () => {
        const scene = createGuardScene(CONFIG);
        sampleGuards(scene, world(T + 500, [0, 1]));
        sampleGuards(scene, world(BURN_IN_TICKS - 1000, [0, 1]));
        const m = guardMetrics(scene);
        expect(m['eval.prey_extinctions']).toEqual({ value: null, reason: 'no 1000-tick checkpoint after burn-in' });
        expect(m['eval.boom_bust_count'].reason).toBe('no 1000-tick checkpoint after burn-in');
        expect(Object.keys(m).sort()).toEqual(Object.keys(GUARD_DIRECTIONS).sort());
    });

    it('count each alive-to-none transition of a prey specialisation, and again after it returns and goes', () => {
        const scene = createGuardScene(CONFIG);
        const series = [
            [0, 0, 2, 1], // first checkpoint: nothing to compare with
            [2, 1], // forager (0) gone: 1
            [0, 2, 1], // forager back
            [2, 1], // forager gone again: 2; scout (2) alive
            [1], // scout gone: 3
            [1, 1], // nobody returns; still gone
        ];
        series.forEach((specs, i) => sampleGuards(scene, world(T + i * 1000, specs)));
        expect(guardMetrics(scene)['eval.prey_extinctions']).toEqual({ value: 3 });
    });

    it('do not count the hunters, or a specialisation that was never alive', () => {
        const scene = createGuardScene(CONFIG);
        sampleGuards(scene, world(T, [0, 1]));
        sampleGuards(scene, world(T + 1000, [0]));
        expect(guardMetrics(scene)['eval.prey_extinctions']).toEqual({ value: 0 });
    });
});

describe('boomBustCount', () => {
    it('fires once on a hunter boom, then a prey fall, then a hunter crash', () => {
        const hunters = [4, 3, 5, 9, 10, 8, 5, 4];
        const prey = [100, 90, 100, 95, 80, 40, 30, 30];
        expect(boomBustCount(hunters, prey)).toBe(1);
    });

    it('fires twice on two episodes in a row', () => {
        const hunters = [4, 8, 8, 3, 4, 8, 8, 3];
        const prey = [100, 100, 40, 100, 100, 100, 40, 100];
        expect(boomBustCount(hunters, prey)).toBe(2);
    });

    it('does not fire on a flat series, a hunter boom the prey ignore, or a prey fall the hunters ignore', () => {
        expect(boomBustCount([5, 5, 5, 5, 5], [50, 50, 50, 50, 50])).toBe(0);
        expect(boomBustCount([2, 4, 8, 4, 2], [100, 100, 100, 100, 100])).toBe(0);
        expect(boomBustCount([4, 4, 4, 4, 4], [100, 50, 30, 20, 10])).toBe(0);
    });

    it('does not fire when the crash comes after the window, or when the steps share a checkpoint', () => {
        const hunters = [2, 4, ...new Array(BOOM_BUST_WINDOW).fill(4), 1];
        const prey = [100, 100, ...new Array(BOOM_BUST_WINDOW).fill(100), 100];
        prey[3] = 10;
        expect(boomBustCount(hunters, prey)).toBe(0);
        expect(boomBustCount([2, 4, 1], [100, 40, 40])).toBe(0);
    });

    it('starts again from nothing when the hunters die out, and needs a trough and prey to start', () => {
        expect(boomBustCount([4, 8, 0, 8, 4], [100, 100, 10, 10, 5])).toBe(0);
        expect(boomBustCount([4, 8, 6, 3], [0, 0, 0, 0])).toBe(0);
        expect(boomBustCount([4, 8, 6, 0], [100, 100, 40, 40])).toBe(1);
    });

    it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
        'matches the naive reference on a random series (seed %i)',
        (seed) => {
            const next = lcg(seed);
            const n = 30 + Math.floor(next() * 60);
            const hunters = Array.from({ length: n }, () => (next() < 0.05 ? 0 : 1 + Math.floor(next() * 12)));
            const prey = Array.from({ length: n }, () => Math.floor(next() * 120));
            expect(boomBustCount(hunters, prey)).toBe(naive(hunters, prey));
        },
    );
});

describe('the guard metrics', () => {
    it('read the boom-bust count off the sampled series', () => {
        const scene = createGuardScene(CONFIG);
        const hunters = [4, 3, 5, 9, 10, 8, 5, 4];
        const prey = [100, 90, 100, 95, 80, 40, 30, 30];
        hunters.forEach((h, i) => {
            sampleGuards(
                scene,
                world(T + i * 1000, [...new Array(h).fill(1), ...new Array(Math.ceil(prey[i] / 20)).fill(0)]),
            );
        });
        expect(guardMetrics(scene)['eval.boom_bust_count']).toEqual({ value: 1 });
    });

    it('are lower metrics', () => {
        expect(GUARD_DIRECTIONS).toEqual({ 'eval.prey_extinctions': 'lower', 'eval.boom_bust_count': 'lower' });
    });
});
