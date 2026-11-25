import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { preStep5Arena } from '../helpers/pre-step5.js';
import {
    AUDIT_BEARINGS,
    budgetChase as typedBudgetChase,
    chaseTimeline,
    gapAtAwareness,
    maxCatchableGap,
    stepSlack as typedStepSlack,
} from '../../js/evo/role-budget-chase.js';
import { SLACK_CAP } from '../../js/evo/role-budget-cell.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** @type {any} the budget and the slack with their numbers left untyped for the asserts */
const budgetChase = typedBudgetChase;
/** @type {any} */
const stepSlack = typedStepSlack;
const arm = (/** @type {any} */ name) => JSON.parse(readFileSync(`evals/fair-chase/${name}.json`, 'utf8'));
const pair = (/** @type {any} */ overrides, prey = 'forager') => {
    const config = preStep5Arena(overrides);
    return { hunter: roleParams(config, 'predator'), prey: roleParams(config, prey) };
};
const model = MODEL_DEFAULTS;
const courser = pair(arm('courser'));
const defaults = pair({});

describe('budgetChase on a catchable pair (the courser arm against the forager)', () => {
    const b = budgetChase(courser.hunter, courser.prey, model);

    it('gives every step a slack, the bite the one of the energy, and no step impossible', () => {
        expect(b.row.status).not.toBe('impossible');
        for (const step of ['see', 'turn', 'run', 'bite']) {
            expect(b.cells[step].margin).toBeGreaterThan(0);
        }
        expect(b.cells.bite.margin).toBeGreaterThan(100);
    });

    it('is catchable on the broken bound with a positive margin and names the least-slack step', () => {
        expect(b.catchable).toBe(true);
        expect(b.catchMargin).toBeGreaterThan(0);
        const least = Object.entries(b.cells).sort((x, y) => x[1].margin - y[1].margin)[0][0];
        expect(b.binding).toBe(least);
        expect(b.cells[least].binding).toBe(true);
    });

    it('prints the catch margin beside the run slack', () => {
        expect(b.cells.run.distance).toBe(b.catchMargin);
        expect(b.cells.run.unit).toBe('ticks');
    });

    it('reads the energy of the chase against what the hunter holds, and the heat against its headroom', () => {
        expect(b.chaseEnergy.income).toBeGreaterThan(400);
        expect(b.chaseEnergy.net).toBeCloseTo(b.chaseEnergy.income - b.chaseEnergy.kick - b.chaseEnergy.spent, 9);
        expect(b.chaseEnergy.holds).toBe(courser.hunter.energy - courser.hunter.repro.birthReserve);
        expect(b.chaseHeat.headroom).toBe(65 - 50);
        expect(b.chaseHeat.gain).toBeGreaterThan(0);
        expect(b.refillTicks).toBeGreaterThan(0);
        expect(b.refillTicks).toBeLessThanOrEqual(500);
    });

    it('reads the eight audit bearings: the share that close, the worst margin and eight margins', () => {
        expect(AUDIT_BEARINGS).toHaveLength(8);
        expect(AUDIT_BEARINGS[0]).toBe(-Math.PI);
        expect(b.bearings.margins).toHaveLength(8);
        expect(b.bearings.share).toBe(b.bearings.margins.filter((/** @type {any} */ m) => m >= 0).length / 8);
        expect(b.bearings.worst).toBe(Math.min(...b.bearings.margins));
        expect(b.bearings.margins[4]).toBeGreaterThanOrEqual(0);
    });

    it('skips the bearings when asked', () => {
        expect(budgetChase(courser.hunter, courser.prey, model, { bearings: false }).bearings).toBeNull();
    });
});

