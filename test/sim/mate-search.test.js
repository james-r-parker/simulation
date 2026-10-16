import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { findMate } from '../../js/sim/mate-search.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';
import { referenceFindMate } from './helpers/mate-search-reference.js';

const MATE = { mateOut: 1, energy: 700, spec: 2 };

/**
 * A world with agents of size 25 at the given positions, all ready, with the hash built.
 * @param {number[][]} points `[x, y]` pairs
 * @param {Record<string, any>} [over] config overrides
 * @returns {any}
 */
function placed(points, over = {}) {
    const w = lifeWorld({ maxAgents: 64, mateRange: 100, ...over });
    for (const [x, y] of points) {
        const s = addBlob(w, MATE);
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

/**
 * @param {any} w the world
 * @returns {number[]} the state after one lifecycle draw
 */
function afterOneDraw(w) {
    const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
    nextFloat(ref);
    return Array.from(ref.s);
}

describe('findMate range', () => {
    it('finds a partner inside mateRange and not outside it', () => {
        expect(
            findMate(
                placed([
                    [500, 500],
                    [649, 500],
                ]),
                0,
                1,
            ),
        ).toBe(1);
        expect(
            findMate(
                placed([
                    [500, 500],
                    [651, 500],
                ]),
                0,
                1,
            ),
        ).toBe(-1);
    });

    it('finds a partner across a cell edge once, drawing once', () => {
        const w = placed(
            [
                [127, 500],
                [129, 500],
            ],
            { mateRange: 0 },
        );
        expect(findMate(w, 0, 0)).toBe(-1);
        expect(lifecycleState(w)).toEqual(
            afterOneDraw(
                placed(
                    [
                        [127, 500],
                        [129, 500],
                    ],
                    { mateRange: 0 },
                ),
            ),
        );
    });

    it('finds a body spanning many cells in one cell only', () => {
        const w = placed(
            [
                [500, 500],
                [500, 700],
            ],
            { mateRange: 60 },
        );
        w.size[0] = 120;
        w.size[1] = 120;
        buildHash(w.hash, w);
        const before = afterOneDraw(w);
        expect(findMate(w, 0, 0)).toBe(-1);
        expect(lifecycleState(w)).toEqual(before);
    });

    it('treats mateRange 0 as the contact test', () => {
        const w = placed(
            [
                [500, 500],
                [549.99, 500],
            ],
            { mateRange: 0 },
        );
        expect(findMate(w, 0, 1)).toBe(1);
        const edge = placed(
            [
                [500, 500],
                [550, 500],
            ],
            { mateRange: 0 },
        );
        expect(findMate(edge, 0, 1)).toBe(-1);
    });
});

describe('findMate candidates', () => {
    it('never returns a lower slot or a dead slot', () => {
        const w = placed([
            [500, 500],
            [520, 500],
            [540, 500],
        ]);
        expect(findMate(w, 1, 1)).toBe(2);
        expect(findMate(w, 2, 1)).toBe(-1);
        w.alive[1] = 0;
        expect(findMate(w, 0, 1)).toBe(2);
    });

    it('takes the first partner in cell then entry order, not the nearest', () => {
        const w = placed([
            [500, 500],
            [560, 500],
            [520, 500],
        ]);
        expect(findMate(w, 0, 1)).toBe(2);
    });

    it('moves on to the next candidate when the draw fails, drawing for each', () => {
        const w = placed([
            [500, 500],
            [520, 500],
            [540, 500],
        ]);
        const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
        const first = nextFloat(ref);
        const second = nextFloat(ref);
        const chance = (first + second) / 2;
        const expected = first < chance ? 1 : second < chance ? 2 : -1;
        expect(findMate(w, 0, chance)).toBe(expected);
    });

    it.each([
        ['a different specialisation', (/** @type {any} */ w) => (w.spec[1] = 3)],
        ['a partner on cooldown', (/** @type {any} */ w) => (w.cooldown[1] = 1)],
        ['a partner with low energy', (/** @type {any} */ w) => (w.energy[1] = 200)],
        ['a partner that does not want to', (/** @type {any} */ w) => w.outputs.fill(0)],
        ['a much bigger partner', (/** @type {any} */ w) => (w.size[1] = 2 * w.size[0] + 1)],
    ])('rejects %s without a draw', (_name, tweak) => {
        const w = placed([
            [500, 500],
            [520, 500],
        ]);
        tweak(w);
        const before = lifecycleState(w);
        expect(findMate(w, 0, 1)).toBe(-1);
        expect(lifecycleState(w)).toEqual(before);
    });

    it('ignores food in the hash', () => {
        const w = placed([[500, 500]]);
        w.foodAlive[0] = 1;
        w.foodX[0] = 510;
        w.foodY[0] = 500;
        w.foodRadius[0] = 5;
        buildHash(w.hash, w);
        expect(findMate(w, 0, 1)).toBe(-1);
    });
});

describe('findMate against an O(n^2) reference', () => {
    it('agrees with the greedy rule over 200 seeded random worlds', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const rng = createRng(seed);
            const range = [0, 30, 100, 300][Math.floor(nextFloat(rng) * 4)];
            const count = 2 + Math.floor(nextFloat(rng) * 40);
            const points = [];
            for (let i = 0; i < count; i++) {
                const edge = nextFloat(rng) < 0.15;
                points.push([edge ? 0 : nextFloat(rng) * 1000, edge ? 1000 : nextFloat(rng) * 1000]);
            }
            const w = placed(points, { mateRange: range, seed });
            const base = 20 + nextFloat(rng) * 100;
            for (let s = 0; s < count; s++) {
                w.size[s] = base * (1 + 0.1 * nextFloat(rng));
                w.alive[s] = nextFloat(rng) < 0.1 ? 0 : 1;
            }
            buildHash(w.hash, w);
            const chance = nextFloat(rng);
            for (let a = 0; a < count; a++) {
                if (w.alive[a] === 1) {
                    const ref = { seed: 0, s: Uint32Array.from(w.rng.lifecycle.s) };
                    const expected = referenceFindMate(w, a, chance, ref);
                    expect(findMate(w, a, chance)).toBe(expected);
                    expect(lifecycleState(w)).toEqual(Array.from(ref.s));
                }
            }
        }
    });
});

describe('findMate allocation', () => {
    it('allocates nothing over many calls', () => {
        v8.setFlagsFromString('--expose-gc');
        const gc = vm.runInNewContext('gc');
        const points = [];
        for (let i = 0; i < 40; i++) {
            points.push([300 + (i % 8) * 40, 300 + Math.floor(i / 8) * 40]);
        }
        const w = placed(points);
        const run = () => {
            for (let i = 0; i < 20000; i++) {
                findMate(w, i % 40, 0);
            }
        };
        run();
        gc();
        const before = process.memoryUsage().heapUsed;
        run();
        gc();
        expect(process.memoryUsage().heapUsed - before).toBeLessThan(256 * 1024);
    });
});
