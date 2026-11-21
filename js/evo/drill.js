// Runs a drill's trials for a subject and measures its edge over random brains (training.md, Drills). Pure: no files, no
// clock. A drill draws its bearings from `fork(createRng(seed), 'drill:<name>')` and trial `i` runs on world seed
// `seed + i`, so a run replays bit for bit from the seed and the subject.

import { brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { wilsonInterval } from './binomial.js';
import { layerArena } from './drill-body-rules.js';
import { randomWeights } from './mutation.js';
import { playTrial, viewOf } from './memory-probe-run.js';

/** Trials per drill. */
export const DRILL_TRIALS = 32;
/** Random brains whose mean win share is the edge's baseline. */
export const RANDOM_BRAINS = 4;

/**
 * @typedef {object} DrillOptions
 * @property {Record<string, any>} [config] config overrides the arena is built from (default none)
 * @property {number} [seed] the base seed (default 1)
 * @property {number} [trials] trials per drill (default `DRILL_TRIALS`)
 * @property {import('../sim/log.js').SimLog} [log] receives `DrillTrial` at debug level
 * @property {boolean} [arms] whether to also play the drill's control arms (`pack-converge`'s solo and kin-blind; default
 *   no: random brains and reference-free callers skip them)
 */

/**
 * @typedef {object} DrillScore
 * @property {number} wins trials won
 * @property {number} trials trials played
 * @property {number} winShare `wins / trials`
 * @property {Record<string, {wins: number, trials: number}>} [arms] the control arms' scores by name, when asked for and the
 *   drill has them
 */

/**
 * @param {import('./drill-scenarios.js').Drill} drill the drill
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {Readonly<Record<string, any>>} base the config
 * @returns {string | null} why the subject is not drilled (its specialisation is not the drill's, or cannot hunt), or null
 */
export function skipReason(drill, subject, base) {
    const spec = subject.spec ?? drill.spec;
    if (spec !== drill.spec) {
        return "the specialisation is not the drill's";
    }
    const entry = Object.values(base.specialisations).find((s) => /** @type {any} */ (s).index === spec);
    if (drill.needsHunter && /** @type {any} */ (entry).canHunt !== true) {
        return 'the specialisation cannot hunt';
    }
    return null;
}

/**
 * Plays a drill's control arms on the same bearings as its own trials: each arm draws its stream from the same seed and
 * the drill's name, so trial `i` stages the same bearings in every arm. The drill must have arms.
 * @param {import('./drill-staging.js').Drill} drill the drill
 * @param {import('./memory-probe-run.js').Subject} subject the staged subject
 * @param {{seed: number, trials: number, config: Record<string, any>, view: number}} run the base seed, the trial count,
 *   the config the trials run under and the subject's ray length
 * @returns {Record<string, {wins: number, trials: number}>} each arm's wins
 */
function playArms(drill, subject, { seed, trials, config, view }) {
    return Object.fromEntries(
        /** @type {readonly import('./drill-staging.js').DrillArm[]} */ (drill.arms).map((arm) => {
            const rng = fork(createRng(seed), `drill:${drill.name}`);
            let wins = 0;
            for (let trial = 0; trial < trials; trial++) {
                const plan = arm.plan(rng, view);
                wins += playTrial({ plan, subject, controlSpec: arm.controlSpec, seed: seed + trial, config }) ? 1 : 0;
            }
            return [arm.name, { wins, trials }];
        }),
    );
}

/**
 * @param {DrillScore} score the main trials' score
 * @param {{drill: import('./drill-staging.js').Drill, subject: import('./memory-probe-run.js').Subject, wanted: boolean,
 *   run: {seed: number, trials: number, config: Record<string, any>, view: number}}} arms the drill, the staged subject,
 *   whether the caller asked for the arms and the run they play on
 * @returns {DrillScore} the score, with the arms' when asked for and the drill has them
 */
function withArms(score, { drill, subject, wanted, run }) {
    return wanted && drill.arms !== undefined ? { ...score, arms: playArms(drill, subject, run) } : score;
}

/**
 * Plays the drill's trials with the subject.
 * @param {import('./drill-scenarios.js').Drill} drill the drill
 * @param {import('./memory-probe-run.js').Subject} subject the subject (a reference's null `spec` takes the drill's)
 * @param {DrillOptions} [options] the options
 * @returns {DrillScore} the wins and the win share
 */
export function drillSubject(drill, subject, options = {}) {
    const { seed = 1, trials = DRILL_TRIALS, log, arms = false } = options;
    const config = layerArena(options.config, drill.arena);
    const staged = { ...subject, spec: subject.spec ?? drill.spec };
    const rules = createConfig(config);
    const view = viewOf(staged, rules);
    const rng = fork(createRng(seed), `drill:${drill.name}`);
    let wins = 0;
    for (let trial = 0; trial < trials; trial++) {
        const plan = drill.plan(rng, view, rules);
        const controlSpec = { name: 'intact' };
        const won = playTrial({ plan, subject: staged, controlSpec, seed: seed + trial, config });
        wins += Number(won);
        log?.log('debug', 'DrillTrial', {
            drill: drill.name,
            trial,
            genomeId: subject.id,
            subject: subject.name,
            won,
            ...plan.trace?.(won),
        });
    }
    const run = { seed, trials, config, view };
    return withArms({ wins, trials, winShare: wins / trials }, { drill, subject: staged, wanted: arms, run });
}

/**
 * @param {import('./drill-scenarios.js').Drill} drill the drill
 * @param {DrillOptions} [options] the options (`seed` and `config`)
 * @returns {import('./memory-probe-run.js').Subject[]} `RANDOM_BRAINS` random brains of the drill's specialisation
 */
export function randomBrains(drill, options = {}) {
    const { config = {}, seed = 1 } = options;
    const base = createConfig(config);
    const layout = brainLayout(base);
    return Array.from({ length: RANDOM_BRAINS }, (_, i) => {
        const row = new Float32Array(layout.weightCount);
        randomWeights(row, layout, fork(createRng(seed), `drill-random:${drill.name}:${i}`), base.leakGeneStart);
        return { name: `random-${i}`, id: 0, spec: drill.spec, weights: row, act: null };
    });
}

/**
 * @param {number} winShare a subject's win share
 * @param {readonly number[]} baselines the random brains' win shares
 * @returns {number} the win share minus the baselines' mean
 */
export function edgeOf(winShare, baselines) {
    return winShare - baselines.reduce((sum, share) => sum + share, 0) / baselines.length;
}

/**
 * The 95% Wilson low bound of the subject's win share, and that bound minus the Wilson high bound of the random brains'
 * pooled win share: an `edgeLow` above 0 is an edge the trials can tell from the baseline's luck.
 * @param {{wins: number, trials: number}} subject the subject's score
 * @param {readonly {wins: number, trials: number}[]} baselines the random brains' scores
 * @returns {{winShareLow: number, edgeLow: number}} the two low bounds
 */
export function winBounds(subject, baselines) {
    const wins = baselines.reduce((sum, score) => sum + score.wins, 0);
    const trials = baselines.reduce((sum, score) => sum + score.trials, 0);
    const { low } = wilsonInterval(subject.wins, subject.trials);
    return { winShareLow: low, edgeLow: low - wilsonInterval(wins, trials).high };
}

/**
 * @typedef {object} DrillEdge
 * @property {number | null} winShare the subject's win share; null when skipped
 * @property {number | null} baseline the random brains' mean win share; null when skipped
 * @property {number | null} edge `winShare - baseline`; null when skipped
 * @property {number | null} winShareLow the Wilson low bound of the win share; null when skipped
 * @property {number | null} edgeLow `winShareLow` minus the Wilson high bound of the random brains' pooled share; null when skipped
 * @property {Record<string, {wins: number, trials: number}>} [arms] the control arms' scores, when the options asked for them
 * @property {string | null} skipped why the subject was not drilled, or null
 */

/**
 * The subject's win share and its edge over `RANDOM_BRAINS` random brains of the same specialisation on the same trials.
 * @param {import('./drill-scenarios.js').Drill} drill the drill
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {DrillOptions} [options] the options
 * @returns {DrillEdge} the scores, or the reason the subject was skipped
 */
export function drillEdge(drill, subject, options = {}) {
    const skipped = skipReason(drill, subject, createConfig(options.config ?? {}));
    if (skipped !== null) {
        return { winShare: null, baseline: null, edge: null, winShareLow: null, edgeLow: null, skipped };
    }
    const score = drillSubject(drill, subject, options);
    const scores = randomBrains(drill, options).map((brain) =>
        drillSubject(drill, brain, { ...options, log: undefined }),
    );
    const shares = scores.map((s) => s.winShare);
    const baseline = shares.reduce((sum, share) => sum + share, 0) / shares.length;
    return {
        winShare: score.winShare,
        baseline,
        edge: edgeOf(score.winShare, shares),
        ...winBounds(score, scores),
        ...(score.arms === undefined ? {} : { arms: score.arms }),
        skipped: null,
    };
}
