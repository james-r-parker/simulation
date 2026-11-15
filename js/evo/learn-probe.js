// The learn probe (senses-and-motor.md, Lesson probes): evolves a population of random brains directly on one lesson's
// win share and reports the best it reaches. It answers whether the lesson is reachable by this brain with this
// mutation when asked for directly. It selects on a detector score, so its populations are thrown away: nothing here is
// offered to an archive, exported, written to a file or seeded into a world, and no genome leaves `learnLesson`'s
// scratch. Pure: no files, no clock; a population replays bit for bit from its seed.

import { brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { resolveMutationRate } from '../sim/mutation-rate.js';
import { createRng, fork } from '../sim/rng.js';
import { drillSubject } from './drill.js';
import { SIGMA_START, mutateSigma, mutateWeights, randomWeights } from './mutation.js';

/** Populations the probe evolves per lesson. */
export const LEARN_SEEDS = 8;
/** Brains per population. */
export const LEARN_POPULATION = 64;
/** Generations per population. */
export const LEARN_GENERATIONS = 200;
/** Trials each brain plays per generation (the same trials for every brain of a generation). */
export const LEARN_TRIALS = 4;
/** Brains that parent the next generation. */
export const LEARN_PARENTS = 16;
/** Fresh trials the final best brain is scored on (it never saw them). */
export const LEARN_FINAL_TRIALS = 32;
/** Seeds between two generations' trial sets, so no two generations share a world seed. */
const TRIAL_STRIDE = 1000;

/**
 * @typedef {object} LearnOptions
 * @property {number} [seed] the population's seed (default 1)
 * @property {number} [generations] generations (default `LEARN_GENERATIONS`)
 * @property {number} [population] brains per generation (default `LEARN_POPULATION`)
 * @property {number} [trials] trials per brain per generation (default `LEARN_TRIALS`)
 * @property {number} [finalTrials] fresh trials for the final score (default `LEARN_FINAL_TRIALS`)
 * @property {Record<string, any>} [config] config overrides the arena is built from (default none)
 * @property {import('../sim/log.js').SimLog} [log] receives `LearnGeneration` at debug level
 */

/**
 * @typedef {object} LearnResult
 * @property {string} lesson the drill's name
 * @property {number} seed the population's seed
 * @property {number[]} curve the best win share of each generation, on that generation's trials
 * @property {number} reached the final best brain's win share on `finalTrials` fresh trials
 */

/**
 * @typedef {object} Brain
 * @property {Float32Array} row the weight row
 * @property {number} sigma the brain's mutation step size
 */

/**
 * @param {Brain} brain a brain
 * @param {import('./drill-scenarios.js').Drill} drill the lesson
 * @returns {import('./memory-probe-run.js').Subject} the brain as a drill subject
 */
function subjectOf(brain, drill) {
    return { name: 'learn', id: 0, spec: drill.spec, weights: brain.row, act: null };
}

/**
 * @param {Brain[]} parents the parents, best first
 * @param {{count: number, config: Readonly<Record<string, any>>, rng: import('../sim/rng.js').Rng}} next how many
 *   children, the config and the mutation stream
 * @returns {Brain[]} the next generation: the best parent unchanged, then mutated copies of the parents in turn
 */
function breed(parents, { count, config, rng }) {
    const layout = brainLayout(config);
    const rate = resolveMutationRate(config.mutationRate, layout.weightCount);
    const children = [parents[0]];
    for (let i = 1; i < count; i++) {
        const parent = parents[(i - 1) % parents.length];
        const sigma = mutateSigma(parent.sigma, layout.weightCount, rng);
        const row = Float32Array.from(parent.row);
        mutateWeights(row, sigma, rng, { traitStart: layout.traitStart, rate });
        children.push({ row, sigma });
    }
    return children;
}

/**
 * @param {import('./drill-scenarios.js').Drill} drill the lesson
 * @param {{seed: number, population: number, config: Readonly<Record<string, any>>}} start the seed, the size and the config
 * @returns {Brain[]} random brains, drawn as the live trainer draws a random genome
 */
function randomPopulation(drill, { seed, population, config }) {
    const layout = brainLayout(config);
    const rng = fork(createRng(seed), `learn-probe:${drill.name}:init`);
    return Array.from({ length: population }, () => {
        const row = new Float32Array(layout.weightCount);
        randomWeights(row, layout, rng, config.leakGeneStart);
        return { row, sigma: SIGMA_START };
    });
}

/**
 * Evolves one population on one lesson.
 * @param {import('./drill-scenarios.js').Drill} drill the lesson (a drill)
 * @param {LearnOptions} [options] the options
 * @returns {LearnResult} the curve and the final score; the population is discarded
 */
export function learnLesson(drill, options = {}) {
    const {
        seed = 1,
        generations = LEARN_GENERATIONS,
        population = LEARN_POPULATION,
        trials = LEARN_TRIALS,
        finalTrials = LEARN_FINAL_TRIALS,
        config: overrides = {},
        log,
    } = options;
    const config = createConfig(overrides);
    const rng = fork(createRng(seed), `learn-probe:${drill.name}`);
    let brains = randomPopulation(drill, { seed, population, config });
    /** @type {number[]} */
    const curve = [];
    let ranked = brains;
    for (let g = 0; g < generations; g++) {
        const trialSeed = (seed + 1) * TRIAL_STRIDE * TRIAL_STRIDE + g * TRIAL_STRIDE;
        const scores = new Map(
            brains.map((b) => [
                b,
                drillSubject(drill, subjectOf(b, drill), { config: overrides, seed: trialSeed, trials }).winShare,
            ]),
        );
        ranked = [...brains].sort(
            (a, b) => /** @type {number} */ (scores.get(b)) - /** @type {number} */ (scores.get(a)),
        );
        const best = /** @type {number} */ (scores.get(ranked[0]));
        curve.push(best);
        log?.log('debug', 'LearnGeneration', { lesson: drill.name, seed, generation: g, best });
        brains = breed(ranked.slice(0, LEARN_PARENTS), { count: population, config, rng });
    }
    const finalSeed = (seed + 1) * TRIAL_STRIDE * TRIAL_STRIDE + generations * TRIAL_STRIDE;
    const reached = drillSubject(drill, subjectOf(ranked[0], drill), {
        config: overrides,
        seed: finalSeed,
        trials: finalTrials,
    }).winShare;
    return { lesson: drill.name, seed, curve, reached };
}

/** A lesson counts as reached at this best-of-generation win share. */
export const REACHED_SHARE = 0.9;

/**
 * @param {readonly number[]} curve a population's best win share per generation
 * @param {number} [share] the win share that counts as reached (default `REACHED_SHARE`)
 * @returns {number | null} the first generation (counted from 1) whose best reached `share`, or null when none did
 */
export function generationsToReach(curve, share = REACHED_SHARE) {
    const at = curve.findIndex((best) => best >= share);
    return at < 0 ? null : at + 1;
}
