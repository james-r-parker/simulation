import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('cover config', () => {
    it('defaults both switches off', () => {
        expect(DEFAULTS.coverConceals).toBe(false);
        expect(DEFAULTS.coverFoodFree).toBe(false);
        expect(DEFAULTS.refugeCount).toBe(8);
    });

    it('accepts both switches on', () => {
        const config = createConfig({ ...SIMPLE_WORLD, coverConceals: true, coverFoodFree: true });
        expect(config.coverConceals).toBe(true);
        expect(config.coverFoodFree).toBe(true);
    });

    it.each(['coverConceals', 'coverFoodFree'])('rejects a non-boolean %s naming the key', (key) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: 1 })).toThrow(new RegExp(key));
    });

    it('does not define the dropped keys', () => {
        for (const key of ['coverBiteGuard', 'coverBiteFactor', 'refugeSlack']) {
            expect(DEFAULTS).not.toHaveProperty(key);
        }
    });
});
