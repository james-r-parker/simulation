import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEFAULTS } from '../../js/sim/config-defaults.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('cover config', () => {
    it('defaults the switch off', () => {
        expect(DEFAULTS.coverConceals).toBe(false);
        expect(DEFAULTS.refugeCount).toBe(8);
    });

    it('accepts the switch on', () => {
        const config = createConfig({ ...SIMPLE_WORLD, coverConceals: true });
        expect(config.coverConceals).toBe(true);
    });

    it('rejects a non-boolean coverConceals naming the key', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, coverConceals: 1 })).toThrow(/coverConceals/);
    });

    it('does not define the dropped keys', () => {
        for (const key of ['coverBiteGuard', 'coverBiteFactor', 'refugeSlack']) {
            expect(DEFAULTS).not.toHaveProperty(key);
        }
    });
});
