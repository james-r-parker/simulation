// reads: evals/fair-chase/courser.json
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { LEVEL_EFFECTS } from '../../js/evo/role-budget-effects.js';
import { BUILT_ROWS, matrix as typedMatrix } from '../../js/evo/role-budget-matrix.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

/** Every `roleParams` the rows make reads an explicit level of 0 for every effect that takes one while `reading.zeros` is on. */
const reading = vi.hoisted(() => ({ zeros: false, names: /** @type {string[]} */ ([]) }));
vi.mock('../../js/evo/role-budget-params.js', async (importActual) => {
    const actual = /** @type {any} */ (await importActual());
    return {
        ...actual,
        roleParams: (/** @type {any} */ config, /** @type {string} */ spec, traits = {}, options = {}) =>
            actual.roleParams(
                config,
                spec,
                traits,
                reading.zeros
                    ? { ...options, effects: Object.fromEntries(reading.names.map((name) => [name, 0])) }
                    : options,
            ),
    };
});

/** @type {any} */
const matrix = typedMatrix;
const courser = arenaConfig(JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8')));

describe('every row with every effect at level 0 (status-effects T13)', () => {
    it(
        'equals the matrix read without effects, row for row, at the courser numbers and with the rally planted',
        () => {
            reading.names = [...LEVEL_EFFECTS];
            for (const config of [courser, arenaConfig({ rallyThrust: 0.3, rallyBurn: 0.1, woundThrust: 0.05 })]) {
                reading.zeros = false;
                const without = matrix(config, MODEL_DEFAULTS, BUILT_ROWS);
                reading.zeros = true;
                const zeros = matrix(config, MODEL_DEFAULTS, BUILT_ROWS);
                expect(zeros.rows.map((/** @type {any} */ r) => r.name)).toEqual(BUILT_ROWS);
                expect(zeros).toEqual(without);
            }
        },
        scaleTimeout(120_000),
    );
});
