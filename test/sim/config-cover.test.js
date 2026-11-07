import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('cover config', () => {
    it('defaults to eight refuges', () => {
        expect(DEFAULTS.refugeCount).toBe(8);
    });

    it('no longer has the adopted switches as keys', () => {
        for (const key of ['coverConceals', 'coverFoodFree', 'refugeSense']) {
            expect(DEFAULTS).not.toHaveProperty(key);
            expect(() => createConfig({ ...SIMPLE_WORLD, [key]: true })).toThrow(new RegExp(key));
        }
    });

    it('does not define the dropped keys', () => {
        for (const key of ['coverBiteGuard', 'coverBiteFactor', 'refugeSlack']) {
            expect(DEFAULTS).not.toHaveProperty(key);
        }
    });
});
