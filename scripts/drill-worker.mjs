// Drill worker: plays one drill's trials for one subject and returns the score and the trial records
// (see `scripts/drill.mjs`).
import { isMainThread } from 'node:worker_threads';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { drillSubject } from '../js/evo/drill.js';
import { referenceSubject } from '../js/evo/memory-probe-references.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} DrillTask
 * @property {string} drill the drill's name
 * @property {{name: string, id: number, spec: number | null, weights: Float32Array | null, reference: string | null}} subject
 *   the subject; a `reference` kind names a scripted controller, which has no weights
 * @property {number} seed the base seed
 * @property {number} trials trials to play
 * @property {Record<string, any>} config config overrides
 */

/**
 * @param {DrillTask} task the task
 * @returns {{wins: number, trials: number, winShare: number, records: Record<string, any>[]}} the score and one record
 *   per trial (the `DrillTrial` fields)
 * @throws {Error} naming the drill when it is unknown
 */
export function runDrillTask({ drill: name, subject, seed, trials, config }) {
    const drill = DRILLS.find((d) => d.name === name);
    if (drill === undefined) {
        throw new Error(`drill: unknown drill "${name}"`);
    }
    /** @type {Record<string, any>[]} */
    const records = [];
    const log = {
        log: (/** @type {string} */ _level, /** @type {string} */ _event, /** @type {any} */ f) => records.push(f),
    };
    const who =
        subject.reference === null
            ? { name: subject.name, id: subject.id, spec: subject.spec, weights: subject.weights, act: null }
            : referenceSubject(subject.reference);
    const score = drillSubject(drill, who, { config, seed, trials, log: /** @type {any} */ (log) });
    return { ...score, records };
}

if (!isMainThread) {
    serveTasks(runDrillTask);
}
