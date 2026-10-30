import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { createRng } from '../../../js/sim/rng.js';
import { mutateSigma, mutateWeights } from '../../../js/evo/mutation.js';
import { createBirth } from '../../../js/evo/policies/natural-birth.js';
import { smallWorld } from '../../sim/helpers/small-world.js';
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
     * @returns {number[]} the child's trait genes after a split from a mother whose genes are all 0
     */
    function childGenes() {
        const { policy, world } = setup();
        const { layout } = world;
        world.alive[0] = 1;
        world.weights.fill(0, 0, layout.weightCount);
        policy.sigma[0] = 0.002;
        policy.brain.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(5) });
        const from = layout.weightCount + layout.traitStart;
        return Array.from(world.weights.subarray(from, from + 4));
    }

    it('steps the trait genes by TRAIT_SIGMA, not the weight sigma', () => {
        expect(Math.max(...childGenes().map(Math.abs))).toBeGreaterThan(0.01);
    });
});

describe('birth mutation keys', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {{row: Float32Array, rng: any, birth: any, world: any}} the child row after a split from a mother whose
     *   genes are all 0.5, and the stream after the draws
     */
    function born(over) {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8, ...over });
        const birth = createBirth(world.config);
        const { weightCount } = world.layout;
        world.weights.fill(0.5, 0, weightCount);
        birth.sigma[0] = 0.05;
        const rng = createRng(31);
        birth.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng });
        return { row: world.weights.slice(weightCount, 2 * weightCount), rng, birth, world };
    }

    it('mutationRate 1 draws exactly as the unkeyed rule: sigma, then one Gaussian per gene', () => {
        const { row, rng, world } = born({});
        const ref = createRng(31);
        const sigma = mutateSigma(Math.fround(0.05), world.layout.weightCount, ref);
        const expected = new Float32Array(world.layout.weightCount).fill(0.5);
        mutateWeights(expected, sigma, ref, { traitStart: world.layout.traitStart });
        expect(row).toEqual(expected);
        expect(rng.s).toEqual(ref.s);
    });

    it('mutationRate invsqrt moves about sqrt(weightCount) genes', () => {
        const { row, world } = born({ mutationRate: 'invsqrt' });
        const hit = row.filter((w) => w !== 0.5).length;
        const expected = Math.sqrt(world.layout.weightCount);
        expect(hit).toBeGreaterThan(expected / 3);
        expect(hit).toBeLessThan(expected * 3);
    });

    it('weightDecay shrinks only the silent inputs rows, after the mutation draws', () => {
        const plain = born({});
        const silent = born({ weightDecay: 0.1 });
        expect(silent.rng.s).toEqual(plain.rng.s);
        expect(silent.row).toEqual(plain.row);
    });

    it('weightDecay with a silent mask decays those rows and nothing else', () => {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8, weightDecay: 0.1, mutationRate: 0.000001 });
        const birth = createBirth(world.config);
        const { layout } = world;
        world.weights.fill(0.5, 0, layout.weightCount);
        world.inputActivity.rare[2] = 1; // the world's silent mask
        birth.sigma[0] = 0.05;
        birth.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(32) });
        const child = world.weights.slice(layout.weightCount, 2 * layout.weightCount);
        child.forEach((/** @type {number} */ w, /** @type {number} */ g) => {
            const decayed = g >= layout.wIn + 2 * layout.hidden && g < layout.wIn + 3 * layout.hidden;
            expect(Math.abs(w - (decayed ? 0.45 : 0.5))).toBeLessThan(0.01);
        });
        expect(child[layout.wIn + 2 * layout.hidden]).toBeLessThan(0.46);
        expect(child[layout.wIn]).toBeGreaterThan(0.49);
    });
});
