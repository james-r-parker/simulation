import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { rulesHash } from '../../js/sim/config.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { BUILT_ROWS, PHASE1_ROWS, cell, matrix as typedMatrix, rowOf } from '../../js/evo/role-budget-matrix.js';

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
        expect(BUILT_ROWS).toEqual([...PHASE1_ROWS, 'defender:predator']);
        expect(m.model).toBe(model);
        expect(m.rulesHash).toBe(rulesHash(courser));
        for (const row of m.rows) {
            expect(['ok', 'tight', 'impossible', 'n/a']).toContain(row.status);
            const steps = row.name.startsWith('defender:')
                ? ['hear', 'turn', 'run', 'intercept']
                : ['see', 'turn', 'run', 'bite'];
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
        expect(() => matrix(courser, model, ['scout:predator'])).toThrow(
            /unknown row "scout:predator"; built: predator:forager/,
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
