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
