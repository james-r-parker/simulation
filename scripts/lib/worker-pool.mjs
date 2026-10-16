// A pull-queue pool over node:worker_threads: free workers take the next task, results come back in task order.
import { availableParallelism } from 'node:os';
import { Worker, parentPort } from 'node:worker_threads';

/**
 * @typedef {object} PoolOptions
 * @property {URL | string} workerUrl The module each worker runs; it should call `serveTasks`.
 * @property {number} [workers] Pool size; defaults to `os.availableParallelism()`, capped at the task count.
 * @property {(index: number, result: any) => void} [onResult] Called as each task finishes (finish order).
 */

/**
 * Resolves and validates the pool size.
 * @param {number | undefined} requested The caller's `workers` option.
 * @param {number} taskCount How many tasks there are.
 * @returns {number} The number of workers to start (at least 1).
 */
export function resolvePoolSize(requested, taskCount) {
    if (requested !== undefined && (!Number.isInteger(requested) || requested < 1)) {
        throw new RangeError(`workers must be a positive integer, got ${String(requested)}`);
    }
    return Math.max(1, Math.min(requested ?? availableParallelism(), taskCount));
}

/**
 * Builds the rejection for a failed task.
 * @param {number} index The task index.
 * @param {{ message?: string, stack?: string } | undefined} detail What the worker reported.
 * @returns {Error} An error naming the task, with the worker's message and stack in the message and as `cause`.
 */
function taskError(index, detail) {
    const text = detail?.message ?? 'unknown error';
    const stack = detail?.stack ? `\n${detail.stack}` : '';
    return new Error(`task ${index} failed: ${text}${stack}`, { cause: detail });
}

/**
 * @typedef {Worker & { index: number }} PoolWorker A worker plus the index of the task it is running (-1 when idle).
 */

/**
 * Runs every task on a pool of workers. Each worker gets one task message at a time and replies with one result.
 * Rejects on the first failed task (a posted error, a throw, or an exit mid-task) and always terminates the workers.
 * @param {readonly any[]} tasks Structured-cloneable task messages.
 * @param {PoolOptions} options The worker module, pool size and progress callback.
 * @returns {Promise<any[]>} The results, indexed like `tasks`.
 */
export function runPool(tasks, { workerUrl, workers, onResult }) {
    const size = resolvePoolSize(workers, tasks.length);
    /** @type {any[]} */
    const results = new Array(tasks.length);
    if (tasks.length === 0) {
        return Promise.resolve(results);
    }
    return new Promise((resolve, reject) => {
        /** @type {PoolWorker[]} */
        const pool = [];
        let next = 0;
        let done = 0;
        let settled = false;
        const finish = (/** @type {Error | undefined} */ error) => {
            if (settled) {
                return;
            }
            settled = true;
            Promise.allSettled(pool.map((w) => w.terminate())).then(() => (error ? reject(error) : resolve(results)));
        };
        const dispatch = (/** @type {PoolWorker} */ worker) => {
            worker.index = next < tasks.length ? next : -1;
            if (worker.index >= 0) {
                worker.postMessage(tasks[next++]);
            }
        };
        const onMessage = (/** @type {PoolWorker} */ worker, /** @type {any} */ message) => {
            if (!message?.ok) {
                return finish(taskError(worker.index, message?.error));
            }
            results[worker.index] = message.result;
            onResult?.(worker.index, message.result);
            if (++done === tasks.length) {
                return finish(undefined);
            }
            dispatch(worker);
        };
        for (let i = 0; i < size; i++) {
            const worker = Object.assign(new Worker(workerUrl), { index: -1 });
            pool.push(worker);
            worker.on('message', (message) => onMessage(worker, message));
            worker.on('error', (error) => finish(taskError(worker.index, error)));
            worker.on('exit', (code) => {
                // A worker that exits mid-task never replies, whatever its exit code.
                if (worker.index >= 0) {
                    finish(taskError(worker.index, { message: `worker exited with code ${code}` }));
                }
            });
            dispatch(worker);
        }
    });
}

/**
 * Worker side: answers each task message with `{ ok: true, result }` or `{ ok: false, error }`.
 * @param {(task: any) => any} handler Computes one task's result; may be async.
 * @returns {void}
 */
export function serveTasks(handler) {
    if (!parentPort) {
        throw new Error('serveTasks must run inside a worker thread');
    }
    const port = parentPort;
    port.on('message', async (task) => {
        try {
            port.postMessage({ ok: true, result: await handler(task) });
        } catch (error) {
            const { message, stack } = /** @type {Error} */ (error);
            port.postMessage({ ok: false, error: { message: String(message), stack } });
        }
    });
}
