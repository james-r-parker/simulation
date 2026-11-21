import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { PREY_SPECS, budgetChase } from '../../js/evo/role-budget-chase.js';
import { contextOf } from '../../js/evo/role-budget-forage.js';
import { budgetLiving, killIncome } from '../../js/evo/role-budget-living.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** @param {Record<string, any>} overrides @param {Partial<typeof MODEL_DEFAULTS>} [extra] @returns {ReturnType<typeof budgetLiving>} */
function living(overrides, extra = {}) {
    const config = createConfig(overrides);
    const model = { ...MODEL_DEFAULTS, ...extra };
    const hunter = contextOf(config, 'predator', roleParams(config, 'predator'));
    const preys = Object.fromEntries(PREY_SPECS.map((s) => [s, roleParams(config, s)]));
    const budgets = Object.fromEntries(
        PREY_SPECS.map((s) => [s, budgetChase(hunter.p, preys[s], model, { bearings: false })]),
    );
    const mix = Object.fromEntries(PREY_SPECS.map((s) => [s, 0.25]));
    return budgetLiving(hunter, { budgets, preys, mix, model });
}

describe('killIncome', () => {
    it('is the bites and the gorge of the anchors: 700 on a forager and a reproducer, 760 on a scout, 700 on a defender', () => {
        const config = createConfig({});
        const hunter = roleParams(config, 'predator');
        const of = (/** @type {string} */ s) => killIncome(hunter, roleParams(config, s));
        expect(of('forager')).toBeCloseTo(700, 6);
        expect(of('reproducer')).toBeCloseTo(700, 6);
        expect(of('scout')).toBeCloseTo(760, 6);
        expect(of('defender')).toBeCloseTo(700, 6);
    });
});

describe('budgetLiving at the defaults', () => {
    const b = living({});

    it('is red on eat: the chases cost more than a kill returns even at a catch share of 1', () => {
        expect(b.chase.income).toBeCloseTo((700 + 700 + 760 + 700) / 4, 6);
        expect(b.chase.netAtFull).toBeLessThan(0);
        expect(b.cells.eat.status).toBe('impossible');
        expect(b.row.binding).toBe('eat');
    });

    it('prints the resting cost and the ticks a full store lasts with no kill', () => {
        expect(b.resting.rest).toBeGreaterThan(0.012);
        expect(b.resting.storeTicks).toBeCloseTo(
            roleParams(createConfig({}), 'predator').sizing.max / b.resting.rest,
            6,
        );
    });

    it('counts the chases a life holds from the prey density and the hunter strip', () => {
        expect(b.split.perLife).toBeGreaterThan(500);
        expect(b.split.ticksPerChase).toBeCloseTo(72000 / b.split.perLife, 9);
    });
});

describe('budgetLiving where the hunter closes on its prey', () => {
    const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));

    it('pays at a catch share high enough, so a better share lifts the net by the kill income', () => {
        const low = living(courser, { catchShare: 0.3 });
        const high = living(courser, { catchShare: 0.6 });
        expect(high.chase.net - low.chase.net).toBeCloseTo(0.3 * low.chase.income, 6);
        expect(high.chase.netAtFull).toBe(low.chase.netAtFull);
    });

    it('is not impossible on eat when the net at a share of 1 is positive, and tight when the catch share does not pay', () => {
        const b = living(courser, { catchShare: 0.1 });
        if (b.chase.netAtFull > 0) {
            expect(b.cells.eat.status).not.toBe('impossible');
            expect(b.chase.net).toBeLessThan(b.chase.netAtFull);
        }
        expect(b.cells.eat.margin === null || b.cells.eat.margin >= 0).toBe(true);
    });
});
