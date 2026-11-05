import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../../js/sim/events.js';
import { GENE_OUTPUTS, OUTPUT_INDEX, inputOffsets } from '../../../js/sim/brain-layout.js';
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
        const { policy, world } = setup({}, { mutationRate: 1 }); // every gene mutates: the test is about the step size
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
        const { row, rng, world } = born({ mutationRate: 1 });
        const ref = createRng(31);
        const sigma = mutateSigma(Math.fround(0.05), world.layout.weightCount, ref);
        const expected = new Float32Array(world.layout.weightCount).fill(0.5);
        mutateWeights(expected, sigma, ref, { traitStart: world.layout.traitStart });
        expect(row).toEqual(expected);
        expect(rng.s).toEqual(ref.s);
    });

    it('mutationRate invsqrt, the default, moves about sqrt(weightCount) genes', () => {
        const { row, world } = born({});
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

    it('weightDecay 0 leaves the silent inputs rows as the mutation left them', () => {
        const child = (/** @type {number} */ weightDecay) => {
            const world = smallWorld({ brainHidden: 4, maxAgents: 8, weightDecay, mutationRate: 0.000001 });
            const birth = createBirth(world.config);
            const { layout } = world;
            world.weights.fill(0.5, 0, layout.weightCount);
            world.inputActivity.rare[2] = 1;
            birth.sigma[0] = 0.05;
            birth.childBrain(world, 1, 0, { cause: BORN_CAUSE.SPLIT, rng: createRng(32) });
            return world.weights[layout.weightCount + layout.wIn + 2 * layout.hidden];
        };
        expect(Math.abs(child(0) - 0.5)).toBeLessThan(0.01);
        expect(child(0.1)).toBeLessThan(0.46);
    });
});

describe('the hunter reflexes at birth', () => {
    const FORAGER = 0;
    const PREDATOR = 1;
    const { THRUST, TURN, BITE } = OUTPUT_INDEX;

    /**
     * @param {{over?: Record<string, any>, mother: number, child: number, cause?: number}} birth config overrides, the mother's
     *   and child's specialisation and the cause
     * @returns {{row: Float32Array, rng: any, world: any}} the child row after a birth from a zero row, and the stream
     */
    function born({ over = {}, mother, child, cause = BORN_CAUSE.SPLIT }) {
        const world = smallWorld({ brainHidden: 4, maxAgents: 8, instinctWeight: 1, ...over });
        const birth = createBirth(world.config);
        const { weightCount } = world.layout;
        world.weights.fill(0, 0, 2 * weightCount);
        world.fatherWeights.fill(0);
        world.spec[0] = mother;
        world.spec[1] = child;
        birth.sigma[0] = 0.05;
        birth.fatherSigma[0] = 0.05;
        const rng = createRng(31);
        birth.childBrain(world, 1, 0, { cause, rng });
        return { row: world.weights.slice(weightCount, 2 * weightCount), rng, world };
    }

    /**
     * @param {any} world the world
     * @param {string} channel a pooled channel
     * @param {number} part 0 strength, 2 sine
     * @param {number} output an `OUTPUT_INDEX` value
     * @returns {number} the index of that skip weight
     */
    function cell(world, channel, part, output) {
        const base = inputOffsets(world.config).pooled[channel];
        return world.layout.wSkip + (base + part) * world.layout.geneOutputs + GENE_OUTPUTS.indexOf(output);
    }

    /**
     * @param {Float32Array} a a row
     * @param {Float32Array} b a row
     * @returns {number[]} the sorted indices where they differ
     */
    function differing(a, b) {
        return Array.from(a, (v, i) => (v === b[i] ? -1 : i))
            .filter((i) => i >= 0)
            .sort((x, y) => x - y);
    }

    for (const [name, cause] of [
        ['a split', BORN_CAUSE.SPLIT],
        ['a mating', BORN_CAUSE.MATE],
    ]) {
        it(`gives a flip child of a non-hunter the prey terms by ${name}, and draws the same stream`, () => {
            const off = born({ mother: FORAGER, child: PREDATOR, cause });
            const on = born({ over: { flipReflex: true }, mother: FORAGER, child: PREDATOR, cause });
            const { world } = on;
            const thrust = cell(world, 'prey', 0, THRUST);
            const turn = cell(world, 'prey', 2, TURN);
            const bite = cell(world, 'prey', 0, BITE);
            expect(differing(on.row, off.row)).toEqual([thrust, turn, bite].sort((x, y) => x - y));
            expect(on.row[thrust] - off.row[thrust]).toBeCloseTo(1, 5);
            expect(on.row[turn] - off.row[turn]).toBeCloseTo(1, 5);
            expect(on.row[bite] - off.row[bite]).toBeCloseTo(2, 5);
            expect(on.rng.s).toEqual(off.rng.s);
        });
    }

    it('gives no prey terms to a hunter child of a hunter, a non-hunter child, or with flipReflex off', () => {
        const over = { flipReflex: true };
        expect(born({ over, mother: PREDATOR, child: PREDATOR }).row).toEqual(
            born({ mother: PREDATOR, child: PREDATOR }).row,
        );
        expect(born({ over, mother: FORAGER, child: FORAGER }).row).toEqual(
            born({ mother: FORAGER, child: FORAGER }).row,
        );
        expect(born({ over, mother: PREDATOR, child: FORAGER }).row).toEqual(
            born({ mother: PREDATOR, child: FORAGER }).row,
        );
        expect(born({ mother: FORAGER, child: PREDATOR }).row).toEqual(
            born({ over: { flipReflex: false }, mother: FORAGER, child: PREDATOR }).row,
        );
    });

    it('raises the kin cells of every hunter child under juvenileDependency, and no other', () => {
        const over = { juvenileDependency: true, kinPullWeight: 0.5 };
        for (const mother of [FORAGER, PREDATOR]) {
            const off = born({ mother, child: PREDATOR });
            const on = born({ over, mother, child: PREDATOR });
            const { world } = on;
            const cells = [cell(world, 'kin', 0, THRUST), cell(world, 'kin', 2, TURN)].sort((x, y) => x - y);
            expect(differing(on.row, off.row)).toEqual(cells);
            expect(on.row[cells[0]]).toBeGreaterThanOrEqual(0.5 - 1e-6);
            expect(on.rng.s).toEqual(off.rng.s);
        }
        expect(born({ over, mother: PREDATOR, child: FORAGER }).row).toEqual(
            born({ mother: PREDATOR, child: FORAGER }).row,
        );
    });

    it('changes nothing at instinctWeight 0', () => {
        const over = { flipReflex: true, juvenileDependency: true, instinctWeight: 0 };
        expect(born({ over, mother: FORAGER, child: PREDATOR }).row).toEqual(
            born({ over: { instinctWeight: 0 }, mother: FORAGER, child: PREDATOR }).row,
        );
    });
});
