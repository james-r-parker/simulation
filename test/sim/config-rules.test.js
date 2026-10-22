import { describe, expect, it } from 'vitest';
import { FEATURE_RULES, UNIT, int, num, positive } from '../../js/sim/config-rules.js';
import { createConfig } from '../../js/sim/config.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

describe('config rules', () => {
    it('builds int, num, positive and unit rules', () => {
        expect(int(1, 5)).toEqual({ type: 'int', min: 1, max: 5 });
        expect(num(0)).toEqual({ type: 'num', min: 0, max: Infinity });
        expect(positive()).toEqual({ type: 'num', gt: 0 });
        expect(UNIT).toEqual({ type: 'num', min: 0, max: 1 });
    });

    it('covers every feature key with a rule the defaults pass', () => {
        const config = createConfig({ ...FEATURES_OFF });
        for (const key of Object.keys(FEATURE_RULES)) {
            expect(config).toHaveProperty(key);
        }
        expect(() => createConfig({ ...FEATURES_OFF, foodPatchCount: 257 })).toThrow(/foodPatchCount/);
        expect(() => createConfig({ ...FEATURES_OFF, hebbianRate: 2 })).toThrow(/hebbianRate/);
    });
});

describe('mateDistanceMax rule', () => {
    it('defaults to Infinity and accepts it, and any finite number above 0', () => {
        expect(createConfig({ ...FEATURES_OFF }).mateDistanceMax).toBe(Infinity);
        expect(createConfig({ ...FEATURES_OFF, mateDistanceMax: Infinity }).mateDistanceMax).toBe(Infinity);
        expect(createConfig({ ...FEATURES_OFF, mateDistanceMax: 0.8 }).mateDistanceMax).toBe(0.8);
    });

    it.each([0, -1, NaN, -Infinity, '0.8'])('rejects %s', (value) => {
        expect(() => createConfig({ ...FEATURES_OFF, mateDistanceMax: value })).toThrow(/mateDistanceMax/);
    });
});

describe('sexes keys', () => {
    it('default to off', () => {
        expect(createConfig({ ...FEATURES_OFF }).sexesEnabled).toBe(false);
    });

    it('rejects a bad sexesEnabled', () => {
        expect(() => createConfig({ ...FEATURES_OFF, sexesEnabled: 1 })).toThrow(/sexesEnabled/);
    });
});

describe('birth budget keys', () => {
    it('default to a 3000 tick window and the budget off', () => {
        const c = createConfig({ ...FEATURES_OFF });
        expect([c.birthWindowTicks, c.maxBirthsPerWindow]).toEqual([3000, 0]);
    });

    it.each([
        ['birthWindowTicks', 0],
        ['maxBirthsPerWindow', -1],
        ['maxBirthsPerWindow', 1.5],
        ['maxBirthsPerWindow', 17],
    ])('rejects a bad %s', (key, value) => {
        expect(() => createConfig({ ...FEATURES_OFF, [key]: value })).toThrow(new RegExp(key));
    });
});
