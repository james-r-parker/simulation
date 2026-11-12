import { describe, expect, it } from 'vitest';
import { paired, rank, renderRank } from '../scripts/heat-rank.mjs';

/**
 * @param {string} name the arm
 * @param {number[]} flags its per-seed held flags
 * @param {number} [alive] seeds with hunters alive
 * @param {number} [edge] its edge birth/death ratio
 * @returns {any} a row with the given held flags
 */
const row = (name, flags, alive = 10, edge = 0.5) => ({
    name,
    seeds: flags.length,
    held: flags.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0),
    alive,
    flags,
    means: { 'eval.edge_birth_death_ratio': edge },
});

describe('paired', () => {
    it('counts the seeds gained and lost against the reference', () => {
        expect(paired([1, 1, 0, 0], [1, 0, 1, 0])).toEqual({ gained: 1, lost: 1 });
    });

    it('is null when either side cannot say or the lengths differ', () => {
        expect(paired(null, [1])).toBeNull();
        expect(paired([1], [1, 0])).toBeNull();
    });
});

describe('rank', () => {
    it('sorts by held, then alive, then the edge ratio', () => {
        const rows = [row('a', [1, 0], 5), row('b', [1, 1], 1), row('c', [1, 0], 9), row('d', [1, 0], 9, 0.9)];
        expect(rank(rows).map((r) => r.name)).toEqual(['b', 'd', 'c', 'a']);
    });
});

describe('renderRank', () => {
    it('prints the paired counts against the reference and a dash for the reference itself', () => {
        const text = renderRank(rank([row('defaults', [1, 0]), row('x', [1, 1])]), 'defaults');
        expect(text).toContain('| 1 | x | 2/2 | +1/-0 |');
        expect(text).toContain('| 2 | defaults | 1/2 | - |');
    });
});
