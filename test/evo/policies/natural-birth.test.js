import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { createRng } from '../../../js/sim/rng.js';
import { setup } from '../helpers/map-elites-world.js';

describe('births', () => {
    it('does not make the child of a clone a clone', () => {
        const { policy, world } = setup();
        world.alive[0] = 1;
        policy.isClone[0] = 1;
        policy.archiveRef[0] = 5;
        policy.refId[0] = 77;
        policy.sigma[0] = 0.05;
        policy.isClone[1] = 1;
        policy.archiveRef[1] = 5;
        policy.refId[1] = 77;
        policy.brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(1) });
        expect(policy.isClone[1]).toBe(0);
        expect(policy.archiveRef[1]).toBe(-1);
        expect(policy.refId[1]).toBe(0);
        expect(policy.isClone[0]).toBe(1);
    });
});
