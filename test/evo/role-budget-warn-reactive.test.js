import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { maxCatchableGap } from '../../js/evo/role-budget-frame.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { budgetWarn, flying } from '../../js/evo/role-budget-warn.js';

// Phase 6 (docs/designs/role-budget.md, "Phase 6 steps"): the warned forager's run reads the reactive hunter, on the broken
// bound, from the head start `flightAfter` gives it.
const config = arenaConfig({});
const [scout, forager, hunter] = ['scout', 'forager', 'predator'].map((s) => roleParams(config, s));
const b = budgetWarn(scout, forager, hunter, MODEL_DEFAULTS);

describe('the scout run cell at the step 5 defaults', () => {
    it('is not impossible: the warned forager breaks away from the reactive hunter', () => {
        expect(b.cells.run.status).toMatch(/^(ok|tight)$/);
        expect(b.row.binding).not.toBe('run');
    });

    it('reads the reactive hunter on the broken bound from the forager head start, below the perfect reach', () => {
        const at = { model: MODEL_DEFAULTS, ...flying(b.chain) };
        const reactive = maxCatchableGap(hunter, forager, { ...at, tier: 'reactive', bound: 'broken' });
        const perfect = maxCatchableGap(hunter, forager, at);
        expect(b.gaps.catchable).toBe(reactive);
        expect(reactive).toBeLessThan(perfect);
        expect(b.cells.run.distance).toBeCloseTo(b.chain.gapAtRun - reactive, 9);
    });
});
