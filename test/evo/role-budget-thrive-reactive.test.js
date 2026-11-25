import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { budgetChase } from '../../js/evo/role-budget-chase.js';
import { contextOf } from '../../js/evo/role-budget-forage.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { budgetThrive } from '../../js/evo/role-budget-thrive.js';

// Phase 6 (docs/designs/role-budget.md, "Phase 6 steps"): the prey's run reads the reactive hunter on the broken bound.
const config = arenaConfig({});
const hunter = contextOf(config, 'predator', roleParams(config, 'predator'));

/** @param {string} spec @returns {{b: ReturnType<typeof budgetThrive>, chase: ReturnType<typeof budgetChase>}} */
function read(spec) {
    const chase = budgetChase(hunter.p, roleParams(config, spec), MODEL_DEFAULTS, { bearings: false });
    const b = budgetThrive(contextOf(config, spec, roleParams(config, spec)), {
        chase,
        hunter,
        model: MODEL_DEFAULTS,
    });
    return { b, chase };
}

describe('the prey run cell at the step 5 defaults', () => {
    it.each(['forager', 'reproducer'])(
        'reads %s against the reactive hunter on the broken bound, not the perfect one',
        (spec) => {
            const { b, chase } = read(spec);
            const reactive = chase.tiers.reactive.broken;
            expect(chase.tiers.perfect.broken).toBeGreaterThan(b.hunters.flight);
            expect(reactive).toBeLessThan(b.hunters.flight);
            expect(b.cells.run.status).toMatch(/^(ok|tight)$/);
            expect(b.cells.run.distance).toBeCloseTo(b.hunters.flight - reactive, 9);
        },
    );

    it('prints the perfect straight margin beside it as context', () => {
        const { b, chase } = read('forager');
        expect(b.hunters.perfectStraight).toBe(chase.tiers.perfect.straight);
        expect(b.hunters.reactiveBroken).toBe(chase.tiers.reactive.broken);
    });
});
