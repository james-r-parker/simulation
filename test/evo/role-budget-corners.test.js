import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MAX_PAIRS, bodiesOf, readCorners, readExtremes, rowAt, slackOf } from '../../js/evo/role-budget-corners.js';
import { matrix } from '../../js/evo/role-budget-matrix.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { traitCorners } from '../../js/evo/role-budget-genes.js';
import { neutralMenus } from './helpers/neutral-menus.js';

const model = { ...MODEL_DEFAULTS };
const reading = (/** @type {any} */ config) => ({ config, worldConfig: config, model });

describe('bodiesOf', () => {
    it('names the performer, and the pressure when the second name is a spec', () => {
        expect(bodiesOf('defender:predator')).toEqual({ performer: 'defender', pressure: 'predator' });
        expect(bodiesOf('predator:average')).toEqual({ performer: 'predator', pressure: null });
        expect(bodiesOf('forager:idle')).toEqual({ performer: 'forager', pressure: null });
    });
});

describe('the corners at neutral spans', () => {
    const open = reading(arenaConfig(neutralMenus()));

    it('are one pair, and every cell of the defender and idle rows equals the defaults', () => {
        const rows = ['forager:idle', 'defender:predator'];
        const want = matrix(open.config, model, rows, { worldConfig: open.config }).rows;
        for (const row of want) {
            const read = readCorners(open, row.name);
            expect(read.pairs, row.name).toBe(1);
            for (const [step, c] of Object.entries(row.cells).filter(([, cell]) => cell.status !== 'n/a')) {
                expect(read.cells[step].min.margin, `${row.name} ${step}`).toBe(c.margin);
                expect(read.cells[step].max.margin, `${row.name} ${step}`).toBe(c.margin);
            }
        }
    });

    it('read an extreme as the defaults too, whichever way it is asked', () => {
        for (const mode of /** @type {const} */ (['best-vs-worst', 'worst-vs-best'])) {
            const got = readExtremes(open, 'defender:predator', mode);
            expect(got.performer).toEqual({});
            expect(got.pressure).toEqual({});
            expect(slackOf(got.row)).toBe(slackOf(rowAt(open, 'defender:predator', { performer: {}, pressure: {} })));
        }
    });
});

describe('the corners of an open menu', () => {
    it('read every pair, and name for each cell the corner pair of its least and its most slack', () => {
        const open = reading(arenaConfig(neutralMenus({ forager: { size: 0.3, fat: 0.3, speed: 0.3 } })));
        const read = readCorners(open, 'forager:herd');
        expect(read.pairs).toBe(8);
        expect(Object.keys(read.cells)).toEqual(['see', 'turn', 'run', 'survive']);
        for (const [step, { min, max }] of Object.entries(read.cells)) {
            expect(min.margin ?? -Infinity, step).toBeLessThanOrEqual(max.margin ?? -Infinity);
            for (const pick of [min, max]) {
                const at = rowAt(open, 'forager:herd', { performer: pick.performer, pressure: pick.pressure });
                expect(at.cells[step].margin, step).toBe(pick.margin);
            }
        }
        expect(read.cells.run.min.margin).toBeNull();
        expect(read.cells.see.min.margin).toBeLessThan(/** @type {number} */ (read.cells.see.max.margin));
    });

    it('pick the performer corner of most (least) slack against the default pressure, and the pressure corner that leaves the default performer least (most)', () => {
        const row = 'defender:predator';
        const open = reading(
            arenaConfig(neutralMenus({ defender: { size: 0.3, vision: 0.3 }, predator: { vision: 0.3 } })),
        );
        const performers = traitCorners(open.config, 'defender');
        const pressures = traitCorners(open.config, 'predator');
        const slackP = performers.map((c) => slackOf(rowAt(open, row, { performer: c, pressure: {} })));
        const slackQ = pressures.map((c) => slackOf(rowAt(open, row, { performer: {}, pressure: c })));
        const bw = readExtremes(open, row, 'best-vs-worst');
        expect(bw.performer).toEqual(performers[slackP.indexOf(Math.max(...slackP))]);
        expect(bw.pressure).toEqual(pressures[slackQ.indexOf(Math.min(...slackQ))]);
        const wb = readExtremes(open, row, 'worst-vs-best');
        expect(wb.performer).toEqual(performers[slackP.indexOf(Math.min(...slackP))]);
        expect(wb.pressure).toEqual(pressures[slackQ.indexOf(Math.max(...slackQ))]);
        expect(slackOf(bw.row)).toBe(slackOf(rowAt(open, row, bw)));
        expect(readCorners(open, row).pairs).toBe(4 * 2);
    });

    it('refuse a menu of more corner pairs than they read', () => {
        const wide = Object.fromEntries(['vision', 'speed', 'sprintStore', 'fat', 'size', 'burn'].map((t) => [t, 0.2]));
        const both = { ...wide, heatBand: 3 };
        const config = arenaConfig(neutralMenus({ defender: both, predator: both }));
        expect(() => readCorners(reading(config), 'defender:predator')).toThrow(
            new RegExp(`16384 corner pairs.*at most ${MAX_PAIRS}`),
        );
    });
});
