import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';

describe('biology feature keys', () => {
    it('defaults leakEnabled to false (features land off)', () => {
        expect(DEFAULTS.leakEnabled).toBe(false);
    });

    it('accepts a boolean leakEnabled and rejects other types', () => {
        expect(createConfig({ leakEnabled: true }).leakEnabled).toBe(true);
        expect(() => createConfig({ leakEnabled: 1 })).toThrow(/leakEnabled/);
    });

    it('defaults hebbianRate to 0 and accepts a non-negative number only', () => {
        expect(DEFAULTS.hebbianRate).toBe(0);
        expect(createConfig({ hebbianRate: 0.01 }).hebbianRate).toBe(0.01);
        expect(() => createConfig({ hebbianRate: -0.1 })).toThrow(/hebbianRate/);
        expect(() => createConfig({ hebbianRate: 'x' })).toThrow(/hebbianRate/);
    });
});

describe('trait keys', () => {
    it('defaults traitsEnabled to false and visionCost to 0.5', () => {
        expect(DEFAULTS.traitsEnabled).toBe(false);
        expect(DEFAULTS.visionCost).toBe(0.5);
    });

    it('validates their types and ranges', () => {
        expect(() => createConfig({ traitsEnabled: 'yes' })).toThrow(/traitsEnabled/);
        expect(() => createConfig({ visionCost: -1 })).toThrow(/visionCost/);
        expect(createConfig({ visionCost: 0 }).visionCost).toBe(0);
    });
});
