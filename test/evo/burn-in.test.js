import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { BURN_IN_TICKS as FROM_OBSERVER } from '../../js/evo/observer-events.js';

describe('burn-in', () => {
    it('is one value, shared by the observer re-export', () => {
        expect(BURN_IN_TICKS).toBe(10000);
        expect(FROM_OBSERVER).toBe(BURN_IN_TICKS);
    });
});
