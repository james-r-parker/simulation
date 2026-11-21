import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { budgetChase } from '../../js/evo/role-budget-chase.js';
import { contextOf } from '../../js/evo/role-budget-forage.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { budgetThrive, encountersPerLife, patchFoodDensity, poorestBirth } from '../../js/evo/role-budget-thrive.js';

const model = MODEL_DEFAULTS;

/** @param {Record<string, any>} overrides @param {string} spec @returns {ReturnType<typeof contextOf>} */
function ctxOf(overrides, spec) {
    const config = createConfig(overrides);
    return contextOf(config, spec, roleParams(config, spec));
}

/** @param {Record<string, any>} overrides @param {string} spec @returns {ReturnType<typeof budgetThrive>} */
function thrive(overrides, spec = 'forager') {
    const config = createConfig(overrides);
    const hunter = ctxOf(overrides, 'predator');
    const chase = budgetChase(hunter.p, roleParams(config, spec), model, { bearings: false });
    return budgetThrive(ctxOf(overrides, spec), { chase, hunter, model });
}

describe('encountersPerLife', () => {
    it('is the density of hunters times the strip a hunter sweeps at its cruise cap over a life', () => {
        const hunter = ctxOf({}, 'predator');
        const e = encountersPerLife(hunter, model);
        expect(e.density).toBeCloseTo((500 * 0.1) / (14400 * 8100), 15);
        expect(e.perLife).toBeGreaterThan(50);
        expect(e.perLife).toBeLessThan(250);
    });

    it('reads another density for prey', () => {
        const hunter = ctxOf({}, 'predator');
        expect(encountersPerLife(hunter, model, 2e-6).perLife).toBeCloseTo(
            2 * encountersPerLife(hunter, model, 1e-6).perLife,
            6,
        );
    });
});

describe('poorestBirth', () => {
    it('is the entrant, and a founder when the entrant is set to 0 (it reads as initialEnergy)', () => {
        expect(poorestBirth(roleParams(createConfig({}), 'forager'))).toBe(200);
        expect(poorestBirth(roleParams(createConfig({ entrantEnergy: 0 }), 'forager'))).toBe(800);
    });
});

describe('budgetThrive at the defaults', () => {
    const b = thrive({});

    it('eats at a positive net: the income of a meal less the search and the handling', () => {
        expect(b.cells.eat.status).toBe('ok');
        expect(b.cycle.net).toBeGreaterThan(3);
        expect(b.cells.eat.unit).toBe('energy per 100 ticks');
    });

    it('reaches the split gate of 900 from 200 in the ticks the net rate takes, with the adult life far beyond', () => {
        expect(b.split.gate).toBe(900);
        expect(b.split.ticks).toBeCloseTo(700 / b.cycle.net, 9);
        expect(b.split.life).toBe(72000 - 600);
        expect(b.cells.breed.capped).toBe(true);
    });

    it('reads the hunter as unable to close on the forager at the defaults, so run is ok with its slack in ticks', () => {
        expect(b.cells.run.status).toBe('ok');
        expect(b.hunters.encounters).toBeGreaterThan(1);
        expect(b.hunters.flight).toBe(16);
    });

    it('has the row named for the spec and the hunter', () => {
        expect(b.row.name).toBe('forager:predator');
        expect(thrive({}, 'reproducer').row.name).toBe('reproducer:predator');
    });
});

describe('budgetThrive on a changed world', () => {
    it('cannot eat when a meal costs more than it returns: eat and breed are impossible', () => {
        const b = thrive({ foodEnergy: 3 });
        expect(b.cells.eat.status).toBe('impossible');
        expect(b.cells.breed.status).toBe('impossible');
        expect(b.row.status).toBe('impossible');
        expect(b.split.ticks).toBe(Infinity);
    });

    it('cannot breed when the adult life is shorter than the climb to the gate', () => {
        const b = thrive({ maxAgeTicks: 700, maturityTicks: 100, foodEnergy: 12 });
        expect(b.split.slack).toBeLessThan(0);
        expect(b.cells.breed.status).toBe('impossible');
    });

    it('run is impossible when a hunter that closes on the forager is met in a life', () => {
        const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
        const b = thrive(courser);
        expect(b.cells.run.status).toBe('impossible');
        expect(b.row.binding).toBe('run');
    });

    it('run is not impossible when no hunter is met in a life (the hunters are too few)', () => {
        const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
        const config = createConfig(courser);
        const hunter = ctxOf(courser, 'predator');
        const chase = budgetChase(
            hunter.p,
            roleParams(config, 'forager'),
            { ...model, hunterShare: 0 },
            { bearings: false },
        );
        const b = budgetThrive(ctxOf(courser, 'forager'), { chase, hunter, model: { ...model, hunterShare: 0 } });
        expect(b.cells.run.status).toBe('ok');
        expect(b.cells.run.capped).toBe(true);
    });

    it('reads the model density when it is given', () => {
        const config = createConfig({});
        const hunter = ctxOf({}, 'predator');
        const chase = budgetChase(hunter.p, roleParams(config, 'forager'), model, { bearings: false });
        const thin = budgetThrive(ctxOf({}, 'forager'), { chase, hunter, model: { ...model, foodDensity: 1e-6 } });
        expect(thin.cycle.density).toBe(1e-6);
        expect(thin.cycle.net).toBeLessThan(thrive({}).cycle.net);
        expect(patchFoodDensity(ctxOf({}, 'forager').world)).toBeGreaterThan(1e-6);
    });
});
