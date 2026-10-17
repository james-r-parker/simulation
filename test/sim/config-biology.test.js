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
});
