// The evolution-side costs of a brain: mutating, crossing and drawing genomes, at the default layout (32 hidden).
import { applyInstinct } from '../../js/evo/instinct.js';
import { crossNeurons } from '../../js/evo/crossover.js';
import { mutateWeights, randomWeights } from '../../js/evo/mutation.js';
import { resolveMutationRate } from '../../js/sim/mutation-rate.js';
import { microRng, microSuite, microWorld } from './fixture.js';

const world = microWorld();
const { layout, config } = world;
const W = layout.weightCount;
const rowOf = (/** @type {number} */ slot) => world.weights.slice(slot * W, (slot + 1) * W);
const row = rowOf(0);
const mother = rowOf(1);
const father = rowOf(2);
const child = new Float32Array(W);
const fresh = new Float32Array(W);
const invsqrt = resolveMutationRate('invsqrt', W);
const mutateRng = microRng('brain-mutate');
const crossRng = microRng('brain-cross');
const initRng = microRng('brain-init');
const context = { layout, rng: crossRng };
// One options object per rate, built here so the timed body allocates nothing.
const at = (/** @type {number} */ rate) => ({ traitStart: layout.traitStart, rate });
const full = at(1);
const inv = at(invsqrt);
const tenth = at(0.1);
const hunter = { weight: config.instinctWeight, canHunt: true };
const grazer = { weight: config.instinctWeight, canHunt: false };

microSuite('brain-evo', [
    [`mutateWeights, ${W} genes, rate 1`, () => mutateWeights(row, 0.05, mutateRng, full)],
    [`mutateWeights, ${W} genes, rate invsqrt`, () => mutateWeights(row, 0.05, mutateRng, inv)],
    [`mutateWeights, ${W} genes, rate 0.1`, () => mutateWeights(row, 0.05, mutateRng, tenth)],
    [`crossNeurons, ${W} genes`, () => crossNeurons(child, mother, father, context)],
    [`randomWeights, ${W} genes`, () => randomWeights(fresh, layout, initRng, config.leakGeneStart)],
    ['applyInstinct, hunter', () => applyInstinct(fresh, layout, hunter)],
    [
        'randomWeights + applyInstinct',
        () => {
            randomWeights(fresh, layout, initRng, config.leakGeneStart);
            applyInstinct(fresh, layout, grazer);
        },
    ],
]);
