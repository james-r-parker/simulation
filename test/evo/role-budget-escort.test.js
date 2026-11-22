import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { budgetDefend } from '../../js/evo/role-budget-defend.js';
import { ESCORT_CLEARANCE, escortGap, guardPosture } from '../../js/evo/role-budget-escort.js';
import { validateModel } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const STEP5_D = JSON.parse(readFileSync(new URL('../../evals/role-budget/step5-d.json', import.meta.url), 'utf8'));
const SHOVE = { defenderRepelEnergy: 40, defenderRepelImpulse: 4 };

/** @param {Record<string, any>} overrides @param {Record<string, any>} [model] */
const read = (overrides, model = {}) => {
    const config = arenaConfig(overrides);
    const [defender, hunter, caller] = ['defender', 'predator', 'forager'].map((s) => roleParams(config, s));
    const options = validateModel(model);
    return { defender, caller, options, budget: budgetDefend(defender, hunter, caller, options) };
};

describe('escortGap', () => {
    it('is the caller, the defender and the clearance in body radii, one radius of air by default', () => {
        const { defender, caller, options } = read({});
        expect(ESCORT_CLEARANCE).toBe(1);
        expect(escortGap(defender, caller, options)).toBe(caller.size + 2 * defender.size);
        expect(escortGap(defender, caller, options)).toBeLessThan(150);
        expect(escortGap(defender, caller, options)).toBeGreaterThan(caller.size + defender.size);
    });

    it('is the model option when it is set', () => {
        const { defender, caller } = read({});
        expect(escortGap(defender, caller, validateModel({ escortGap: 40 }))).toBe(40);
    });
});

describe('the defender row against the escort distance', () => {
    it('moves toward ok as the escort shrinks: the walk to the smoke spot and the smoke slack improve down to touching', () => {
        const at = (/** @type {number} */ gap) => read(STEP5_D, { escortGap: gap }).budget.smoke;
        const [far, mid, near] = [150, 100, 60].map(at);
        expect(far.runTicks).toBeGreaterThan(mid.runTicks);
        expect(mid.runTicks).toBeGreaterThan(near.runTicks);
        expect(/** @type {number} */ (far.slackDefender)).toBeLessThan(/** @type {number} */ (mid.slackDefender));
        expect(/** @type {number} */ (mid.slackDefender)).toBeLessThan(/** @type {number} */ (near.slackDefender));
    });

    it('is read at the derived escort on the defaults and on step5-d, with every effect off', () => {
        for (const overrides of [{}, STEP5_D]) {
            const { budget, defender, caller, options } = read(overrides);
            expect(budget.smoke.runTicks).toBeLessThan(read(overrides, { escortGap: 150 }).budget.smoke.runTicks);
            expect(budget.run.startTick).toBeGreaterThan(0);
            expect(escortGap(defender, caller, options)).toBeLessThan(150);
        }
    });

    it('stays red at every escort distance that clears the caller: the defender is slow, so the escort alone does not make it green', () => {
        // the finding of docs/designs/role-budget.md, "The defender row is read at an escort distance": no row is green
        for (const overrides of [STEP5_D, { ...STEP5_D, ...SHOVE }]) {
            for (const gap of [150, 100, 87, 60, 40, 20]) {
                const { budget } = read(overrides, { escortGap: gap });
                expect(budget.row.status).toBe('impossible');
                expect(budget.run.interceptTick).toBeNull();
                expect(budget.smoke.cell.status).toBe('impossible');
            }
        }
    });
});

describe('the guard posture', () => {
    const BETWEEN = { guardPosture: 'between' };
    const SHOVED = { ...STEP5_D, ...SHOVE };
    const PLAIN = { ...SHOVED, smokeDecoyTicks: 0 };

    it('is derived as `side` and is overridable to `between`, and a bad value is refused', () => {
        expect(guardPosture(validateModel({}))).toBe('side');
        expect(guardPosture(validateModel(BETWEEN))).toBe('between');
        expect(guardPosture(validateModel({ guardPosture: 'side' }))).toBe('side');
        expect(() => validateModel({ guardPosture: 'behind' })).toThrow(/guardPosture/);
    });

    it('improves the defender against a hunter closing side-on: it touches the hunter and the walk to the smoke spot goes', () => {
        for (const overrides of [{}, STEP5_D]) {
            const side = read(overrides).budget;
            const guard = read(overrides, BETWEEN).budget;
            expect(side.run.interceptTick).toBeNull();
            expect(guard.run.interceptTick).not.toBeNull();
            expect(guard.run.interceptTick).toBeLessThan(/** @type {number} */ (side.baseline.killTick));
            expect(guard.smoke.runTicks).toBe(0);
            expect(/** @type {number} */ (guard.smoke.slackDefender)).toBeGreaterThan(
                /** @type {number} */ (side.smoke.slackDefender),
            );
        }
    });

    it('with the shove on the guard lands it before the kill and holds the kill off; on plain smoke the row is still red on the smoke', () => {
        const { budget } = read(PLAIN, BETWEEN);
        expect(budget.run.repelTick).not.toBeNull();
        expect(budget.run.killTick).toBeNull();
        for (const step of ['hear', 'turn', 'run', 'intercept']) {
            expect(budget.cells[step].status).toBe('ok');
        }
        expect(budget.cells.smoke.status).toBe('impossible');
        expect(budget.row.status).toBe('impossible');
        expect(budget.binding).toBe('smoke');
        expect(read(SHOVED).budget.run.repelTick).toBeNull();
    });

    it('with the decoy (the default) the same guard reads tight, bound by the smoke: the caller has time to spare', () => {
        const { budget } = read(SHOVED, BETWEEN);
        expect(budget.run.killTick).toBeNull();
        expect(budget.cells.smoke.status).toBe('tight');
        expect(budget.row.status).toBe('tight');
        expect(budget.binding).toBe('smoke');
        expect(budget.smoke.slackDefender).toBe(0);
        expect(/** @type {number} */ (budget.smoke.slackCaller)).toBeGreaterThan(30);
    });

    it('releases without the turn (the cloud drops toward the hunter in front) and on plain smoke the caller is too slow to leave the view', () => {
        const { smoke } = read(PLAIN, BETWEEN).budget;
        expect(smoke.facingTicks).toBe(0);
        expect(smoke.releaseTick).toBe(smoke.latestRelease);
        expect(smoke.slackDefender).toBe(0);
        expect(smoke.slackCaller).toBeLessThan(0);
        expect(smoke.cell.status).toBe('impossible');
    });
});
