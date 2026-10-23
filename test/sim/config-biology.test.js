import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

describe('biology feature keys', () => {
    it('is false with the features off (FEATURES_OFF)', () => {
        expect(createConfig({ ...FEATURES_OFF }).leakEnabled).toBe(false);
    });

    it('accepts a boolean leakEnabled and rejects other types', () => {
        expect(createConfig({ ...FEATURES_OFF, leakEnabled: true }).leakEnabled).toBe(true);
        expect(() => createConfig({ ...FEATURES_OFF, leakEnabled: 1 })).toThrow(/leakEnabled/);
    });

    it('is 0 with the features off, and accepts a non-negative number only', () => {
        expect(createConfig({ ...FEATURES_OFF }).hebbianRate).toBe(0);
        expect(createConfig({ ...FEATURES_OFF, hebbianRate: 0.01 }).hebbianRate).toBe(0.01);
        expect(() => createConfig({ ...FEATURES_OFF, hebbianRate: -0.1 })).toThrow(/hebbianRate/);
        expect(() => createConfig({ ...FEATURES_OFF, hebbianRate: 'x' })).toThrow(/hebbianRate/);
    });
});

describe('trait keys', () => {
    it('is false with the features off, and visionCost is 0.5', () => {
        expect(createConfig({ ...FEATURES_OFF }).traitsEnabled).toBe(false);
        expect(DEFAULTS.visionCost).toBe(0.5);
    });

    it('validates their types and ranges', () => {
        expect(() => createConfig({ ...FEATURES_OFF, traitsEnabled: 'yes' })).toThrow(/traitsEnabled/);
        expect(() => createConfig({ ...FEATURES_OFF, visionCost: -1 })).toThrow(/visionCost/);
        expect(createConfig({ ...FEATURES_OFF, visionCost: 0 }).visionCost).toBe(0);
    });
});
