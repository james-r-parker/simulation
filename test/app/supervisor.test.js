import { describe, expect, it } from 'vitest';
import {
    BACKOFF_MS,
    FAILURE_WINDOW_MS,
    HEARTBEAT_MS,
    LONG_RETRY_MS,
    createSupervisor,
    restartDelay,
} from '../../js/app/supervisor.js';

const READY = {
    type: 'ready',
    epoch: 1,
    configHash: 'c',
    rulesHash: 'r',
    layout: { effectsOffset: 10, effectWords: 8 },
    info: {},
    labels: {},
    policy: 'p',
    seed: 1,
};

/**
 * @param {number} tick a tick
 * @returns {Record<string, any>} a stats message
 */
function statsMessage(tick) {
    return { type: 'stats', epoch: 1, stats: { tick, ticksPerSecond: 60 } };
}

/**
 * @param {{throwOnCreate?: () => boolean}} [options] makes `createWorker` throw while it returns true
 * @returns {Record<string, any>} a supervisor over fake workers, a fake clock and fake timers
 */
function setup({ throwOnCreate = () => false } = {}) {
    let t = 0;
    let nextId = 1;
    /** @type {{id: number, at: number, run: () => void}[]} */
    let timers = [];
    /** @type {Record<string, any>[]} */
    const workers = [];
    /** @type {Record<string, any>[]} */
    const logs = [];
    /** @type {Record<string, any>[]} */
    const toasts = [];
    let seeds = 100;
    const supervisor = createSupervisor({
        createWorker() {
            if (throwOnCreate()) {
                throw new Error('no worker');
            }
            const worker = {
                posted: /** @type {any[]} */ ([]),
                terminated: false,
                onmessage: null,
                onerror: null,
                onmessageerror: null,
                postMessage(/** @type {any} */ message) {
                    worker.posted.push(message);
                },
                terminate() {
                    worker.terminated = true;
                },
            };
            workers.push(worker);
            return worker;
        },
        chooseSeed: () => (seeds += 1),
        now: () => t,
        setTimer(ms, run) {
            const id = nextId++;
            timers.push({ id, at: t + ms, run });
            return id;
        },
        clearTimer(handle) {
            timers = timers.filter((timer) => timer.id !== handle);
        },
        config: { maxAgents: 10 },
        onRestart: (event) => toasts.push(event),
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
    });
    /**
     * Moves the clock forward, firing the timers that fall due in order.
     * @param {number} ms how far
     * @returns {void}
     */
    function advance(ms) {
        const end = t + ms;
        for (;;) {
            const due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
            if (due === undefined) {
                break;
            }
            timers = timers.filter((timer) => timer !== due);
            t = due.at;
            due.run();
        }
        t = end;
    }
    return { supervisor, workers, logs, toasts, advance, now: () => t };
}

describe('restartDelay', () => {
    it('is 1, 2, 4, 8 and 16 s for the first five failures and 10 minutes from the sixth', () => {
        const failures = [0, 1, 2, 3, 4, 5, 6];
        const delays = failures.map((_, i) => restartDelay(failures.slice(0, i + 1), 10 + i));
        expect(delays).toEqual([...BACKOFF_MS, LONG_RETRY_MS, LONG_RETRY_MS]);
    });

    it('forgets failures older than an hour', () => {
        expect(restartDelay([0, 1, 2, 3, 4, FAILURE_WINDOW_MS + 10], FAILURE_WINDOW_MS + 10)).toBe(BACKOFF_MS[0]);
    });
});

describe('the heartbeat', () => {
    it('starts a worker with init and the config, and keeps it while stats arrive', () => {
        const s = setup();
        s.supervisor.start(7);
        const [worker] = s.workers;
        expect(worker.posted[0]).toEqual({ type: 'init', seed: 7, config: { maxAgents: 10 } });
        worker.onmessage({ data: READY });
        for (let i = 0; i < 5; i++) {
            s.advance(HEARTBEAT_MS - 1000);
            worker.onmessage({ data: statsMessage(i) });
        }
        expect(worker.terminated).toBe(false);
        expect(s.supervisor.restarts()).toBe(0);
    });

    it('restarts with a new seed after a missed heartbeat, shows the toast and logs both events', () => {
        const s = setup();
        s.supervisor.start(7);
        s.workers[0].onmessage({ data: statsMessage(40) });
        s.advance(HEARTBEAT_MS);
        expect(s.workers[0].terminated).toBe(true);
        expect(s.workers).toHaveLength(1);
        s.advance(BACKOFF_MS[0]);
        expect(s.workers).toHaveLength(2);
        expect(s.workers[1].posted[0]).toEqual({ type: 'init', seed: 101, config: { maxAgents: 10 } });
        expect(s.toasts).toEqual([
            { seed: 101, reason: 'heartbeat', restarts: 1, delayMs: 1000, previousSeed: 7, previousTick: 40 },
        ]);
        expect(s.logs.map((/** @type {any} */ l) => l.event)).toEqual(['WorkerStalled', 'WorkerRestarted']);
        expect(s.logs[1]).toMatchObject({
            level: 'warn',
            newSeed: 101,
            previousSeed: 7,
            previousTick: 40,
            reason: 'heartbeat',
        });
        expect(s.supervisor.client()).not.toBeNull();
        expect(s.supervisor.seed()).toBe(101);
    });

    it('does not fail a paused client for sending no stats', () => {
        const s = setup();
        s.supervisor.start(7);
        s.supervisor.client()?.pause();
        s.advance(HEARTBEAT_MS * 6);
        expect(s.workers[0].terminated).toBe(false);
        s.supervisor.client()?.resume();
        s.advance(HEARTBEAT_MS);
        expect(s.workers[0].terminated).toBe(true);
    });
});

