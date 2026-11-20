import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { episodeSeed } from '../../js/evo/trainer.js';
import { createRng, nextInt } from '../../js/sim/rng.js';

const train = JSON.parse(readFileSync('evals/train-seeds.json', 'utf8'));
const evals = JSON.parse(readFileSync('evals/seeds.json', 'utf8'));

/** SHA-256 of `JSON.stringify` of the first 256 seeds as committed before the list grew (training-loop.md T24). */
const FIRST_256_HASH = '35c40298ef01afa916672a2f7092f560572653c0de1dc72a96e318010b0eae6f';

describe('evals/train-seeds.json', () => {
    it('holds 512 distinct seeds, none in evals/seeds.json', () => {
        expect(train).toHaveLength(512);
        expect(new Set(train).size).toBe(512);
        expect(train.filter((/** @type {number} */ s) => evals.includes(s))).toEqual([]);
    });

    it('keeps the first 256 entries byte-identical, so every old offset replays unchanged', () => {
        const hash = createHash('sha256')
            .update(JSON.stringify(train.slice(0, 256)))
            .digest('hex');
        expect(hash).toBe(FIRST_256_HASH);
        const old = train.slice(0, 256);
        for (const offset of [0, 8, 120]) {
            for (const [generation, episode] of [
                [0, 0],
                [1, 5],
                [2, 31],
            ]) {
                const at = { generation, episodes: 32, episode, offset };
                expect(episodeSeed(train, at)).toBe(episodeSeed(old, at));
            }
        }
    });

    it('appends 256 seeds drawn from createRng(20261120), skipping repeats and eval seeds', () => {
        const taken = new Set([...train.slice(0, 256), ...evals]);
        const rng = createRng(20261120);
        const derived = [];
        while (derived.length < 256) {
            const seed = nextInt(rng, 1_000_000);
            if (!taken.has(seed)) {
                taken.add(seed);
                derived.push(seed);
            }
        }
        expect(train.slice(256)).toEqual(derived);
    });
});
