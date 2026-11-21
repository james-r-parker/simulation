import { describe, expect, it } from 'vitest';
import { FAMILY_ROWS, familyTableRows, recordTableRows } from '../../js/app/insights-lists.js';
import { familyName } from '../../js/app/renderer/colors.js';
import { ready } from './helpers/interface-setup.js';

const SEASON = ready.info.seasonLength;

/**
 * @param {number} id the lineage
 * @param {Record<string, any>} [more] fields over the fixture
 * @returns {Record<string, any>} a family row as the worker posts it
 */
function family(id, more = {}) {
    return {
        id,
        count: 30,
        share: 0.25,
        oldestGenomeId: 900 + id,
        oldestAgeTicks: SEASON * 2.5,
        bySpec: [20, 8, 0, 0, 2],
        kills: 1234,
        deepest: 17,
        ...more,
    };
}

/** @param {Record<string, any>} stats the stats @returns {any} insights data holding them */
const dataOf = (stats) => ({ ready, stats });

const record = (/** @type {number} */ value, /** @type {number} */ genomeId, alive = true) => ({
    value,
    genomeId,
    alive,
});

describe('familyTableRows', () => {
    it('has no rows before stats, or from stats that carry no families', () => {
        expect(familyTableRows({ ready: null, stats: null }, () => '#fff')).toEqual([]);
        expect(familyTableRows(dataOf({ tick: 1 }), () => '#fff')).toEqual([]);
    });

    it('shows each family by name with its size, age, mix, kills and depth, coloured, following its oldest member', () => {
        const stats = {
            tick: 5,
            lineages: { top: [{ id: 5 }, { id: 8 }] },
            families: [family(5), family(8, { bySpec: [0, 0, 0, 0, 3] })],
        };
        const rows = familyTableRows(dataOf(stats), (id) => `colour-${id}`);
        expect(rows[0]).toEqual({
            cells: [
                familyName(ready.seed, 5, stats.lineages.top),
                '30 (25%)',
                '2.5 seasons',
                'forager 20, predator 8, defender 2',
                '1,234',
                '17',
            ],
            color: 'colour-5',
            pick: true,
            target: { kind: 'family', genomeId: 905 },
        });
        expect(rows[1].cells[3]).toBe('defender 3');
        expect(rows[1].target.genomeId).toBe(908);
    });

    it('lists at most twelve, and does not offer a follow for a family with no member', () => {
        const many = Array.from({ length: 15 }, (_, i) => family(i + 1));
        expect(familyTableRows(dataOf({ tick: 1, families: many }), () => '#fff')).toHaveLength(FAMILY_ROWS);
        const [empty] = familyTableRows(
            dataOf({
                tick: 1,
                families: [family(3, { oldestGenomeId: 0, oldestAgeTicks: -1, bySpec: [0, 0, 0, 0, 0] })],
            }),
            () => '#fff',
        );
        expect([empty.pick, empty.cells[2], empty.cells[3]]).toEqual([false, '-', '']);
    });

    it('copes with a world that has no info yet', () => {
        const [row] = familyTableRows({ ready: null, stats: { tick: 1, families: [family(2)] } }, () => '#fff');
        expect(row.cells[3]).toBe('');
    });
});

describe('recordTableRows', () => {
    const records = {
        longestLife: record(SEASON * 3, 11),
        mostKills: record(42, 12, false),
        mostChildren: record(0, 0, false),
    };

    it('has no rows before stats carry records', () => {
        expect(recordTableRows(dataOf({ tick: 1 }), { ticks: 0, genome: 0, alive: false })).toEqual([]);
        expect(recordTableRows({ ready: null, stats: null }, { ticks: 0, genome: 0, alive: false })).toEqual([]);
    });

    it('shows each record with its holder, and follows only a holder that is alive', () => {
        const rows = recordTableRows(dataOf({ tick: 1, records }), { ticks: 1800, genome: 13, alive: true });
        expect(rows.map((r) => r.cells)).toEqual([
            ['longest life', '3.0 seasons', 'blob 11'],
            ['most kills', '42', 'blob 12 (gone)'],
            ['most children', '-', '-'],
            ['longest chase', '30 s', 'blob 13'],
        ]);
        expect(rows.map((r) => r.pick)).toEqual([true, false, false, true]);
        expect(rows.map((r) => r.muted)).toEqual([false, false, true, false]);
        expect(rows[0].target).toEqual({ kind: 'record', genomeId: 11 });
        expect(rows[3].target).toEqual({ kind: 'record', genomeId: 13 });
    });

    it('shows no chase before one has been seen, and a gone hunter as gone', () => {
        const none = recordTableRows(dataOf({ tick: 1, records }), { ticks: 0, genome: 0, alive: false });
        expect(none[3].cells).toEqual(['longest chase', '-', '-']);
        const gone = recordTableRows(dataOf({ tick: 1, records }), { ticks: 600, genome: 14, alive: false });
        expect(gone[3]).toMatchObject({ cells: ['longest chase', '10 s', 'blob 14 (gone)'], pick: false });
    });
});
