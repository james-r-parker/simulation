import { describe, expect, it } from 'vitest';
import { findMale } from '../../js/sim/mate-search.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';
import { referenceFindMate } from './helpers/mate-search-reference.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };

/**
 * A sexes-on world with agents of size 25, all ready, with the hash built.
 * @param {{ x: number, y: number, sex: number, energy?: number }[]} agents the agents
 * @param {Record<string, any>} [over] config overrides
 * @returns {any}
 */
function placed(agents, over = {}) {
    const w = lifeWorld({ maxAgents: 64, mateRange: 100, sexesEnabled: true, ...over });
    for (const { x, y, sex, energy } of agents) {
        const s = addBlob(w, { ...MATE, energy: energy ?? MATE.energy, sex });
        w.x[s] = x;
        w.y[s] = y;
        w.size[s] = 25;
    }
    buildHash(w.hash, w);
    return w;
}

/**
 * @param {any} w the world
 * @returns {number[]} the lifecycle stream state
 */
function lifecycleState(w) {
    return Array.from(w.rng.lifecycle.s);
}

describe('findMale', () => {
    it('chooses the male with the most energy, whatever his slot', () => {
        const w = placed([
            { x: 500, y: 500, sex: 0 },
            { x: 520, y: 500, sex: 1, energy: 600 },
            { x: 540, y: 500, sex: 1, energy: 900 },
            { x: 560, y: 500, sex: 1, energy: 800 },
        ]);
        expect(findMale(w, 0, 1)).toBe(2);
    });

    it('breaks an energy tie toward the lower slot', () => {
        const w = placed([
            { x: 500, y: 500, sex: 0 },
            { x: 560, y: 500, sex: 1 },
            { x: 520, y: 500, sex: 1 },
        ]);
        expect(findMale(w, 0, 1)).toBe(1);
    });

    it('can choose a male with a lower slot than the female', () => {
        const w = placed([
            { x: 520, y: 500, sex: 1 },
            { x: 500, y: 500, sex: 0 },
        ]);
        expect(findMale(w, 1, 1)).toBe(0);
    });

    it('ignores females, males out of range and males of another specialisation', () => {
        const w = placed([
            { x: 500, y: 500, sex: 0 },
            { x: 520, y: 500, sex: 0, energy: 990 },
            { x: 900, y: 500, sex: 1, energy: 990 },
            { x: 540, y: 500, sex: 1, energy: 990 },
            { x: 530, y: 500, sex: 1, energy: 700 },
        ]);
        w.spec[3] = 1;
        expect(findMale(w, 0, 1)).toBe(4);
    });

    it('draws once when there is a male, and not at all without one', () => {
        const w = placed([
            { x: 500, y: 500, sex: 0 },
            { x: 520, y: 500, sex: 1 },
        ]);
        const ref = { seed: 0, s: Uint32Array.from(lifecycleState(w)) };
        nextFloat(ref);
        expect(findMale(w, 0, 0)).toBe(-1);
        expect(lifecycleState(w)).toEqual(Array.from(ref.s));
        const lone = placed([{ x: 500, y: 500, sex: 0 }]);
        const start = lifecycleState(lone);
        expect(findMale(lone, 0, 1)).toBe(-1);
        expect(lifecycleState(lone)).toEqual(start);
    });
});

describe('findMale against an O(n^2) reference', () => {
    it('agrees with the reference over 150 seeded random worlds', () => {
        for (let seed = 1; seed <= 150; seed++) {
            const rng = createRng(seed);
            const count = 2 + Math.floor(nextFloat(rng) * 40);
            const agents = [];
            for (let i = 0; i < count; i++) {
                agents.push({
                    x: nextFloat(rng) * 1000,
                    y: nextFloat(rng) * 1000,
                    sex: nextFloat(rng) < 0.5 ? 0 : 1,
                    energy: 300 + Math.floor(nextFloat(rng) * 4) * 100,
                });
            }
            const range = [0, 30, 100, 300][Math.floor(nextFloat(rng) * 4)];
            const w = placed(agents, { mateRange: range, seed });
            for (let s = 0; s < count; s++) {
                w.size[s] = 25 * (1 + 0.1 * nextFloat(rng));
                w.alive[s] = nextFloat(rng) < 0.1 ? 0 : 1;
            }
            buildHash(w.hash, w);
            const chance = nextFloat(rng);
            for (let a = 0; a < count; a++) {
                if (w.alive[a] === 1 && w.sex[a] === 0) {
                    const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
                    const expected = referenceFindMate(w, a, chance, ref);
                    expect(findMale(w, a, chance)).toBe(expected);
                    expect(lifecycleState(w)).toEqual(Array.from(ref.s));
                }
            }
        }
    });
});
