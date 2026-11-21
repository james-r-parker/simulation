import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { createConfig } from '../../js/sim/config.js';
import { rulesHash } from '../../js/sim/config.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import {
    BUILT_ROWS,
    PHASE1_ROWS,
    PHASE4_ROWS,
    cell,
    matrix as typedMatrix,
    rowOf,
} from '../../js/evo/role-budget-matrix.js';

const model = MODEL_DEFAULTS;
/** @type {any} the matrix with its detail left untyped for the asserts */
const matrix = typedMatrix;
const courser = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));

describe('the rows of Phase 1', () => {
    it('are the four prey rows, the average and the best', () => {
        expect(PHASE1_ROWS).toEqual([
            'predator:forager',
            'predator:reproducer',
            'predator:scout',
            'predator:defender',
            'predator:average',
            'predator:best',
        ]);
    });

    it('re-exports the cell and the row', () => {
        expect(cell(10, model).status).toBe('ok');
        expect(rowOf('r', { a: cell(1, model) }).binding).toBe('a');
    });
});

describe('matrix', () => {
    it('builds every row of the built phases by default, with the model and the rules hash of the config', () => {
        const m = matrix(courser, model);
        expect(m.rows.map((/** @type {any} */ r) => r.name)).toEqual(BUILT_ROWS);
        expect(BUILT_ROWS).toEqual([...PHASE1_ROWS, 'defender:predator', 'scout:predator', ...PHASE4_ROWS]);
        expect(m.model).toBe(model);
        expect(m.rulesHash).toBe(rulesHash(courser));
        for (const row of m.rows) {
            expect(['ok', 'tight', 'impossible', 'n/a']).toContain(row.status);
            const steps =
                /** @type {Record<string, string[]>} */ ({
                    'defender:predator': ['hear', 'turn', 'run', 'intercept', 'smoke'],
                    'scout:predator': ['see', 'hear', 'warn', 'turn', 'run'],
                    'forager:predator': ['eat', 'breed', 'run'],
                    'reproducer:predator': ['eat', 'breed', 'run'],
                    'predator:living': ['eat', 'breed'],
                })[row.name] ??
                (row.name.endsWith(':first-meal')
                    ? ['reach', 'find', 'eat']
                    : row.name.endsWith(':idle')
                      ? ['sit']
                      : ['see', 'turn', 'run', 'bite']);
            expect(Object.keys(row.cells)).toEqual(steps);
        }
    });

    it('reads a prey row from the budget of the hunter against it, the budget attached', () => {
        const m = matrix(courser, model, ['predator:scout']);
        expect(m.rows).toHaveLength(1);
        expect(m.rows[0].name).toBe('predator:scout');
        expect(m.rows[0].detail.catchable).toBe(true);
        expect(m.rows[0].binding).toBe(m.rows[0].detail.binding);
        expect(m.choice).toBeNull();
    });

    it('builds only the prey it is asked for, and the average and best from all four', () => {
        const some = matrix(courser, model, ['predator:forager', 'predator:defender']);
        expect(some.rows.map((/** @type {any} */ r) => r.name)).toEqual(['predator:forager', 'predator:defender']);
        const both = matrix(courser, model, ['predator:average', 'predator:best']);
        expect(both.rows.map((/** @type {any} */ r) => r.name)).toEqual(['predator:average', 'predator:best']);
        expect(both.choice.catchableShare).toBeGreaterThan(0);
        expect(both.rows[1].detail.best.picks).toBe(both.choice.best.picks);
    });

    it('weights the average by --mix', () => {
        const even = matrix(courser, model, ['predator:average']).choice;
        const skewed = matrix(courser, model, ['predator:average'], { mix: { forager: 1 } }).choice;
        expect(skewed.mix.forager).toBe(1);
        expect(skewed.average.cells.see.margin).not.toBe(even.average.cells.see.margin);
    });

    it('refuses a row that is not built, naming the built ones', () => {
        expect(() => matrix(courser, model, ['predator:herd'])).toThrow(
            /unknown row "predator:herd"; built: predator:forager/,
        );
    });

    it('marks a hunter that cannot close red and one that can green on the same rows', () => {
        const red = matrix(arenaConfig(), model, ['predator:forager']).rows[0];
        const green = matrix(courser, model, ['predator:forager']).rows[0];
        expect(red.status).toBe('impossible');
        expect(green.status).not.toBe('impossible');
        expect(red.binding).toBe('run');
    });
});

describe('the rows of Phase 4', () => {
    it('are the forager and reproducer rows, the hunter living, and a first meal and a sitter per spec', () => {
        expect(PHASE4_ROWS).toEqual([
            'forager:predator',
            'reproducer:predator',
            'predator:living',
            ...['forager', 'predator', 'reproducer', 'scout', 'defender'].map((s) => `${s}:first-meal`),
            ...['forager', 'predator', 'reproducer', 'scout', 'defender'].map((s) => `${s}:idle`),
        ]);
    });

    it('builds each from the default world, not the empty arena, with the budget attached', () => {
        const m = matrix(arenaConfig(), model, PHASE4_ROWS, { worldConfig: createConfig({}) });
        expect(m.rows.map((/** @type {any} */ r) => r.name)).toEqual(PHASE4_ROWS);
        const first = m.rows.find((/** @type {any} */ r) => r.name === 'forager:first-meal');
        expect(first.detail.source.n).toBe(16);
        expect(first.detail.source.area).toBe(14400 * 8100);
    });

    it('computes a forager row without the other prey budgets, and the hunter rows from all four', () => {
        const one = matrix(courser, model, ['forager:predator'], { worldConfig: createConfig({}) });
        expect(one.rows[0].detail.cells.run).toBeDefined();
        const living = matrix(courser, model, ['predator:living'], { worldConfig: createConfig({}) });
        expect(living.rows[0].status).toBeDefined();
    });

    it('reads a red first meal at the defaults (a blind walk is longer than the range) and a red hunter living', () => {
        const m = matrix(arenaConfig(), model, ['forager:first-meal', 'predator:living'], {
            worldConfig: createConfig({}),
        });
        expect(m.rows[0].status).toBe('impossible');
        expect(m.rows[0].binding).toBe('find');
        expect(m.rows[1].status).toBe('impossible');
    });
});
