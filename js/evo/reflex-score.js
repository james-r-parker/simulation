// Reflex scores and their bars (brain-reflex-tests.md, Baselines and a valid case): a genome's pass share per case, its
// score (the mean over the cases of its specialisation) and its edge over random brains, and for each case the three
// bars - random brains, constant brains and the scripted reference - that say whether the case separates anything.

import { GENE_OUTPUTS, OUTPUT_INDEX, brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { referenceSubject } from './memory-probe-references.js';
import { randomWeights } from './mutation.js';
import { casesFor } from './reflex-cases.js';
import { evalReflex } from './reflex-eval.js';
import { hueAwareSubject } from './reflex-references.js';
import { tableFor } from './reflex-table.js';

/** Random brains whose mean pass share is a case's baseline (a reflex run is cheap, so the bar can be tight). */
export const REFLEX_RANDOM_BRAINS = 64;
/** A constant brain's output bias: `tanh(5)` is within 1e-4 of full output. */
const FULL = 5;
/** A case is valid when the reference passes at least this much, and the random mean and constant bar at most `MAX_BAR`. */
export const REFERENCE_MIN = 0.9;
export const MAX_BAR = 0.5;

/**
 * @typedef {import('./reflex-eval.js').ReflexSubject} ReflexSubject
 * @typedef {import('./reflex-eval.js').CaseScore} CaseScore
 */

/**
 * @typedef {object} CaseBars the three bars of one case, on its own table
 * @property {number} random the mean pass share of `REFLEX_RANDOM_BRAINS` random brains
 * @property {number} constant the best pass share of the four constant brains
 * @property {number} reference the reference controller's pass share
 * @property {boolean} valid whether the reference passes at least `REFERENCE_MIN` and the other two stay at most `MAX_BAR`
 */

/**
 * @param {import('./reflex-stage.js').ReflexCase} reflexCase the case
 * @param {{config?: Record<string, any>, seed?: number}} [options] the config overrides and the seed
 * @returns {ReflexSubject[]} `REFLEX_RANDOM_BRAINS` random brains of the case's stream `reflex-random:<name>:<i>`
 */
export function reflexRandomBrains(reflexCase, { config = {}, seed = 1 } = {}) {
    const base = createConfig(config);
    const layout = brainLayout(base);
    return Array.from({ length: REFLEX_RANDOM_BRAINS }, (_, i) => {
        const weights = new Float32Array(layout.weightCount);
        const rng = fork(createRng(seed), `reflex-random:${reflexCase.name}:${i}`);
        randomWeights(weights, layout, rng, base.leakGeneStart);
        return { name: `random-${i}`, id: 0, weights, act: null };
    });
}

/**
 * @param {Readonly<Record<string, any>>} base the config
 * @param {Record<number, number>} biases output biases by `OUTPUT_INDEX` value
 * @returns {Float32Array} a brain row whose outputs are those biases whatever it senses (every weight 0)
 */
function constantRow(base, biases) {
    const layout = brainLayout(base);
    const row = new Float32Array(layout.weightCount);
    row.fill(base.leakGeneStart, layout.leakStart, layout.weightCount);
    for (const [output, bias] of Object.entries(biases)) {
        row[layout.bOut + GENE_OUTPUTS.indexOf(Number(output))] = bias;
    }
    return row;
}

/**
 * @param {{config?: Record<string, any>}} [options] the config overrides
 * @returns {ReflexSubject[]} four constant brains: all outputs 0; full thrust and no turn; full thrust and full left
 *   turn; `BITE` always above 0
 */
export function constantBrains({ config = {} } = {}) {
    const base = createConfig(config);
    const { THRUST, TURN, BITE } = OUTPUT_INDEX;
    return [
        ['zero', {}],
        ['thrust', { [THRUST]: FULL }],
        ['thrust-left', { [THRUST]: FULL, [TURN]: FULL }],
        ['bite', { [BITE]: FULL }],
    ].map(([name, biases]) => ({
        name: `constant-${name}`,
        id: 0,
        weights: constantRow(base, /** @type {Record<number, number>} */ (biases)),
        act: null,
    }));
}

/**
 * @param {import('./reflex-stage.js').ReflexCase} reflexCase the case
 * @returns {ReflexSubject} the reference the case's bar uses: the memoryless controller, and for `pick-safe-food`,
 *   which needs the food's hue, the hue-aware one
 */
export function referenceFor(reflexCase) {
    return reflexCase.name === 'pick-safe-food' ? hueAwareSubject() : referenceSubject('memoryless');
}

/**
 * @param {Omit<CaseBars, 'valid'>} bars the bars
 * @returns {boolean} whether the case is valid
 */
export function isValid({ random, constant, reference }) {
    return reference >= REFERENCE_MIN && random <= MAX_BAR && constant <= MAX_BAR;
}

/**
 * Scores subjects on one case, with the case's bars on the same table in the same batch.
 * @param {import('./reflex-stage.js').ReflexCase} reflexCase the case
 * @param {readonly ReflexSubject[]} subjects the subjects to score
 * @param {{config?: Record<string, any>, seed?: number, trials?: number}} [options] the config overrides (default none),
 *   the case seed (default 1) and the trials (default `REFLEX_TRIALS`)
 * @returns {{name: string, scores: CaseScore[], bars: CaseBars}} each subject's score, in order, and the bars
 */
export function evalCase(reflexCase, subjects, options = {}) {
    const { config = {} } = options;
    const table = tableFor(reflexCase, options);
    const random = reflexRandomBrains(reflexCase, options);
    const constants = constantBrains({ config });
    const reference = referenceFor(reflexCase);
    const all = evalReflex([...subjects, ...random, ...constants, reference], [table], { config }).map(
        (record) => record[reflexCase.name],
    );
    const at = subjects.length;
    const mean = (/** @type {CaseScore[]} */ list) => list.reduce((sum, s) => sum + s.passShare, 0) / list.length;
    const bars = {
        random: mean(all.slice(at, at + random.length)),
        constant: Math.max(
            ...all.slice(at + random.length, at + random.length + constants.length).map((s) => s.passShare),
        ),
        reference: all[all.length - 1].passShare,
        valid: false,
    };
    bars.valid = isValid(bars);
    return { name: reflexCase.name, scores: all.slice(0, at), bars };
}

/**
 * @typedef {object} ReflexRow one genome's reflex result
 * @property {Record<string, {passShare: number, edge: number, fast: number}>} cases each case's pass share, edge over
 *   the random baseline and first-row pass share
 * @property {number} score the mean pass share over the cases of the genome's specialisation
 * @property {number} edge the mean edge over the same cases
 * @property {number} fast the mean first-row pass share over the same cases
 */

/**
 * A genome's reflex score and edge: the means over the cases of its specialisation.
 * @param {Record<string, CaseScore>} scores the genome's scores by case name (the cases of its specialisation)
 * @param {Record<string, CaseBars>} bars the bars by case name
 * @returns {ReflexRow | null} the row; null when the specialisation has no case in `scores` (a skipped genome)
 */
export function reflexRow(scores, bars) {
    const names = Object.keys(scores);
    if (names.length === 0) {
        return null;
    }
    /** @type {ReflexRow['cases']} */
    const cases = {};
    for (const name of names) {
        const { passShare, fast } = scores[name];
        cases[name] = { passShare, edge: passShare - bars[name].random, fast };
    }
    const mean = (/** @type {(c: ReflexRow['cases'][string]) => number} */ pick) =>
        names.reduce((sum, name) => sum + pick(cases[name]), 0) / names.length;
    return { cases, score: mean((c) => c.passShare), edge: mean((c) => c.edge), fast: mean((c) => c.fast) };
}

/**
 * @param {number} spec a specialisation index
 * @returns {string[]} the names of its cases
 */
export function caseNamesFor(spec) {
    return casesFor(spec).map((c) => c.name);
}
