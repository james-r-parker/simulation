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

describe('birth mutation of the trait and leak genes', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {number[]} the child's trait genes after a split from a mother whose genes are all 0
     */
    function childGenes(over) {
        const { policy, world } = setup();
        world.config = { ...world.config, ...over };
        const { layout } = world;
        world.alive[0] = 1;
        world.weights.fill(0, 0, layout.weightCount);
        policy.sigma[0] = 0.002;
        policy.brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(5) });
        const from = layout.weightCount + layout.traitStart;
        return Array.from(world.weights.subarray(from, from + 4));
    }

    it('uses the weight sigma while every biology feature is off and TRAIT_SIGMA once one is on', () => {
        const off = childGenes({});
        const on = childGenes({ leakEnabled: true });
        expect(Math.max(...off.map(Math.abs))).toBeLessThan(0.02);
        expect(Math.max(...on.map(Math.abs))).toBeGreaterThan(0.01);
    });
});
