import { describe, expect, it } from 'vitest';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { PREY_SPECS, budgetChase } from '../../js/evo/role-budget-chase.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { PHASE4_ROWS, phase4Budget, preysFor } from '../../js/evo/role-budget-matrix-thrive.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const config = createPreStep5Config({});
const model = MODEL_DEFAULTS;
const hunter = roleParams(config, 'predator');
const budgets = Object.fromEntries(
    PREY_SPECS.map((s) => [s, budgetChase(hunter, roleParams(config, s), model, { bearings: false })]),
);

describe('preysFor', () => {
    it('names the prey whose Phase 1 budget a row reads', () => {
        expect(preysFor('forager:predator')).toEqual(['forager']);
        expect(preysFor('reproducer:predator')).toEqual(['reproducer']);
        expect(preysFor('predator:living')).toEqual(PREY_SPECS);
        expect(preysFor('predator:first-meal')).toEqual(PREY_SPECS);
        expect(preysFor('forager:first-meal')).toEqual([]);
        expect(preysFor('scout:idle')).toEqual([]);
    });
});

describe('phase4Budget', () => {
    it('builds every row of Phase 4 with a row named for it', () => {
        for (const name of PHASE4_ROWS) {
            expect(phase4Budget(name, { config, model, budgets }).row.name).toBe(name);
        }
    });

    it('weights the prey of the hunter rows by the mix: a mix on the scout takes the scout kill income', () => {
        const equal = phase4Budget('predator:living', { config, model, budgets });
        const scout = phase4Budget('predator:living', { config, model, budgets, mix: { scout: 1 } });
        expect(scout.chase.income).toBeCloseTo(760, 6);
        expect(equal.chase.income).toBeCloseTo(715, 6);
    });

    it('feeds the hunter first meal with the net of its living and the prey sizes of the mix', () => {
        const living = phase4Budget('predator:living', { config, model, budgets });
        const first = phase4Budget('predator:first-meal', { config, model, budgets });
        expect(first.source.meal.perMeal).toBe(living.chase.net);
        expect(first.source.rho).toBeCloseTo(29, 9);
    });

    it('reads a juvenile for the sitter and the first meal, an adult for the forager and the living rows', () => {
        expect(phase4Budget('predator:first-meal', { config, model, budgets }).rules.entrant.energy).toBe(200);
        const juvenile = phase4Budget('predator:idle', { config, model, budgets }).rules.entrant.idleLife;
        const adult = phase4Budget('forager:idle', { config, model, budgets }).rules.entrant.idleLife;
        expect(juvenile).toBeGreaterThan(adult);
    });
});
