// Learn worker: evolves one population on one lesson and returns its curve and final score (see
// `scripts/learn-probe.mjs`). The population is discarded; no genome leaves the worker.
import { isMainThread } from 'node:worker_threads';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { learnLesson } from '../js/evo/learn-probe.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} LearnTask
 * @property {string} lesson the drill's name
 * @property {number} seed the population's seed
 * @property {number} generations generations to evolve
 * @property {number} population brains per generation
 * @property {number} trials trials per brain per generation
 * @property {Record<string, any>} config config overrides
 */

/**
 * @param {LearnTask} task the task
 * @returns {import('../js/evo/learn-probe.js').LearnResult} the curve and the final score
 * @throws {Error} naming the lesson when it is unknown
 */
export function runLearnTask({ lesson, seed, generations, population, trials, config }) {
    const drill = DRILLS.find((d) => d.name === lesson);
    if (drill === undefined) {
        throw new Error(`learn: unknown lesson "${lesson}"`);
    }
    return learnLesson(drill, { seed, generations, population, trials, config });
}

if (!isMainThread) {
    serveTasks(runLearnTask);
}
