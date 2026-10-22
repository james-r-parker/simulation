import { describe, expect, it } from 'vitest';
import { lockCommand } from '../scripts/lib/cpu-lock.mjs';
import { renderTable } from '../scripts/lib/screen-table.mjs';

const seeds = (/** @type {boolean[]} */ pass) => ({ pass, value: pass.map(() => 0) });
const same = seeds([true, true]);

/**
 * @param {string} arm the arm name
 * @param {Record<string, any>} [over] fields to replace
 * @returns {Record<string, any>} a verdict
 */
function verdict(arm, over = {}) {
    return {
        arm,
        pass: true,
        criteria: { popAboveMin: same, catchRate: same, lineages: same, specShare: same, popBelowMax: same },
        means: { matingShare: { value: 0.25, pass: true }, bornShare: { value: 0.9, pass: true } },
        popMean: 279.4,
        deltas: null,
        ...over,
    };
}

describe('renderTable', () => {
    it('renders one compact row per arm with k/n cells, mean cells and deltas', () => {
        const delta = (/** @type {number} */ rel) => ({ mean: 1, delta: rel, rel });
        const table = renderTable({
            reference: 'ref',
            arms: [
                verdict('ref'),
                verdict('b', {
                    pass: false,
                    criteria: { ...verdict('x').criteria, popAboveMin: seeds([true, false]) },
                    means: { matingShare: { value: 0.16, pass: false }, bornShare: { value: 0.9, pass: true } },
                    deltas: {
                        'eval.mating_share': delta(-0.2),
                        'eval.lineages_alive': delta(0.5),
                        'eval.births_per_1k': { mean: 1, delta: 0.1, rel: null },
                        'eval.food_energy_per_1k': { mean: null, delta: null, rel: null },
                        'eval.fed_median_lifespan': delta(0),
                    },
                }),
            ],
        });
        const lines = table.split('\n');
        expect(lines[0]).toMatch(/^\| Arm +\| verdict \| pop > min /);
        expect(lines[2]).toContain('`ref`');
        expect(lines[2]).toContain('PASS');
        expect(lines[2]).toContain('0.25 ok');
        expect(lines[2]).toContain('279');
        expect(lines[3]).toContain('FAIL');
        expect(lines[3]).toContain('1/2');
        expect(lines[3]).toContain('0.16 FAIL');
        expect(lines[3]).toMatch(/-20%.*\+50%.*\+0\.10.*n\/a.*0%/);
        expect(table).toContain('Reference arm: `ref`.');
        expect(new Set(lines.slice(0, 4).map((l) => l.length)).size).toBe(1);
    });
});

describe('lockCommand', () => {
    it('runs the script under flock with --no-lock appended', () => {
        expect(lockCommand({ lockPath: '/l', execPath: '/node', script: '/s.mjs', argv: ['--grid', 'g'] })).toEqual({
            command: 'flock',
            args: ['/l', '/node', '/s.mjs', '--grid', 'g', '--no-lock'],
        });
    });
});
