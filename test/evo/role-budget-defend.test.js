import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { budgetDefend } from '../../js/evo/role-budget-defend.js';
import { defenceTimeline } from '../../js/evo/role-budget-defence.js';
import { escortGap } from '../../js/evo/role-budget-escort.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

/** A slow world with the shove on: the defender can arrive before the kill. */
const SLOW = {
    maxVelocity: 4.5,
    defenderRepelEnergy: 40,
    defenderRepelImpulse: 4,
    defenderRepelCost: 2,
    specialisations: { predator: { sprintBoost: 0.5 } },
};
/** The bisection below was first read with the defender 150 px off the caller. */
const NEAR = { ...MODEL_DEFAULTS, escortGap: 150 };

/** @param {Record<string, any>} overrides @param {import('../../js/evo/role-budget-model.js').RoleModel} [model] */
const budget = (overrides, model = MODEL_DEFAULTS) => {
    const config = arenaConfig(overrides);
    const [defender, hunter, caller] = ['defender', 'predator', 'forager'].map((s) => roleParams(config, s));
    return { ...budgetDefend(defender, hunter, caller, model), bodies: [hunter, caller, defender] };
};

describe('budgetDefend at the defaults', () => {
    const b = budget({});

    it('hears the call with room to spare, and has no power on arrival: intercept is impossible, binding repel: off', () => {
        expect(b.cells.hear.status).toBe('ok');
        expect(b.cells.intercept.status).toBe('impossible');
        expect(b.row.status).toBe('impossible');
        expect(b.binding).toBe('repel: off');
        expect(b.row.binding).toBe('repel: off');
        expect(b.repel.on).toBe(false);
    });

    it('cannot arrive before a kill that lands 27 ticks after the hunter is seen', () => {
        expect(b.baseline.killTick).toBe(27);
        expect(b.cells.run.status).toBe('impossible');
        expect(b.cells.turn.status).toBe('n/a');
    });

    it('prints the bite on the defender: half a bite, twice the kick', () => {
        expect(b.defenderBite.taken).toBe(50);
        expect(b.defenderBite.kick).toBeCloseTo(10.31, 2);
    });

    it('caps the hear slack at the ticks the call stays audible, minus the first', () => {
        // the call is audible for 52 ticks at the escort distance (87 px) and 49 at 150 px
        expect(b.cells.hear.margin).toBe(51);
    });
});

describe('budgetDefend with the shove on in a world the defender can reach', () => {
    const b = budget(SLOW, NEAR);

    it('reads every step as a slack, and the intercept as the ticks to spare before the kill', () => {
        expect(b.repel.on).toBe(true);
        for (const step of ['hear', 'turn', 'run', 'intercept']) {
            expect(b.cells[step].status).toBe('ok');
        }
        expect(b.cells.intercept.margin).toBe(
            /** @type {number} */ (b.baseline.killTick) - /** @type {number} */ (b.run.repelTick),
        );
        expect(b.repel.breaksBite).toBe(true);
        expect(b.repel.prevented).toBeGreaterThanOrEqual(0);
        expect(b.binding).not.toBe('repel: off');
    });

    it('finds the largest delay at a step by bisection: that delay completes and one more fails', () => {
        const [hunter, caller, defender] = b.bodies;
        const completes = (/** @type {Record<string, number>} */ delays) => {
            const run = defenceTimeline(hunter, caller, defender, {
                reaction: 2,
                threshold: 0.1,
                side: escortGap(defender, caller, NEAR),
                delays,
            });
            const kill = /** @type {number} */ (b.baseline.killTick);
            return run.repelTick !== null && run.repelTick < kill;
        };
        expect(b.cells.turn.capped).toBe(true);
        for (const step of ['hear', 'run']) {
            const slack = /** @type {number} */ (b.cells[step].margin);
            expect(slack).toBeLessThan(200);
            expect(completes({ [step]: slack })).toBe(true);
            expect(completes({ [step]: slack + 1 })).toBe(false);
        }
    });

    it('a defender out of earshot hears nothing: hear is impossible and no later step is read', () => {
        const far = budget(SLOW, { ...MODEL_DEFAULTS, escortGap: 300 });
        expect(far.cells.hear.status).toBe('impossible');
        expect(far.cells.turn.status).toBe('n/a');
        expect(far.cells.run.status).toBe('n/a');
    });

    it('a shove with no energy but an impulse still counts as on', () => {
        const knock = budget({ ...SLOW, defenderRepelEnergy: 0 }, NEAR);
        expect(knock.repel.on).toBe(true);
    });
});