describe('the other failures', () => {
    it.each([
        [
            'an error message from the worker',
            (/** @type {any} */ w) =>
                w.onmessage({ data: { type: 'error', message: 'm', stack: '', seed: 1, tick: 2, configHash: 'h' } }),
            'worker-error',
        ],
        ['an error event', (/** @type {any} */ w) => w.onerror({ message: 'x' }), 'error-event'],
        ['a messageerror event', (/** @type {any} */ w) => w.onmessageerror({}), 'messageerror-event'],
        [
            'a message that fails validation',
            (/** @type {any} */ w) => w.onmessage({ data: { type: 'snapshot' } }),
            'invalid-message',
        ],
    ])('treats %s as a failure and restarts', (_name, trigger, reason) => {
        const s = setup();
        s.supervisor.start(7);
        trigger(s.workers[0]);
        expect(s.workers[0].terminated).toBe(true);
        s.advance(BACKOFF_MS[0]);
        expect(s.workers).toHaveLength(2);
        expect(s.toasts[0].reason).toBe(reason);
    });

    it('counts several failures of one worker as one', () => {
        const s = setup();
        s.supervisor.start(7);
        s.workers[0].onerror({});
        s.workers[0].onmessageerror({});
        s.advance(BACKOFF_MS[0]);
        s.advance(BACKOFF_MS[1] - 1);
        expect(s.workers).toHaveLength(2);
        expect(s.supervisor.restarts()).toBe(1);
    });

    it('keeps retrying when the worker cannot be created', () => {
        let broken = false;
        const s = setup({ throwOnCreate: () => broken });
        s.supervisor.start(7);
        broken = true;
        s.workers[0].onerror({});
        s.advance(BACKOFF_MS[0]);
        expect(s.logs.some((/** @type {any} */ l) => l.event === 'WorkerRestarted')).toBe(false);
        broken = false;
        s.advance(BACKOFF_MS[1]);
        expect(s.workers).toHaveLength(2);
    });
});

describe('the back-off', () => {
    it('waits 1, 2, 4, 8 and 16 s, then 10 minutes, and never gives up', () => {
        const s = setup();
        s.supervisor.start(7);
        const waits = [];
        for (let i = 0; i < 9; i++) {
            const before = s.workers.length;
            s.workers.at(-1)?.onerror({});
            let waited = 0;
            while (s.workers.length === before) {
                s.advance(1000);
                waited += 1000;
            }
            waits.push(waited);
        }
        expect(waits).toEqual([
            1000,
            2000,
            4000,
            8000,
            16000,
            LONG_RETRY_MS,
            LONG_RETRY_MS,
            LONG_RETRY_MS,
            LONG_RETRY_MS,
        ]);
        expect(s.supervisor.restarts()).toBe(9);
    });

    it('starts the back-off over after an hour without a failure', () => {
        const s = setup();
        s.supervisor.start(7);
        for (let i = 0; i < 3; i++) {
            s.workers.at(-1)?.onerror({});
            s.advance(LONG_RETRY_MS);
        }
        for (let waited = 0; waited <= FAILURE_WINDOW_MS; waited += HEARTBEAT_MS - 1000) {
            s.workers.at(-1)?.onmessage({ data: statsMessage(waited) });
            s.advance(HEARTBEAT_MS - 1000);
        }
        s.workers.at(-1)?.onerror({});
        s.advance(BACKOFF_MS[0]);
        expect(s.toasts.at(-1)?.delayMs).toBe(BACKOFF_MS[0]);
    });
});

describe('the debug bundle', () => {
    it('keeps the seed, config, tick and reason of the last failure', () => {
        const s = setup();
        s.supervisor.start(7);
        s.workers[0].onmessage({ data: statsMessage(55) });
        s.workers[0].onerror({ message: 'boom' });
        expect(s.supervisor.lastBundle()).toMatchObject({
            seed: 7,
            config: { maxAgents: 10 },
            tick: 55,
            reason: 'error-event',
            message: 'boom',
        });
        s.advance(BACKOFF_MS[0]);
        expect(s.supervisor.lastBundle()?.seed).toBe(7);
    });

    it('builds the bundle with the injected function when there is one', () => {
        const options = { calls: /** @type {any[]} */ ([]) };
        const supervisor = createSupervisor({
            createWorker: () => ({
                postMessage() {},
                terminate() {},
                onmessage: null,
                onerror: null,
                onmessageerror: null,
            }),
            chooseSeed: () => 1,
            now: () => 0,
            setTimer: () => 1,
            clearTimer() {},
            config: {},
            log() {},
            buildBundle: (info) => {
                options.calls.push(info);
                return { custom: true };
            },
        });
        supervisor.start(3);
        supervisor.client()?.handle({ type: 'error', message: 'm', stack: '', seed: 3, tick: 9, configHash: 'h' });
        expect(supervisor.lastBundle()).toEqual({ custom: true });
        expect(options.calls[0]).toMatchObject({ seed: 3, reason: 'worker-error' });
    });
});

describe('stop', () => {
    it('terminates the worker and cancels a pending restart', () => {
        const s = setup();
        s.supervisor.start(7);
        s.workers[0].onerror({});
        s.supervisor.stop();
        s.advance(LONG_RETRY_MS);
        expect(s.workers).toHaveLength(1);
        const t = setup();
        t.supervisor.start(1);
        t.supervisor.stop();
        expect(t.workers[0].terminated).toBe(true);
        t.advance(HEARTBEAT_MS * 3);
        expect(t.workers).toHaveLength(1);
    });
});
