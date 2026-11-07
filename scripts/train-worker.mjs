// Train worker: runs one episode (a training episode or a checkpoint's eval world) and returns its offers, its end
// state, the asked-for metrics and the wall time (see `scripts/train.mjs`).
import { isMainThread } from 'node:worker_threads';
import { runEpisode } from '../js/evo/trainer.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * @param {import('../js/evo/trainer.js').EpisodeTask} task the episode
 * @returns {ReturnType<typeof runEpisode> & {wallMs: number}} the episode's result and its wall time
 */
export function runTrainTask(task) {
    const started = performance.now();
    const result = runEpisode(task);
    return { ...result, wallMs: performance.now() - started };
}

if (!isMainThread) {
    serveTasks(runTrainTask);
}
