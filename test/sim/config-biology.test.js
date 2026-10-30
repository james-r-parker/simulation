import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('biology feature keys', () => {
    it('defaults hebbianRate to 0.0001, and accepts a non-negative number only', () => {
        expect(createConfig({}).hebbianRate).toBe(0.0001);
        expect(createConfig({ ...SIMPLE_WORLD, hebbianRate: 0.01 }).hebbianRate).toBe(0.01);
        expect(() => createConfig({ ...SIMPLE_WORLD, hebbianRate: -0.1 })).toThrow(/hebbianRate/);
        expect(() => createConfig({ ...SIMPLE_WORLD, hebbianRate: 'x' })).toThrow(/hebbianRate/);
    });
});

describe('trait keys', () => {
    it('has a visionCost of 0.5', () => {
        expect(DEFAULTS.visionCost).toBe(0.5);
    });

    it('validates their types and ranges', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, visionCost: -1 })).toThrow(/visionCost/);
        expect(createConfig({ ...SIMPLE_WORLD, visionCost: 0 }).visionCost).toBe(0);
    });
});
