import { describe, expect, it } from 'vitest';
import { FEATURE_RULES, UNIT, int, num, positive } from '../../js/sim/config-rules.js';
import { createConfig } from '../../js/sim/config.js';

describe('config rules', () => {
    it('builds int, num, positive and unit rules', () => {
        expect(int(1, 5)).toEqual({ type: 'int', min: 1, max: 5 });
        expect(num(0)).toEqual({ type: 'num', min: 0, max: Infinity });
        expect(positive()).toEqual({ type: 'num', gt: 0 });
        expect(UNIT).toEqual({ type: 'num', min: 0, max: 1 });
    });

    it('covers every feature key with a rule the defaults pass', () => {
        const config = createConfig({});
        for (const key of Object.keys(FEATURE_RULES)) {
            expect(config).toHaveProperty(key);
        }
        expect(() => createConfig({ foodPatchCount: 257 })).toThrow(/foodPatchCount/);
        expect(() => createConfig({ hebbianRate: 2 })).toThrow(/hebbianRate/);
    });
});

describe('mateDistanceMax rule', () => {
    it('defaults to Infinity and accepts it, and any finite number above 0', () => {
        expect(createConfig({}).mateDistanceMax).toBe(Infinity);
        expect(createConfig({ mateDistanceMax: Infinity }).mateDistanceMax).toBe(Infinity);
        expect(createConfig({ mateDistanceMax: 0.8 }).mateDistanceMax).toBe(0.8);
    });

    it.each([0, -1, NaN, -Infinity, '0.8'])('rejects %s', (value) => {
        expect(() => createConfig({ mateDistanceMax: value })).toThrow(/mateDistanceMax/);
    });
});

describe('sexes keys', () => {
    it('default to off with a splitCost of 50', () => {
        const c = createConfig({});
        expect([c.sexesEnabled, c.splitCost]).toEqual([false, 50]);
    });

    it.each([
        ['sexesEnabled', 1],
        ['splitCost', -1],
    ])('rejects a bad %s', (key, value) => {
        expect(() => createConfig({ [key]: value })).toThrow(new RegExp(key));
    });
});
