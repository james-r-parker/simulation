import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/sim/burn-in.js';
import { BURN_IN_TICKS as FROM_EVO } from '../../js/evo/burn-in.js';

describe('burn-in (sim)', () => {
    it('is 10000 ticks, and the evo module re-exports the same value', () => {
        expect(BURN_IN_TICKS).toBe(10000);
        expect(FROM_EVO).toBe(BURN_IN_TICKS);
    });
});
