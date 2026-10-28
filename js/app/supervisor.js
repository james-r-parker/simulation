// Keeps the sim worker alive: expects a stats message at least every 5 s while the sim runs, treats a missed
// heartbeat, a worker error, an error or messageerror event and an invalid message as failures, and restarts the
// worker with a fresh seed after 1, 2, 4, 8 and 16 s, then every 10 minutes. It never gives up. Every side effect
// (the worker, the timers, the clock, the seed, the toast and the log) is injected.

import { createWorkerClient } from './worker-client.js';

/** The longest the worker may go without a stats message while running, in ms. */
export const HEARTBEAT_MS = 5000;

/** The wait before each of the first five restarts, in ms. */
export const BACKOFF_MS = Object.freeze([1000, 2000, 4000, 8000, 16000]);

/** The wait between restarts from the sixth failure within the window, in ms. */
export const LONG_RETRY_MS = 600000;

/** Failures count towards the back-off for this long, in ms. */
export const FAILURE_WINDOW_MS = 3600000;

/**
 * @typedef {object} SupervisorOptions
 * @property {() => {postMessage: (message: any, transfer?: any[]) => void, terminate: () => void,
 *   onmessage: ((event: {data: any}) => void) | null, onerror: ((event: any) => void) | null,
 *   onmessageerror: ((event: any) => void) | null}} createWorker makes a worker
 * @property {() => number} chooseSeed a fresh seed for each restart
 * @property {() => number} now the clock, in ms
 * @property {(ms: number, run: () => void) => unknown} setTimer runs `run` after `ms`
 * @property {(handle: unknown) => void} clearTimer cancels a timer
 * @property {Record<string, any>} config the config overrides sent with each `init`
 * @property {string} [policy] the registered policy each `init` asks for; absent means the worker's live policy
 * @property {(event: {seed: number, reason: string, restarts: number, delayMs: number, previousSeed: number,
 *   previousTick: number}) => void} [onRestart] shows the toast naming the new seed
 * @property {(client: Record<string, any>) => void} [onClient] receives each new client, so the app can wire it
 * @property {import('./worker-client.js').ClientListeners} [listeners] the client's listeners, called through
 * @property {(info: Record<string, any>) => Record<string, any>} [buildBundle] builds the debug bundle kept after a
 *   failure; the failure's seed, config, tick and reason by default
 * @property {(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, any>) => void} log
 *   writes a structured record
 */

/**
 * @param {number[]} failures the times of the failures so far, oldest first
 * @param {number} now the clock, in ms
 * @returns {number} how long to wait before restarting after the failure just recorded
 */
export function restartDelay(failures, now) {
    const recent = failures.filter((t) => now - t < FAILURE_WINDOW_MS).length;
    return recent > BACKOFF_MS.length ? LONG_RETRY_MS : BACKOFF_MS[Math.max(recent, 1) - 1];
}

/**
 * @typedef {object} Supervision
 * @property {SupervisorOptions} options the injected functions and the config
 * @property {ReturnType<SupervisorOptions['createWorker']> | null} worker the current worker, null while waiting to
 *   restart
 * @property {Record<string, any> | null} client the current client
 * @property {number} seed the seed of the current world
 * @property {number[]} failures the times of the failures within the window
 * @property {number} restarts restarts so far
 * @property {unknown} heartbeat the heartbeat timer
 * @property {unknown} restartTimer the restart timer, null when none is pending
 * @property {number} lastStatsAt the clock at the last stats message
 * @property {number} lastTick the tick of the last stats message
 * @property {Record<string, any> | null} bundle the debug bundle kept after the last failure
 * @property {boolean} stopped whether `stop` was called
 */

/**
 * Arms the heartbeat: the worker must report within `HEARTBEAT_MS`; a paused sim reports nothing, so a paused client
 * just re-arms it.
 * @param {Supervision} sup the supervisor state
 * @returns {void}
 */
function arm(sup) {
    const { options } = sup;
    options.clearTimer(sup.heartbeat);
    sup.heartbeat = options.setTimer(HEARTBEAT_MS, () => {
        if (sup.client !== null && sup.client.paused) {
            arm(sup);
        } else {
            fail(sup, 'heartbeat', { lastStatsMs: options.now() - sup.lastStatsAt });
        }
    });
}

