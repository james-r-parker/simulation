import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { SPEC_RADIX, hunterTable } from '../../js/evo/hunter-table.js';

describe('hunterTable', () => {
    it('is 1 exactly at the specialisation indices that can hunt', () => {
        const config = createConfig({});
        const table = hunterTable(config);
        expect(table.length).toBe(SPEC_RADIX);
        for (const spec of Object.values(config.specialisations)) {
            const s = /** @type {any} */ (spec);
            expect(table[s.index]).toBe(s.canHunt ? 1 : 0);
        }
        expect(table.some((v) => v === 1)).toBe(true);
    });
});
