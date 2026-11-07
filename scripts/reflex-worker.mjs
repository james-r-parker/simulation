// Reflex worker: builds one case's table and scores a set of subjects and the case's bars on it, returning the scores
// and the failed-trial records (see `scripts/reflex.mjs`).
import { isMainThread } from 'node:worker_threads';
import { caseNamed } from '../js/evo/reflex-cases.js';
import { evalCase } from '../js/evo/reflex-score.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} ReflexTask
 * @property {string} case the case's name
 * @property {{name: string, id: number, weights: Float32Array}[]} subjects the genomes of the case's specialisation
 * @property {number} seed the case seed
 * @property {number} trials trials to play
 * @property {Record<string, any>} config config overrides
 * @property {boolean} debug whether to return a record per failed trial
 */

/**
 * @param {ReflexTask} task the task
 * @returns {{scores: import('../js/evo/reflex-eval.js').CaseScore[], bars: import('../js/evo/reflex-score.js').CaseBars, records: Record<string, any>[]}}
 *   each subject's score in order, the case's bars, and the `ReflexCase` records
 * @throws {Error} naming the case when it is unknown
 */
export function runReflexTask({ case: name, subjects, seed, trials, config, debug }) {
    const reflexCase = caseNamed(name);
    /** @type {Record<string, any>[]} */
    const records = [];
    const log = {
        level: /** @type {const} */ ('debug'),
        log: (/** @type {string} */ _level, /** @type {string} */ _event, /** @type {any} */ fields) =>
            records.push(fields),
    };
    const run = evalCase(
        reflexCase,
        subjects.map((s) => ({ ...s, act: null })),
        { config, seed, trials, log: debug ? /** @type {any} */ (log) : undefined },
    );
    return { scores: run.scores, bars: run.bars, records };
}

if (!isMainThread) {
    serveTasks(runReflexTask);
}
