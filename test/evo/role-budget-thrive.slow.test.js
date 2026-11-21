// The Phase 4 cross-check of docs/designs/role-budget.md ("Cross-check against the sim"): the sitter and the walker, the forager in
// a grid of food, the hunter's living and the first-meal shares against the scenes of the real sim, at the defaults and on the arms
// where the numbers move.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import {
    firstMealReadings,
    foragingReadings,
    idleReadings,
    livingReadings,
} from '../../js/evo/role-budget-thrive-check.js';
import { createConfig } from '../../js/sim/config.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

vi.setConfig({ testTimeout: scaleTimeout(500_000) });

/** The explicit limit of each test: a scene read under coverage and load takes several times its bare time. */
const LIMIT = scaleTimeout(240_000);

const COURSER = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
const model = MODEL_DEFAULTS;

describe('the sitter and the walker', () => {
    it.each([
        ['defaults', {}],
        ['a cold world', { temperatureLossPassive: 0.02, temperatureStart: 45 }],
        ['a rich entrant', { entrantEnergy: 600 }],
    ])(
        '%s: the lives agree with the sim for every birth rule',
        (_name, overrides) => {
            const readings = idleReadings(createConfig(overrides), model);
            expect(readings).toHaveLength(6);
            expect(readings.filter((r) => r.drift)).toEqual([]);
        },
        LIMIT,
    );
});

describe('the forager in a grid of food', () => {
    it.each([
        ['defaults', {}],
        ['a thin patch', { maxFood: 1800 }],
    ])(
        '%s: the settled net rate is inside the tolerance',
        (_name, overrides) => {
            expect(foragingReadings(createConfig(overrides), model).filter((r) => r.drift)).toEqual([]);
        },
        LIMIT,
    );
});

describe('the hunter living', () => {
    it.each([
        ['defaults', {}],
        ['courser', COURSER],
    ])(
        '%s: the kill tick and the net energy of each chase agree with the sim',
        (_name, overrides) => {
            expect(livingReadings(arenaConfig(overrides)).filter((r) => r.drift)).toEqual([]);
        },
        LIMIT,
    );

    it(
        'the arms differ: the courser kills where the defaults do not',
        () => {
            const kills = (/** @type {Record<string, any>} */ o) =>
                livingReadings(arenaConfig(o))
                    .filter((r) => r.what.endsWith('kill tick'))
                    .map((r) => r.scene !== null);
            expect(kills({})).not.toEqual(kills(COURSER));
        },
        LIMIT,
    );
});

describe('the first meal', () => {
    it(
        'the entrant and the founder of the default world: reach inside 0.2 and find under the formula, which assumes a free plane',
        () => {
            const readings = firstMealReadings(createConfig({}), model, { count: 128 });
            expect(readings).toHaveLength(6);
            expect(readings.filter((r) => r.drift)).toEqual([]);
        },
        LIMIT,
    );

    it(
        'the entrant, whose walk is short, is read two-sided inside 0.15 on the find share',
        () => {
            const entrant = firstMealReadings(createConfig({}), model, { count: 256 }).find((r) =>
                r.what.startsWith('entrant: find'),
            );
            expect(
                Math.abs(/** @type {number} */ (entrant?.formula) - /** @type {number} */ (entrant?.scene)),
            ).toBeLessThan(0.15);
        },
        LIMIT,
    );
});
