import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { specParams } from '../../js/sim/spec-params.js';

describe('specParams', () => {
    it('returns the entry whose index matches', () => {
        const config = createConfig({});
        expect(specParams(config, 2)).toBe(config.specialisations.reproducer);
        expect(specParams(config, 3).moveCostMultiplier).toBe(0.7);
    });

    it('throws for an unknown index', () => {
        expect(() => specParams(createConfig({}), 9)).toThrow(/no specialisation has index 9/);
    });
});
