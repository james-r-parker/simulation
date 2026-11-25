import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preStep5, preStep5Arena } from '../helpers/pre-step5.js';
import { budgetChase } from '../../js/evo/role-budget-chase.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { CANDIDATES, FACTORS, getPath, searchSettings, withPath } from '../../js/evo/role-budget-search.js';

const pair = { hunter: 'predator', prey: 'forager' };
const model = MODEL_DEFAULTS;
const courserOverrides = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));
/** Two candidates and three factors: enough to plant a finding, and fast. */
const small = {
    model,
    candidates: ['specialisations.<hunter>.sprintBoost', 'specialisations.<prey>.sprintBoost'],
    factors: [0.5, 1.5, 2],
};
const budget = (/** @type {any} */ overrides) => {
    const config = preStep5Arena(overrides);
    return budgetChase(roleParams(config, 'predator'), roleParams(config, 'forager'), model, { bearings: false });
};

describe('the path helpers', () => {
    it('reads a dotted path and sets one on a copy, making the nodes it needs', () => {
        const config = preStep5Arena();
        expect(getPath(config, 'specialisations.predator.sprintBoost')).toBe(1.6);
        expect(getPath(config, 'maxVelocity')).toBe(8);
        expect(getPath(config, 'specialisations.nobody.sprintBoost')).toBeUndefined();
        const base = { a: { b: 1 } };
        const next = withPath(base, 'a.c.d', 5);
        expect(next).toEqual({ a: { b: 1, c: { d: 5 } } });
        expect(base).toEqual({ a: { b: 1 } });
        expect(withPath({}, 'x', 2)).toEqual({ x: 2 });
    });
});

describe('searchSettings', () => {
    const config = preStep5Arena();
    const found = searchSettings(config, pair, { ...small, overrides: preStep5() });

    it('makes the planted impossible pair (the defaults) catchable by single settings, smallest change first', () => {
        expect(budget({}).catchable).toBe(false);
        expect(found.length).toBeGreaterThan(0);
        for (const f of found) {
            expect(f.margin).toBeGreaterThanOrEqual(0);
        }
        const sizes = found.map((f) => Math.abs(f.factor - 1));
        expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    });

    it('names the expected change: more sprint for the hunter, less for the prey', () => {
        const boost = found.find((f) => f.path === 'specialisations.predator.sprintBoost' && f.factor === 1.5);
        expect(boost).toMatchObject({ value: 1.6 * 1.5, fit: true, learnSlope: 'ok' });
        expect(found.some((f) => f.path === 'specialisations.forager.sprintBoost' && f.factor < 1)).toBe(true);
    });

    it('writes each finding as an overrides object that round-trips through the config and makes the pair catchable', () => {
        for (const f of found) {
            const again = preStep5Arena(JSON.parse(JSON.stringify(f.overrides)));
            expect(getPath(again, f.path)).toBeCloseTo(f.value, 12);
            expect(budget(f.overrides).catchable).toBe(true);
        }
    });

    it('keeps the overrides that made the config', () => {
        const base = searchSettings(preStep5Arena(courserOverrides), pair, {
            ...small,
            overrides: preStep5(courserOverrides),
        });
        expect(base.length).toBeGreaterThan(0);
        for (const f of base) {
            expect(f.overrides.sprintStoreEnabled).toBe(true);
            expect(f.overrides.sprintDrain).toBe(0.01);
        }
    });

    it('asks a catchable pair that is not fit for a change that makes it fit, and a fit pair for nothing', () => {
        const base = budget(courserOverrides);
        expect(base.catchable).toBe(true);
        expect(base.fit).toBe(false);
        const options = { ...small, overrides: preStep5(courserOverrides) };
        const fixes = searchSettings(preStep5Arena(courserOverrides), pair, options);
        expect(fixes.length).toBeGreaterThan(0);
        expect(fixes.every((f) => f.fit)).toBe(true);
        expect(budget(fixes[0].overrides).fit).toBe(true);
        const fit = fixes[0].overrides;
        expect(searchSettings(preStep5Arena(fit), pair, { ...small, overrides: fit })).toEqual([]);
    });

    it('skips a value the config refuses and takes the candidates and factors it is given', () => {
        expect(searchSettings(config, pair, { model, candidates: ['damping'], factors: [2] })).toEqual([]);
        const only = searchSettings(config, pair, {
            model,
            candidates: ['specialisations.<hunter>.sprintBoost'],
            factors: [1.5, 2],
        });
        expect(only.map((f) => f.factor)).toEqual([1.5, 2]);
    });

    it('lists the settings and factors of the plan as its defaults', () => {
        expect(FACTORS).toEqual([0.5, 0.75, 1.25, 1.5, 2]);
        expect(CANDIDATES).toHaveLength(17);
        expect(CANDIDATES).toContain('specialisations.<hunter>.rearVisionShare');
        expect(CANDIDATES).toContain('killShare');
    });
});
