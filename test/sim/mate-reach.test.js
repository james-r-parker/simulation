import { describe, expect, it } from 'vitest';
import { findMale, mateReach } from '../../js/sim/mate-search.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';
import { referenceFindMate } from './helpers/mate-search-reference.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };
const ROAM = { mateRange: 100, mateRoamTicks: 1000, mateRoamMax: 900 };

/**
 * A world with a ready female at (500, 500) and a ready male `gap` pixels to her right (centres), sizes 25.
 * @param {number} gap the distance between centres
 * @param {Record<string, any>} [over] config overrides
 * @returns {any}
 */
function pairAt(gap, over = {}) {
    const w = lifeWorld({ maxAgents: 64, ...ROAM, ...over });
    for (const [x, sex] of [
        [500, 0],
        [500 + gap, 1],
    ]) {
        const s = addBlob(w, { ...MATE, sex });
        w.x[s] = x;
        w.y[s] = 500;
        w.size[s] = 25;
    }
    buildHash(w.hash, w);
    return w;
}

describe('mateReach', () => {
    it('is mateRange before the stretch, grows linearly after it, caps and resets when a mate is seen', () => {
        const w = pairAt(100);
        w.mateSeenAt[0] = 0;
        w.tick = 1000;
        expect(mateReach(w, 0)).toBe(100);
        w.tick = 1500;
        expect(mateReach(w, 0)).toBe(100 + 450);
        w.tick = 2000;
        expect(mateReach(w, 0)).toBe(1000);
        w.tick = 9000;
        expect(mateReach(w, 0)).toBe(1000);
        w.mateSeenAt[0] = 9000;
        expect(mateReach(w, 0)).toBe(100);
    });

    it('is exactly mateRange at every age when mateRoamTicks is 0', () => {
        const w = pairAt(100, { mateRoamTicks: 0 });
        for (const tick of [0, 1, 5000, 1e6]) {
            w.tick = tick;
            expect(mateReach(w, 0)).toBe(100);
        }
    });
});

describe('findMale with a roaming range', () => {
    it('finds a male 800 away only once the search has roamed far enough, and not when it is off', () => {
        const w = pairAt(800);
        w.mateSeenAt[0] = 0;
        w.tick = 500;
        expect(findMale(w, 0, 1)).toBe(-1);
        w.tick = 2000;
        expect(findMale(w, 0, 1)).toBe(1);
        w.mateSeenAt[0] = w.tick;
        expect(findMale(w, 0, 1)).toBe(-1);
        const off = pairAt(800, { mateRoamTicks: 0 });
        off.tick = 1e6;
        expect(findMale(off, 0, 1)).toBe(-1);
    });

    it('covers the grown range with the cell scan, across many cells', () => {
        const w = pairAt(900);
        w.mateSeenAt[0] = 0;
        w.tick = 5000;
        expect(findMale(w, 0, 1)).toBe(1);
    });

    it('agrees with the O(n^2) reference over 100 seeded worlds at mixed ages', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const rng = createRng(seed);
            const count = 2 + Math.floor(nextFloat(rng) * 30);
            const w = lifeWorld({ maxAgents: 64, seed, ...ROAM });
            for (let i = 0; i < count; i++) {
                const s = addBlob(w, { ...MATE, sex: nextFloat(rng) < 0.5 ? 0 : 1 });
                w.x[s] = nextFloat(rng) * 3000;
                w.y[s] = nextFloat(rng) * 2000;
                w.size[s] = 25;
                w.mateRank[s] = Math.floor(nextFloat(rng) * 4) / 4;
                w.mateSeenAt[s] = Math.floor(nextFloat(rng) * 2000);
            }
            w.tick = Math.floor(nextFloat(rng) * 4000);
            buildHash(w.hash, w);
            for (let a = 0; a < count; a++) {
                if (w.sex[a] === 0) {
                    const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
                    const own = w.config;
                    // The reference reads config.mateRange, so give it this searcher's reach.
                    w.config = { ...own, mateRange: mateReach(w, a) };
                    const expected = referenceFindMate(w, a, 1, ref);
                    w.config = own;
                    expect(findMale(w, a, 1)).toBe(expected);
                }
            }
        }
    });
});
