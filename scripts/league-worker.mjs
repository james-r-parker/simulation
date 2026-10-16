// League worker: plays one game between two champion files and returns who won (see `scripts/league.mjs`).
import { isMainThread } from 'node:worker_threads';
import { playMatch, validateChampion } from '../js/evo/league.js';
import { createConfig } from '../js/sim/config.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @typedef {object} LeagueTask
 * @property {number} seed the world seed
 * @property {number} ticks ticks to play
 * @property {Record<string, any>} a the parsed champion file for side A (the candidate)
 * @property {Record<string, any>} b the parsed champion file for side B
 */

/**
 * @param {LeagueTask} task the game
 * @returns {import('../js/evo/league.js').MatchResult & { seed: number }} the result and the seed
 * @throws {Error} naming the seed when a champion file is invalid or the world fails
 */
export function runGame({ seed, ticks, a, b }) {
    const config = createConfig();
    try {
        const result = playMatch(validateChampion(a, config), validateChampion(b, config), seed, { ticks });
        return { seed, ...result };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed} failed: ${message}`, { cause: error });
    }
}

if (!isMainThread) {
    serveTasks(runGame);
}
