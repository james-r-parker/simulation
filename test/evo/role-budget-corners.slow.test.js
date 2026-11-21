import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { readCorners, readExtremes, slackOf } from '../../js/evo/role-budget-corners.js';
import { BUILT_ROWS, matrix } from '../../js/evo/role-budget-matrix.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { neutralMenus } from './helpers/neutral-menus.js';

const model = { ...MODEL_DEFAULTS };
const reading = (/** @type {any} */ config) => ({ config, worldConfig: config, model });

describe('the corners of every built row', () => {
    it(
        'at neutral spans are one pair equal to the defaults',
        () => {
            const open = reading(arenaConfig(neutralMenus()));
            const rows = BUILT_ROWS;
            const want = matrix(open.config, model, rows, { worldConfig: open.config }).rows;
            expect(want.length).toBe(rows.length);
            for (const row of want.filter((r) => r.status !== 'n/a')) {
                const read = readCorners(open, row.name);
                expect(read.pairs, row.name).toBe(1);
                for (const [step, c] of Object.entries(row.cells).filter(([, cell]) => cell.status !== 'n/a')) {
                    expect(read.cells[step].min.margin, `${row.name} ${step}`).toBe(c.margin);
                    expect(read.cells[step].max.margin, `${row.name} ${step}`).toBe(c.margin);
                }
            }
        },
        scaleTimeout(60_000),
    );

    it(
        'at the default menus read the extremes inside the least and the most slack of the corners',
        () => {
            const open = reading(arenaConfig({}));
            for (const row of ['predator:forager', 'defender:predator']) {
                const read = readCorners(open, row);
                expect(read.pairs).toBeGreaterThan(1);
                for (const { min, max } of Object.values(read.cells)) {
                    expect(min.margin ?? -Infinity).toBeLessThanOrEqual(max.margin ?? -Infinity);
                }
                const floor = Math.min(...Object.values(read.cells).map((c) => c.min.margin ?? -Infinity));
                const ceiling = Math.min(...Object.values(read.cells).map((c) => c.max.margin ?? -Infinity));
                for (const mode of /** @type {const} */ (['best-vs-worst', 'worst-vs-best'])) {
                    const slack = slackOf(readExtremes(open, row, mode).row);
                    expect(slack, `${row} ${mode}`).toBeGreaterThanOrEqual(floor);
                    expect(slack, `${row} ${mode}`).toBeLessThanOrEqual(ceiling);
                }
            }
        },
        scaleTimeout(60_000),
    );
});
