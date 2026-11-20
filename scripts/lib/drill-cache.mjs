// A cache of drill task results for a run that drills the same subjects again and again (a trainer's checkpoints): the
// random brains and the scripted reference are the same work every time, and an elite that no generation replaced is
// too. A drill task is deterministic, so a result keyed by everything the task reads is the result a rerun would give.
import { createHash } from 'node:crypto';
import { configHash, createConfig } from '../../js/sim/config.js';

/** Results a cache keeps before it drops the least recently used. */
export const CACHE_LIMIT = 1024;

/**
 * @typedef {object} DrillCache
 * @property {Map<string, Record<string, any>>} entries the cached results, least recently used first
 * @property {number} hits tasks answered from the cache
 * @property {number} misses tasks that ran
 */

/** @returns {DrillCache} an empty cache */
export function createDrillCache() {
    return { entries: new Map(), hits: 0, misses: 0 };
}

/**
 * @param {Record<string, any>} task a drill task (`DrillTask` in `scripts/drill-worker.mjs`)
 * @returns {string} a key that names everything the task reads: the drill, the base seed, the trials, the arms flag, the
 *   config hash (a steered arena's config differs), and the subject's kind, name, id, specialisation and a hash of its weights
 *   (a genome that changed misses even when it kept its id)
 */
export function drillTaskKey(task) {
    const { subject } = task;
    const weights = subject.weights;
    const fingerprint =
        weights === null || weights === undefined
            ? 'none'
            : createHash('sha1')
                  .update(new Uint8Array(weights.buffer, weights.byteOffset, weights.byteLength))
                  .digest('hex');
    const who = [subject.reference ?? 'genome', subject.name, subject.id, subject.spec, fingerprint].join(':');
    const world = configHash(createConfig(task.config));
    return [task.drill, task.seed, task.trials, task.arms === true, world, who].join('|');
}

/**
 * Runs the tasks the cache does not hold, and answers the rest from it.
 * @param {readonly Record<string, any>[]} tasks the drill tasks
 * @param {{cache: DrillCache | undefined, run: (missing: Record<string, any>[]) => Promise<Record<string, any>[]>}} how the cache
 *   (none: every task runs) and what runs the tasks it does not hold
 * @returns {Promise<Record<string, any>[]>} the results in task order
 */
export async function runCached(tasks, { cache, run }) {
    if (cache === undefined) {
        return run([...tasks]);
    }
    const keys = tasks.map(drillTaskKey);
    const results = keys.map((key) => cache.entries.get(key));
    const missing = tasks.flatMap((task, i) => (results[i] === undefined ? [i] : []));
    cache.hits += tasks.length - missing.length;
    cache.misses += missing.length;
    const ran = missing.length === 0 ? [] : await run(missing.map((i) => tasks[i]));
    missing.forEach((at, i) => {
        results[at] = ran[i];
    });
    keys.forEach((key, i) => {
        cache.entries.delete(key);
        cache.entries.set(key, /** @type {Record<string, any>} */ (results[i]));
    });
    while (cache.entries.size > CACHE_LIMIT) {
        cache.entries.delete(/** @type {string} */ (cache.entries.keys().next().value));
    }
    return /** @type {Record<string, any>[]} */ (results);
}
