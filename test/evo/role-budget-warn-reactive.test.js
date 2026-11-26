import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { bestEffort, maxCatchableGap } from '../../js/evo/role-budget-frame.js';
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

describe('the perfect tier is at least the reactive one from the warned flight start (T31)', () => {
    it('on the pre-step 5 arena, where the effort sweep alone read 86 px against the reactive 270 px', () => {
        const old = preStep5Arena();
        const [sc, fo, hu] = ['scout', 'forager', 'predator'].map((s) => roleParams(old, s));
        const at = { model: MODEL_DEFAULTS, ...flying(budgetWarn(sc, fo, hu, MODEL_DEFAULTS).chain) };
        const reactive = maxCatchableGap(hu, fo, { ...at, tier: 'reactive', bound: 'broken' });
        const perfect = maxCatchableGap(hu, fo, at);
        expect(reactive).toBeGreaterThan(200);
        expect(perfect).toBeGreaterThanOrEqual(reactive);
    });

    it('and the sweep alone is still the reach when no reactive hunter reaches further', () => {
        const at = { model: MODEL_DEFAULTS, ...flying(b.chain) };
        expect(maxCatchableGap(hunter, forager, at)).toBe(bestEffort(hunter, forager, at).gap);
    });

    it('a fixed effort is read as asked and never lifted by the reactive tier', () => {
        const old = preStep5Arena();
        const [sc, fo, hu] = ['scout', 'forager', 'predator'].map((s) => roleParams(old, s));
        const at = { model: MODEL_DEFAULTS, ...flying(budgetWarn(sc, fo, hu, MODEL_DEFAULTS).chain) };
        expect(maxCatchableGap(hu, fo, { ...at, effort: 1 })).toBeLessThan(
            maxCatchableGap(hu, fo, { ...at, tier: 'reactive', bound: 'broken' }),
        );
    });
});
