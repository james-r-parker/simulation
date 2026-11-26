import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { packCheck } from '../../js/evo/role-budget-pack-check.js';

/** @param {Record<string, any>} over config overrides @returns {ReturnType<typeof packCheck>} the check */
const check = (over) => packCheck(arenaConfig(over), MODEL_DEFAULTS);

describe('packCheck', () => {
    it('reads nine things of the pack row, all against the sim, with no drift at the live numbers', () => {
        const read = check({ rallyThrust: 0.1, rallyBurn: 4 });
        expect(read.readings).toHaveLength(9);
        expect(read.readings.every((r) => r.row === 'pack:forager')).toBe(true);
        expect(read.readings.filter((r) => r.drift)).toEqual([]);
        expect(read.drift).toBe(0);
    });

    it('reads the rally stacks, the lanes and the answered stack at the live numbers', () => {
        const byWhat = Object.fromEntries(check({}).readings.map((r) => [r.what, r]));
        expect(byWhat['rallied stacks of the hearer after one hunt call']).toMatchObject({ formula: 1, scene: 1 });
        expect(byWhat["hearer passiveLoss over the caller's"].scene).toBeCloseTo(5, 6);
        expect(byWhat['the hearer outruns the caller exactly when packGain is above 0']).toMatchObject({
            formula: true,
            scene: true,
        });
    });

    it('agrees at the neutral numbers, where packGain is 0 and the sim raises no stack', () => {
        const read = check({ rallyThrust: 0, rallyBurn: 0 });
        expect(read.drift).toBe(0);
        const gain = read.readings.find((r) => r.what.startsWith('the hearer outruns'));
        expect(gain).toMatchObject({ formula: false, scene: false });
    });

    it('agrees on a planted strong rally and on a weak one', () => {
        expect(check({ rallyThrust: 0.5, rallyBurn: 0.2 }).drift).toBe(0);
        expect(check({ rallyThrust: 0.05 }).drift).toBe(0);
    });
});
