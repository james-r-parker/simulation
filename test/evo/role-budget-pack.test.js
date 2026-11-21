import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { AMPLIFIER_ROWS, PACK_LEVELS, budgetPack } from '../../js/evo/role-budget-pack.js';
import { BUILT_ROWS } from '../../js/evo/role-budget-matrix.js';

const model = MODEL_DEFAULTS;

describe('the pack row', () => {
    it('is an amplifier beside the gate, never one of its rows', () => {
        expect(AMPLIFIER_ROWS).toEqual(['pack:forager']);
        expect(BUILT_ROWS).not.toContain('pack:forager');
        expect(PACK_LEVELS).toEqual({ rallied: 1 });
    });

    it('has a packGain of exactly 0 at the neutral numbers, by construction: the rally changes no lane', () => {
        const pack = budgetPack(arenaConfig({}), model);
        expect(pack.packGain).toBe(0);
        expect(pack.packGainTicks).toBe(0);
        expect(pack.burn).toBe(0);
        expect(pack.rallied.catchMargin).toBe(pack.lone.catchMargin);
        expect(pack.row.name).toBe('pack:forager');
    });

    it('rises with a planted rally strength, and turns the lone hunter that cannot close into a pack that can', () => {
        const pack = budgetPack(arenaConfig({ rallyThrust: 0.5, rallyBurn: 0.2 }), model);
        expect(pack.lone.catchable).toBe(false);
        expect(pack.rallied.catchable).toBe(true);
        expect(pack.packGain).toBeGreaterThan(0);
        expect(pack.packGain).toBeCloseTo(pack.rallied.catchMargin - pack.lone.catchMargin, 9);
        expect(pack.packGainTicks).toBeGreaterThan(model.tightTicks);
        expect(pack.row.status).toBe('ok');
    });

    it('rises with the strength: a stronger rally gains more', () => {
        const gain = (/** @type {number} */ rallyThrust) => budgetPack(arenaConfig({ rallyThrust }), model).packGain;
        expect(gain(0.1)).toBeGreaterThan(0);
        expect(gain(0.3)).toBeGreaterThan(gain(0.1));
    });

    it('gains nothing from a burn alone, and the burn shows in the energy the chase spends', () => {
        const pack = budgetPack(arenaConfig({ rallyBurn: 0.5 }), model);
        expect(pack.packGain).toBe(0);
        expect(pack.burn).toBeGreaterThan(0);
    });

    it('gains nothing with no level on the hearer, and never reads below the lone hunter', () => {
        const config = arenaConfig({ rallyThrust: 0.5, woundThrust: 0.1 });
        expect(budgetPack(config, model, { levels: {} }).packGain).toBe(0);
        expect(budgetPack(config, model, { levels: { wounded: 3 } }).packGain).toBe(0);
    });
});
