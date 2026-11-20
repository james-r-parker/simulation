// A pull-queue pool over node:worker_threads: free workers take the next task, results come back in task order.
import { availableParallelism } from 'node:os';
import { Worker, parentPort } from 'node:worker_threads';

/**
 * @typedef {object} PoolOptions
 * @property {URL | string} workerUrl The module each worker runs; it should call `serveTasks`.
 * @property {number} [workers] Pool size; defaults to `defaultWorkers()`, capped at the task count.
 * @property {(index: number, result: any) => void} [onResult] Called as each task finishes (finish order).
 * @property {Pool} [pool] A pool from `createPool` to run on instead of a fresh one; `workerUrl` and `workers` are then
 *   ignored and its workers stay alive afterwards.
 */

/** Cores a default pool leaves free on a big machine, so evals and screens do not starve the gates beside them. */
export const RESERVED_CORES = 8;

/**
 * The pool size when `--workers` is not given: all but 8 cores, and never fewer than half the cores (a small machine has
 * nothing to spare). 32 cores give 24, 16 give 8, 8 give 4, 4 give 2. On a CI runner (`CI` set) nothing else shares the
 * machine, so every core is used.
 * @param {number} [cores] The core count (default `os.availableParallelism()`).
 * @param {Record<string, string | undefined>} [env] The environment to read `CI` from.
 * @returns {number} Workers to start by default (at least 1).
 */
export function defaultWorkers(cores = availableParallelism(), env = process.env) {
    if (env.CI) {
        return Math.max(1, cores);
    }
    return Math.max(1, Math.ceil(cores / 2), cores - RESERVED_CORES);
}

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
    return Math.max(1, Math.min(requested ?? defaultWorkers(), taskCount));
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
 * @typedef {object} Batch One `Pool.run` in flight.
 * @property {readonly any[]} tasks The task messages.
 * @property {any[]} results The results so far, by task index.
 * @property {number} next The next task to hand out.
 * @property {number} done How many tasks have finished.
 * @property {(results: any[]) => void} resolve Settles the run.
 * @property {(error: Error) => void} reject Fails the run.
 * @property {((index: number, result: any) => void) | undefined} onResult Called as each task finishes.
 */

/**
 * @typedef {object} Pool
 * @property {(tasks: readonly any[], onResult?: (index: number, result: any) => void) => Promise<any[]>} run Runs the
 *   tasks on the pool's workers (started on first use, kept after), results in task order; one run at a time. Rejects on
 *   the first failed task and then terminates every worker, so the next run starts fresh ones.
 * @property {() => Promise<void>} close Terminates the workers; the pool can still be used (it starts new ones).
 */

/** The pool behind `createPool`: its workers and the batch in flight. */
class WorkerPool {
    /** @param {URL | string} workerUrl the worker module @param {number} limit the most workers to start */
    constructor(workerUrl, limit) {
        this.workerUrl = workerUrl;
        this.limit = limit;
        /** @type {PoolWorker[]} */
        this.started = [];
        /** @type {Batch | null} */
        this.active = null;
    }

    /** @returns {Promise<void>} terminates the workers; the next run starts new ones */
    async close() {
        const stopped = this.started;
        this.started = [];
        await Promise.allSettled(stopped.map((w) => w.terminate()));
    }

    /** @param {Error} error why the batch in flight failed @returns {void} rejects it once the workers are gone */
    fail(error) {
        const batch = this.active;
        this.active = null;
        if (batch) {
            this.close().then(() => batch.reject(error));
        }
    }

    /** @param {PoolWorker} worker the idle worker @param {Batch} batch the batch @returns {void} hands it the next task */
    dispatch(worker, batch) {
        worker.index = batch.next < batch.tasks.length ? batch.next : -1;
        if (worker.index >= 0) {
            worker.postMessage(batch.tasks[batch.next++]);
        }
    }

    /** @param {PoolWorker} worker the replying worker @param {any} message its reply @returns {void} */
    onMessage(worker, message) {
        const batch = this.active;
        if (!batch || worker.index < 0) {
            return;
        }
        if (!message?.ok) {
            return this.fail(taskError(worker.index, message?.error));
        }
        batch.results[worker.index] = message.result;
        batch.onResult?.(worker.index, message.result);
        if (++batch.done === batch.tasks.length) {
            this.active = null;
            worker.index = -1;
            return batch.resolve(batch.results);
        }
        this.dispatch(worker, batch);
    }

    /** @returns {PoolWorker} a new worker, listening */
    spawn() {
        const worker = Object.assign(new Worker(this.workerUrl), { index: -1 });
        worker.on('message', (message) => this.onMessage(worker, message));
        worker.on('error', (error) => this.fail(taskError(worker.index, error)));
        worker.on('exit', (code) => {
            // A worker that exits mid-task never replies, whatever its exit code.
            if (worker.index >= 0) {
                this.fail(taskError(worker.index, { message: `worker exited with code ${code}` }));
            }
        });
        return worker;
    }

    /**
     * @param {readonly any[]} tasks the task messages
     * @param {((index: number, result: any) => void) | undefined} onResult called as each task finishes
     * @returns {Promise<any[]>} the results in task order
     */
    run(tasks, onResult) {
        if (this.active) {
            return Promise.reject(new Error('a pool runs one batch of tasks at a time'));
        }
        if (tasks.length === 0) {
            return Promise.resolve([]);
        }
        return new Promise((resolve, reject) => {
            const batch = { tasks, results: new Array(tasks.length), next: 0, done: 0, resolve, reject, onResult };
            this.active = batch;
            const size = Math.min(this.limit, tasks.length);
            while (this.started.length < size) {
                this.started.push(this.spawn());
            }
            this.started.slice(0, size).forEach((worker) => this.dispatch(worker, batch));
        });
    }
}

/**
 * A pool whose workers outlive a batch of tasks: a caller with many batches (a trainer's generations) pays each
 * worker's start-up and warm-up once. Each worker gets one task message at a time and replies with one result.
 * @param {{workerUrl: URL | string, workers?: number}} options The worker module and the most workers to start
 *   (default `defaultWorkers()`).
 * @returns {Pool} The pool; no worker starts until `run`.
 */
export function createPool({ workerUrl, workers }) {
    const pool = new WorkerPool(workerUrl, resolvePoolSize(workers, Number.MAX_SAFE_INTEGER));
    return { run: (tasks, onResult) => pool.run(tasks, onResult), close: () => pool.close() };
}

/**
 * Runs every task on a fresh pool of workers, or on `pool` when one is given (its workers stay alive afterwards).
 * Rejects on the first failed task (a posted error, a throw, or an exit mid-task) and always terminates a fresh pool's
 * workers.
 * @param {readonly any[]} tasks Structured-cloneable task messages.
 * @param {PoolOptions} options The worker module, pool size and progress callback.
 * @returns {Promise<any[]>} The results, indexed like `tasks`.
 */
export function runPool(tasks, { workerUrl, workers, onResult, pool }) {
    const size = resolvePoolSize(workers, tasks.length);
    if (pool) {
        return pool.run(tasks, onResult);
    }
    if (tasks.length === 0) {
        return Promise.resolve([]);
    }
    const fresh = createPool({ workerUrl, workers: size });
    return fresh.run(tasks, onResult).then(
        (results) => fresh.close().then(() => results),
        (error) => fresh.close().then(() => Promise.reject(error)),
    );
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
