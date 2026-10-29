import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { createRng } from '../../../js/sim/rng.js';
import { occupiedCount } from '../../../js/evo/archive.js';
import { setup } from '../helpers/map-elites-world.js';

describe('map-elites-v1 shape', () => {
    it('exposes the archive and the per-slot state', () => {
        const { policy } = setup();
        expect(policy.name).toBe('map-elites-v1');
        expect(policy.fitnessName).toBe('v1');
        expect(occupiedCount(policy.archive)).toBe(0);
        expect(policy.sigma).toHaveLength(8);
        expect(policy.fatherSigma).toHaveLength(8);
        expect(policy.archiveRef.every((/** @type {number} */ v) => v === -1)).toBe(true);
        expect(policy.isClone).toHaveLength(8);
        expect(policy.refId).toHaveLength(8);
    });

    it('tells the observer which entrants came from the archive, and clears the mark for a child', () => {
        const observer = /** @type {Record<string, any>} */ ({});
        const { policy, world } = setup({ observer });
        policy.fromArchive[3] = 1;
        expect(observer.archiveDraw(3)).toBe(true);
        expect(observer.archiveDraw(4)).toBe(false);
        world.alive[0] = 1;
        policy.brain.childBrain(world, 3, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(1) });
        expect(observer.archiveDraw(3)).toBe(false);
    });
});
