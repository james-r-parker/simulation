import { describe, expect, it } from 'vitest';
import { createObserverScratch } from '../../js/sim/observer-scratch.js';

describe('observer scratch', () => {
    it('allocates per-slot observation arrays outside the world hash rows', () => {
        const scratch = createObserverScratch({ maxAgents: 7, maxContacts: 11 });

        expect(scratch.fatalBiteObservations).toBeInstanceOf(Float64Array);
        expect(scratch.fatalBiteObservations).toHaveLength(56);
        expect(scratch.recoilEnergyLife).toHaveLength(7);
        expect(scratch.biteSkipParent).toHaveLength(7);
        expect(scratch.thrustSkipParent).toHaveLength(7);
        expect(scratch.contacts).toHaveLength(22);
        expect(scratch.eatContacts).toHaveLength(4);
        expect(scratch.ledger).toHaveLength(2);
        expect(scratch.point).toHaveLength(2);
    });
});
