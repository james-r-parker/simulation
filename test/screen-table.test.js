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
        hunters: { predators: 5, ticks: 4000, kills: 2, chaseCatch: 0.31, aliveShare: 1, lowSeeds: 0, pass: true },
        popMean: 279.4,
        summer: { above: 11, of: 16 },
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
        expect(lines[0]).toContain('catch/1k > 0 (speed)');
        expect(lines[0].indexOf('chase catch share')).toBeGreaterThan(lines[0].indexOf('catch/1k'));
        expect(lines[0]).toContain('summer >= 100');
        expect(lines[2]).toContain('11/16');
        expect(lines[2]).toContain('0.31');
        expect(lines[2]).toContain('5/4000/2 alive 1 low 0 ok');
        expect(table).toContain('Reference arm: `ref`.');
        expect(new Set(lines.slice(0, 4).map((l) => l.length)).size).toBe(1);
    });

    it('prints each new metric mean as a column, `n/a` where the arm has none', () => {
        const table = renderTable({
            reference: 'ref',
            arms: [
                verdict('ref', {
                    watch: {
                        'eval.skill_trend': 0.4375,
                        'eval.chance_food_energy_per_1k': 3.25,
                        'eval.lineage_lifespan_p50': 12345.6,
                    },
                }),
            ],
        });
        const [head, , row] = table.split('\n');
        for (const h of [
            'skill trend',
            'spec dom',
            'lineage eff',
            'trait spread',
            'child surv',
            'life p50',
            'delib food/1k',
            'chance food/1k',
            'conv 1k-2k',
            'first kill RMST',
            'boom-bust',
        ]) {
            expect(head).toContain(h);
        }
        expect(head.indexOf('skill trend')).toBeLessThan(head.indexOf('migration'));
        expect(row).toContain('0.44');
        expect(row).toContain('12346');
        expect(row).toContain('3.25');
        expect(row.split('|').filter((c) => c.trim() === 'n/a')).toHaveLength(22);
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

describe('renderTable keep-rule column', () => {
    const keep = (/** @type {boolean} */ worse) => ({
        worse,
        guards: [
            { name: 'alive', verdict: worse ? 'worse' : 'no-harm', smallestSeeds: 6 },
            { name: 'under80', verdict: 'no-harm', smallestSeeds: 5 },
        ],
        adoption: { alive: { count: 24, of: 32, low: 20.5, high: 28 } },
    });

    it('prints `=` on the reference, and the verdict, the smallest detected loss and the alive interval on an arm', () => {
        const lines = renderTable({
            reference: 'ref',
            arms: [verdict('ref'), verdict('ok', { keep: keep(false) }), verdict('bad', { keep: keep(true) })],
        }).split('\n');
        expect(lines[0]).toContain('keep rule vs ref (paired)');
        expect(lines[2]).toMatch(/\| = +\|/);
        expect(lines[3]).toContain('no harm (detects 6 seeds) alive 24/32 [20.5, 28.0]');
        expect(lines[4]).toContain('WORSE alive (detects 6 seeds) alive 24/32 [20.5, 28.0]');
    });
});
