// Ladder worker: runs one rung on one seed and returns its metrics (see `scripts/ladder.mjs`).
import { isMainThread } from 'node:worker_threads';
import { runControllerSeed } from '../js/evo/controller-run.js';
import { LADDER_RUNGS } from '../js/evo/ladder.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} LadderTask
 * @property {string} rung the rung's name, a key of `LADDER_RUNGS`
 * @property {number} seed the world seed
 * @property {number} ticks ticks to run
 * @property {Record<string, any>} overrides config overrides (the `--config` object, or `{}`)
 */

/**
 * @param {LadderTask} task the rung and seed
 * @returns {import('../js/evo/controller-run.js').RungRun & {wallMs: number}} the run and its wall time
 * @throws {Error} naming the rung and the seed when the run fails
 */
export function runRung({ rung, seed, ticks, overrides }) {
    const started = performance.now();
    try {
        const found = LADDER_RUNGS.find((r) => r.name === rung);
        if (found === undefined) {
            throw new Error(`unknown rung "${rung}"`);
        }
        return { ...runControllerSeed({ rung: found, seed, ticks, overrides }), wallMs: performance.now() - started };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`rung ${rung} seed ${seed} failed: ${message}`, { cause: error });
    }
}

if (!isMainThread) {
    serveTasks(runRung);
}
