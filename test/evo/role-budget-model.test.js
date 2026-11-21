import { describe, expect, it } from 'vitest';
import { MODEL_DEFAULTS, validateModel } from '../../js/evo/role-budget-model.js';

describe('MODEL_DEFAULTS', () => {
    it('holds the options of the plan, frozen', () => {
        expect(MODEL_DEFAULTS).toEqual({
            reactionTicks: 2,
            hearThreshold: 0.1,
            breakAngle: Math.PI / 2,
            tightTicks: 5,
            preySprint: 'rationed',
            hunterShare: 0.1,
            foodDensity: null,
            naiveEffort: 0.5,
            catchShare: 0.3,
            defenderGap: 150,
            escortGap: null,
            smokeGap: 240,
            reliableSight: false,
        });
        expect(Object.isFrozen(MODEL_DEFAULTS)).toBe(true);
    });
});

describe('validateModel', () => {
    it('returns the defaults for no overrides and a frozen merge for some', () => {
        expect(validateModel()).toEqual(MODEL_DEFAULTS);
        const model = validateModel({ reactionTicks: 4, foodDensity: 0.001, preySprint: 'always' });
        expect(model.reactionTicks).toBe(4);
        expect(model.foodDensity).toBe(0.001);
        expect(model.tightTicks).toBe(5);
        expect(Object.isFrozen(model)).toBe(true);
    });

    it('refuses an unknown option, naming it', () => {
        expect(() => validateModel({ reactionTick: 3 })).toThrow(/unknown option "reactionTick"/);
    });

    it.each([
        ['defenderGap', 0],
        ['escortGap', 0],
        ['escortGap', 'x'],
        ['smokeGap', -1],
        ['reactionTicks', 1.5],
        ['reactionTicks', -1],
        ['hearThreshold', 1],
        ['breakAngle', 0],
        ['tightTicks', 'x'],
        ['preySprint', 'never'],
        ['hunterShare', 2],
        ['foodDensity', 0],
        ['naiveEffort', 0],
        ['catchShare', 1.1],
        ['reliableSight', 1],
        ['reactionTicks', 'x'],
        ['hearThreshold', 'x'],
        ['breakAngle', 'x'],
        ['breakAngle', 4],
        ['tightTicks', -1],
        ['hunterShare', 'x'],
        ['foodDensity', 'x'],
        ['naiveEffort', 'x'],
        ['naiveEffort', 2],
        ['catchShare', 'x'],
    ])('refuses %s = %j, naming the key', (key, value) => {
        expect(() => validateModel({ [key]: value })).toThrow(new RegExp(`bad value for "${key}"`));
    });
});
