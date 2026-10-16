import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../../../js/evo/archive.js';
import { POLICIES } from '../../../js/evo/policies/index.js';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { setup } from '../helpers/map-elites-world.js';

describe('map-elites-v1 shape', () => {
    it('is registered and exposes the archive and the per-slot state', () => {
        const { policy } = setup();
        expect(POLICIES['map-elites-v1'].create).toBe(createMapElitesV1);
        expect(policy.name).toBe('map-elites-v1');
        expect(policy.fitnessName).toBe('v1');
        expect(occupiedCount(policy.archive)).toBe(0);
        expect(policy.sigma).toHaveLength(8);
        expect(policy.fatherSigma).toHaveLength(8);
        expect(policy.archiveRef.every((/** @type {number} */ v) => v === -1)).toBe(true);
        expect(policy.isClone).toHaveLength(8);
        expect(policy.refId).toHaveLength(8);
    });
});
