import { describe, expect, it } from 'vitest';
import { createPreStep5Config, preStep5 } from '../helpers/pre-step5.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { phase4Budget } from '../../js/evo/role-budget-matrix-thrive.js';
import { searchBirth } from '../../js/evo/role-budget-search-birth.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

const model = MODEL_DEFAULTS;

describe('searchBirth', () => {
    const found = searchBirth(createPreStep5Config({}), { model, overrides: preStep5() });
    const base = phase4Budget('forager:idle', { config: createPreStep5Config({}), model, budgets: {} }).ratio;

    it('finds a rise in the entrant energy that turns the first meal ok, smallest change first', () => {
        expect(found.length).toBeGreaterThan(0);
        expect(found[0].changes).toEqual([{ path: 'entrantEnergy', factor: 2, value: 400 }]);
        expect(found[0].firstMeal).toBe('ok');
    });

    it('accepts a change only when the first meal is ok and the idle ratio does not rise', () => {
        for (const f of found) {
            const config = createPreStep5Config(f.overrides);
            expect(phase4Budget('forager:first-meal', { config, model, budgets: {} }).row.status).toBe('ok');
            expect(f.ratio).toBeLessThanOrEqual(base);
            expect(phase4Budget('forager:idle', { config, model, budgets: {} }).ratio).toBe(f.ratio);
        }
    });

    it('also tries each cold setting beside a birth setting, and writes the whole overrides', () => {
        const paired = found.find((f) => f.changes.length === 2);
        expect(paired?.changes[0].path).toMatch(/Energy|energy/);
        expect(paired?.overrides[paired.changes[1].path]).toBeDefined();
        expect(found.every((f) => f.changes.length <= 2)).toBe(true);
    });

    it(
        'returns nothing for a first meal that is already ok, and skips a setting that is 0',
        () => {
            expect(searchBirth(createPreStep5Config({ entrantEnergy: 800 }), { model })).toEqual([]);
            const noCold = searchBirth(createPreStep5Config({}), { model, overrides: preStep5() });
            expect(noCold.some((f) => f.changes.some((c) => c.path === 'coldStackRate'))).toBe(false);
        },
        scaleTimeout(30_000),
    );

    it(
        'carries the base overrides into every file',
        () => {
            const withBase = searchBirth(createPreStep5Config({ foodEnergy: 90 }), {
                model,
                overrides: { foodEnergy: 90 },
            });
            expect(withBase.length).toBeGreaterThan(0);
            expect(withBase.every((f) => f.overrides.foodEnergy === 90)).toBe(true);
        },
        scaleTimeout(30_000),
    );
});
