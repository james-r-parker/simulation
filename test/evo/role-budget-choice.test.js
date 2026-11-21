import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { cell, rowOf } from '../../js/evo/role-budget-cell.js';
import {
    DEFAULT_MIX,
    PREY_SPECS,
    normaliseMix,
    preyBudgets,
    rowSlack,
    targetChoice,
} from '../../js/evo/role-budget-choice.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';

const model = MODEL_DEFAULTS;
const config = arenaConfig();

/** A planted budget: the four steps with these slacks (null: impossible, undefined: not read). */
/** @param {(number | null | undefined)[]} slacks */
function planted([see, turn, run, bite]) {
    const cells = {
        see: cell(see, model),
        turn: cell(turn, model),
        run: cell(run, model),
        bite: cell(bite, model),
    };
    return { cells, row: rowOf('p', cells) };
}

describe('normaliseMix', () => {
    it('scales the weights to sum to 1 and counts a prey not named as 0', () => {
        const mix = normaliseMix({ forager: 3, scout: 1 });
        expect(mix).toEqual({ forager: 0.75, reproducer: 0, scout: 0.25, defender: 0 });
        expect(
            Object.values(normaliseMix({ forager: 0.6, reproducer: 0.2, scout: 0.1, defender: 0.1 })).reduce(
                (a, b) => a + b,
            ),
        ).toBeCloseTo(1, 12);
    });

    it('refuses a name that is not a prey row, a weight under 0 or not a number, and weights that sum to 0', () => {
        expect(() => normaliseMix({ predator: 1 })).toThrow(/not a prey row/);
        expect(() => normaliseMix({ forager: -1 })).toThrow(/at least 0/);
        expect(() => normaliseMix({ forager: Number.NaN })).toThrow(/at least 0/);
        expect(() => normaliseMix({ forager: 0 })).toThrow(/sum to 0/);
    });

    it('has equal weights as its default', () => {
        expect(DEFAULT_MIX).toEqual({ forager: 0.25, reproducer: 0.25, scout: 0.25, defender: 0.25 });
    });
});

describe('rowSlack', () => {
    it('is the least slack of the steps, 0 for an impossible row and 0 for one with no step', () => {
        expect(rowSlack(planted([40, 12, 60, 90]).cells)).toBe(12);
        expect(rowSlack(planted([40, null, 60, 90]).cells)).toBe(0);
        expect(rowSlack(planted([undefined, undefined, undefined, undefined]).cells)).toBe(0);
        expect(rowSlack(planted([40, undefined, 60, 90]).cells)).toBe(40);
    });
});

describe('targetChoice', () => {
    const equal = {
        forager: planted([20, 20, 20, 20]),
        reproducer: planted([20, 20, 20, 20]),
        scout: planted([20, 20, 20, 20]),
        defender: planted([20, 20, 20, 20]),
    };

    it('has a choice gain of 0 for four equal rows, and an average equal to each', () => {
        const c = targetChoice(config, model, DEFAULT_MIX, equal);
        expect(c.choiceGain).toBe(0);
        expect(c.average.cells.see.margin).toBe(20);
        expect(c.catchableShare).toBe(1);
    });

    it('picks the planted easiest prey and gains the difference from the average', () => {
        const budgets = { ...equal, scout: planted([100, 100, 100, 100]) };
        const c = targetChoice(config, model, DEFAULT_MIX, budgets);
        expect(c.best.picks).toBe('scout');
        expect(c.best.name).toBe('predator:best');
        expect(c.best.cells.see.margin).toBe(100);
        expect(c.average.cells.see.margin).toBe(40);
        expect(c.choiceGain).toBe(100 - 40);
        expect(c.average.name).toBe('predator:average');
    });

    it('counts an impossible prey as zero slack in every step and out of the catchable share', () => {
        const budgets = { ...equal, defender: planted([null, undefined, undefined, undefined]) };
        const c = targetChoice(config, model, DEFAULT_MIX, budgets);
        expect(c.average.cells.see.margin).toBe(15);
        expect(c.average.cells.bite.margin).toBe(15);
        expect(c.catchableShare).toBe(0.75);
        expect(c.choiceGain).toBe(20 - 15);
    });

    it('makes the average impossible when no prey in the mix can be caught', () => {
        const none = Object.fromEntries(PREY_SPECS.map((s) => [s, planted([null, undefined, undefined, undefined])]));
        const c = targetChoice(config, model, DEFAULT_MIX, none);
        expect(c.catchableShare).toBe(0);
        expect(c.average.status).toBe('impossible');
        expect(c.best.status).toBe('impossible');
        expect(c.choiceGain).toBe(0);
    });

    it('weights the rows by the mix, leaving out a prey of weight 0', () => {
        const budgets = { ...equal, scout: planted([100, 100, 100, 100]) };
        const c = targetChoice(config, model, { forager: 1, scout: 3 }, budgets);
        expect(c.average.cells.run.margin).toBe(80);
        expect(c.mix).toEqual({ forager: 0.25, reproducer: 0, scout: 0.75, defender: 0 });
        expect(c.catchableShare).toBe(1);
    });

    it('is not read for a step none of the weighted prey uses', () => {
        const budgets = Object.fromEntries(PREY_SPECS.map((s) => [s, planted([20, undefined, 20, 20])]));
        expect(targetChoice(config, model, DEFAULT_MIX, budgets).average.cells.turn.status).toBe('n/a');
    });

    it('does not change the budget it picks the best row from', () => {
        const budgets = { ...equal, forager: planted([50, 50, 50, 50]) };
        const before = JSON.stringify(budgets);
        const c = targetChoice(config, model, DEFAULT_MIX, budgets);
        expect(c.best.picks).toBe('forager');
        expect(JSON.stringify(budgets)).toBe(before);
    });
});

describe('preyBudgets and the default budgets', () => {
    it('reads the predator against each prey row from the config', () => {
        const budgets = preyBudgets(config, model);
        expect(Object.keys(budgets)).toEqual(PREY_SPECS);
        const c = targetChoice(config, model);
        expect(c.catchableShare).toBeGreaterThanOrEqual(0);
        expect(c.catchableShare).toBeLessThanOrEqual(1);
        expect(c.choiceGain).toBeGreaterThanOrEqual(0);
    });
});