/**
 * Records a failure, keeps the debug bundle, stops the worker and schedules the restart. A failure while a restart is
 * already pending is the same failure and is ignored.
 * @param {Supervision} sup the supervisor state
 * @param {string} reason why the worker failed
 * @param {Record<string, any>} [detail] extra fields for the log
 * @returns {void}
 */
function fail(sup, reason, detail = {}) {
    const { options } = sup;
    if (sup.stopped || sup.restartTimer !== null) {
        return;
    }
    const t = options.now();
    sup.failures = sup.failures.filter((time) => t - time < FAILURE_WINDOW_MS);
    sup.failures.push(t);
    const delayMs = restartDelay(sup.failures, t);
    if (reason === 'heartbeat') {
        options.log('warn', 'WorkerStalled', detail);
    }
    const info = { seed: sup.seed, config: options.config, tick: sup.lastTick, reason, ...detail };
    sup.bundle = options.buildBundle === undefined ? info : options.buildBundle(info);
    options.clearTimer(sup.heartbeat);
    sup.worker?.terminate();
    sup.worker = null;
    sup.restartTimer = options.setTimer(delayMs, () => restart(sup, { reason, delayMs }));
}

/**
 * Starts a worker and its client and sends `init`.
 * @param {Supervision} sup the supervisor state
 * @param {number} seed the world seed
 * @returns {void}
 */
function launch(sup, seed) {
    const { options } = sup;
    const worker = options.createWorker();
    const through = options.listeners ?? {};
    const client = createWorkerClient({
        post: (message, transfer) => worker.postMessage(message, transfer),
        policy: options.policy,
        listeners: {
            ...through,
            onStats(stats) {
                sup.lastStatsAt = options.now();
                sup.lastTick = stats.tick;
                arm(sup);
                through.onStats?.(stats);
            },
            onError(message) {
                through.onError?.(message);
                fail(sup, 'worker-error', { message: message.message });
            },
            onFailure(error) {
                through.onFailure?.(error);
                fail(sup, 'invalid-message', { message: error.message });
            },
        },
    });
    worker.onmessage = (event) => client.handle(event.data);
    worker.onerror = (event) => fail(sup, 'error-event', { message: String(event?.message ?? '') });
    worker.onmessageerror = () => fail(sup, 'messageerror-event');
    sup.worker = worker;
    sup.client = client;
    sup.seed = seed;
    sup.lastStatsAt = options.now();
    options.onClient?.(client);
    client.init(seed, options.config);
    arm(sup);
}

/**
 * Starts a new worker with a fresh seed after a failure and tells the app.
 * @param {Supervision} sup the supervisor state
 * @param {{reason: string, delayMs: number}} why the failure and the wait that preceded this restart
 * @returns {void}
 */
function restart(sup, { reason, delayMs }) {
    sup.restartTimer = null;
    const previous = { previousSeed: sup.seed, previousTick: sup.lastTick };
    const seed = sup.options.chooseSeed();
    sup.restarts += 1;
    try {
        launch(sup, seed);
    } catch (error) {
        sup.seed = seed;
        fail(sup, 'launch-error', { message: error instanceof Error ? error.message : String(error) });
        return;
    }
    sup.options.log('warn', 'WorkerRestarted', { reason, restarts: sup.restarts, delayMs, ...previous, newSeed: seed });
    sup.options.onRestart?.({ seed, reason, restarts: sup.restarts, delayMs, ...previous });
}

/**
 * Creates the supervisor. Nothing runs until `start`.
 * @param {SupervisorOptions} options the injected functions and the config
 * @returns {{start: (seed: number) => void, stop: () => void, client: () => (Record<string, any> | null),
 *   restarts: () => number, lastBundle: () => (Record<string, any> | null), seed: () => number}} the supervisor
 */
export function createSupervisor(options) {
    /** @type {Supervision} */
    const sup = {
        options,
        worker: null,
        client: null,
        seed: 0,
        failures: [],
        restarts: 0,
        heartbeat: null,
        restartTimer: null,
        lastStatsAt: 0,
        lastTick: 0,
        bundle: null,
        stopped: false,
    };
    return {
        start(seed) {
            sup.stopped = false;
            launch(sup, seed);
        },
        stop() {
            sup.stopped = true;
            options.clearTimer(sup.heartbeat);
            options.clearTimer(sup.restartTimer);
            sup.restartTimer = null;
            sup.worker?.terminate();
            sup.worker = null;
        },
        client: () => sup.client,
        restarts: () => sup.restarts,
        lastBundle: () => sup.bundle,
        seed: () => sup.seed,
    };
}