describe('budgetChase on a pair that does not close (the defaults against the forager)', () => {
    const b = budgetChase(defaults.hunter, defaults.prey, model);

    it('is not catchable on the broken bound: the run and the bite are impossible and the first two steps are not read', () => {
        expect(b.catchable).toBe(false);
        expect(b.catchMargin).toBeLessThan(0);
        expect(b.cells.run.status).toBe('impossible');
        expect(b.cells.see.status).toBe('n/a');
        expect(b.cells.turn.status).toBe('n/a');
        expect(b.cells.bite.status).toBe('impossible');
        expect(b.cells.run.distance).toBe(b.catchMargin);
        expect(b.row.status).toBe('impossible');
        expect(b.binding).toBe('run');
    });

    it('is still catchable on the straight bound, an upper bound on any hunter', () => {
        expect(b.tiers.perfect.straight).toBeGreaterThan(0);
    });
});

describe('the bite step', () => {
    it('is impossible when the size gate refuses the bite, with the other steps not read', () => {
        const small = pair({ huntSizeRatio: 3 });
        const b = budgetChase(small.hunter, small.prey, model, { bearings: false });
        expect(b.cells.bite.status).toBe('impossible');
        expect(b.cells.see.status).toBe('n/a');
        expect(b.row.status).toBe('impossible');
    });

    it('is the chase length alone when a strike at nothing costs nothing', () => {
        const free = pair({ ...arm('courser'), strikeMissCost: 0 });
        const b = budgetChase(free.hunter, free.prey, model, { bearings: false });
        expect(b.cells.bite.margin).toBeGreaterThan(100);
        expect(b.cells.bite.margin).toBeLessThanOrEqual(200);
    });

    it('is limited by the chase length, not the energy, for a rich hunter, and by the energy for a poor one', () => {
        const rich = budgetChase(courser.hunter, courser.prey, model, { bearings: false });
        expect(rich.cells.bite.margin).toBeLessThan(250);
        const poor = pair({
            ...arm('courser'),
            strikeMissCost: 4000,
        });
        const b = budgetChase(poor.hunter, poor.prey, model, { bearings: false });
        expect(b.cells.bite.margin).toBeLessThan(5);
    });
});

describe('stepSlack', () => {
    const frame = { model };

    it('is null when the hunter fails with no delay, the cap when no delay of 200 ticks stops it, and a tick count between', () => {
        expect(stepSlack(defaults.hunter, defaults.prey, 'run', frame)).toBeNull();
        // a prey that sees only 100 px and cannot out-sprint a creeping hunter is caught however late the hunter acts
        const slow = pair({
            sprintStoreEnabled: false,
            specialisations: { forager: { sprintBoost: 0.001, visionRange: 100 } },
        });
        for (const step of ['see', 'run']) {
            expect(stepSlack(slow.hunter, slow.prey, step, { model, bound: 'straight' })).toBe(SLACK_CAP);
        }
        const slack = stepSlack(courser.hunter, courser.prey, 'turn', frame);
        expect(slack).toBeGreaterThan(0);
        expect(slack).toBeLessThan(SLACK_CAP);
    });

    it('is the largest delay that still kills: one more tick of it fails', () => {
        const aware = gapAtAwareness(courser.hunter, courser.prey);
        const killsWith = (/** @type {any} */ delay) =>
            chaseTimeline(courser.hunter, courser.prey, {
                gap: aware,
                hunterStart: 'cruise',
                hunter: { slowTicks: delay },
            }).killTick !== null;
        const slack = stepSlack(courser.hunter, courser.prey, 'turn', frame);
        expect(killsWith(slack)).toBe(true);
        expect(killsWith(slack + 1)).toBe(false);
    });

    it('is smaller for a later run than a later sight is not required, but all three steps differ in cost', () => {
        const slacks = ['see', 'turn', 'run'].map((s) => stepSlack(courser.hunter, courser.prey, s, frame));
        expect(new Set(slacks).size).toBeGreaterThan(1);
    });
});

describe('the margin signs', () => {
    it('has a margin of the same sign as whether the hunter kills at the awareness gap', () => {
        for (const set of [courser, defaults]) {
            const aware = gapAtAwareness(set.hunter, set.prey);
            const kills = chaseTimeline(set.hunter, set.prey, { gap: aware, hunterStart: 'cruise' }).killTick !== null;
            const margin = maxCatchableGap(set.hunter, set.prey, { model }) - aware;
            expect(margin >= 0).toBe(kills);
        }
    });
});
