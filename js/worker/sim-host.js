// The sim worker's brain, with every side effect injected: `post` sends a message to the main thread, `now` reads the
// clock in ms, `schedule` runs a function after a delay and `createPolicy` builds the policy. It owns the world, the
// observer and the pools; `receive` handles one incoming message and a scheduled slice steps the world.

import { encodeArchive } from '../evo/archive-codec.js';
import { createSimLog } from '../sim/log.js';
import { fieldBytes, buildRun, readyLayout, tickOnce, worldInfo, BASE_TICKS_PER_SECOND } from './host-world.js';
import { emitSnapshot, emitStats, STATS_INTERVAL_MS, warnLimited } from './host-output.js';
import { createBufferPool, FIELD_POOL_SIZE, giveBuffer, SNAPSHOT_POOL_SIZE } from './buffer-pool.js';
import { inspectLabels } from './inspect.js';
import { nextDelay, createPacer, restartClock, ticksDue } from './pacing.js';
import { noteLogRecord } from './live-stats.js';
import { DIRECTION, MESSAGE_TYPES, POOLS, SELECTION_STATES, validateMessage } from './protocol.js';

/**
 * @typedef {object} SimHostOptions
 * @property {(message: Record<string, any>, transfer?: ArrayBuffer[]) => void} post sends a message to the main thread
 * @property {() => number} now the clock, in ms
 * @property {(delayMs: number, run: () => void) => void} schedule runs `run` after `delayMs`; the host keeps at most
 *   one scheduled
 * @property {(options: Record<string, any>) => Record<string, any>} createPolicy builds the policy from
 *   `{ config, log, observer }`
 */

/**
 * @param {import('./host-output.js').HostState} host the host
 * @returns {void}
 */
function scheduleNext(host) {
    if (!host.timerPending && !host.paused && !host.stopped && host.run !== null) {
        host.timerPending = true;
        host.schedule(nextDelay(host.pacer, host.ticksPerSecond), host.onTimer);
    }
}

/**
 * Posts `selection` gone and clears the selection when the selected agent is no longer alive.
 * @param {import('./host-output.js').HostState} host the host
 * @returns {void}
 */
function checkSelection(host) {
    const sel = host.selection;
    const { world } = host.run;
    if (sel !== null && !(world.alive[sel.slot] === 1 && world.genomeId[sel.slot] === sel.genomeId)) {
        host.post({ type: MESSAGE_TYPES.SELECTION, genomeId: sel.genomeId, state: SELECTION_STATES.GONE });
        host.selection = null;
    }
}

/**
 * Runs `count` ticks, counting them and the wall time they took into the stats window.
 * @param {import('./host-output.js').HostState} host the host
 * @param {number} count the ticks to run
 * @returns {void}
 */
function runTicks(host, count) {
    const start = host.now();
    for (let i = 0; i < count; i++) {
        tickOnce(host.run);
    }
    host.window.ticks += count;
    host.window.workMs += host.now() - start;
    checkSelection(host);
}

/**
 * Warns, rate-limited, when the pacer has dropped ticks since the last warning.
 * @param {import('./host-output.js').HostState} host the host
 * @returns {void}
 */
function reportDrops(host) {
    const dropped = Math.floor(host.pacer.dropped);
    if (
        dropped > host.warnedDropped &&
        warnLimited(host, 'TicksDropped', { count: dropped - host.warnedDropped, ticksPerSecond: host.ticksPerSecond })
    ) {
        host.warnedDropped = dropped;
    }
}

/**
 * One slice: the ticks that are due, a snapshot when the gap allows, stats when 250 ms have passed, then the next slice.
 * @param {import('./host-output.js').HostState} host the host
 * @returns {void}
 */
function runSlice(host) {
    host.timerPending = false;
    if (host.stopped || host.paused || host.run === null) {
        return;
    }
    try {
        const t = host.now();
        const due = ticksDue(host.pacer, t, host.ticksPerSecond);
        if (due > 0) {
            runTicks(host, due);
            emitSnapshot(host, false);
        }
        if (t - host.window.startAt >= STATS_INTERVAL_MS) {
            emitStats(host);
        }
        reportDrops(host);
        scheduleNext(host);
    } catch (error) {
        fail(host, error);
    }
}

/**
 * Stops stepping and tells the main thread why.
 * @param {import('./host-output.js').HostState} host the host
 * @param {unknown} error what was thrown
 * @returns {void}
 */
function fail(host, error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error && error.stack !== undefined ? error.stack : '';
    host.stopped = true;
    const { run } = host;
    const fields = {
        message,
        stack,
        seed: run === null ? host.seed : run.seed,
        tick: run === null ? 0 : run.world.tick,
    };
    host.log.log('error', 'WorkerError', fields);
    host.post({ type: MESSAGE_TYPES.ERROR, ...fields, configHash: run === null ? '' : run.configHash });
}

/**
 * Reuses a pool whose buffers are the right size, else makes a new one.
 * @param {Record<string, any> | null} pool the current pool, or null
 * @param {{count: number, bytes: number}} want the pool wanted
 * @returns {Record<string, any>} the pool to use
 */
function poolFor(pool, want) {
    return pool !== null && pool.bytes === want.bytes ? pool : createBufferPool(want);
}

/**
 * Builds the world for `init` or `reset`, sizes the pools and announces it with `ready`.
 * @param {import('./host-output.js').HostState} host the host
 * @param {{seed: number, config: Record<string, any>}} message the `init` or `reset` message
 * @returns {void}
 */
function startWorld(host, message) {
    host.seed = message.seed;
    const run = buildRun({
        seed: message.seed,
        overrides: message.config,
        createPolicy: host.createPolicy,
        log: host.log,
    });
    if (host.selection !== null) {
        host.post({ type: MESSAGE_TYPES.SELECTION, genomeId: host.selection.genomeId, state: SELECTION_STATES.GONE });
    }
    host.run = run;
    host.selection = null;
    host.epoch += 1;
    host.snapshotPool = poolFor(host.snapshotPool, { count: SNAPSHOT_POOL_SIZE, bytes: run.layout.bytes });
    host.fieldPool = poolFor(host.fieldPool, { count: FIELD_POOL_SIZE, bytes: fieldBytes(run) });
    host.pacer = createPacer();
    restartClock(host.pacer, host.now());
    host.window = { startAt: host.now(), ticks: 0, workMs: 0 };
    host.warnedDropped = 0;
    host.post({
        type: MESSAGE_TYPES.READY,
        epoch: host.epoch,
        configHash: run.configHash,
        rulesHash: run.rulesHash,
        layout: readyLayout(run),
        info: worldInfo(run),
        labels: inspectLabels(),
        policy: run.policy.name,
        seed: run.seed,
    });
    host.log.log('info', 'WorkerStarted', { seed: run.seed, configHash: run.configHash, policy: run.policy.name });
    if (host.paused) {
        emitSnapshot(host, true);
    }
    scheduleNext(host);
}

/**
 * @param {import('./host-output.js').HostState} host the host
 * @param {number} genomeId the agent to select; 0 clears
 * @returns {void}
 */
function select(host, genomeId) {
    const slot = genomeId === 0 ? undefined : host.run.observer.slotOf.get(genomeId);
    if (genomeId !== 0 && slot === undefined) {
        host.selection = null;
        host.post({ type: MESSAGE_TYPES.SELECTION, genomeId, state: SELECTION_STATES.GONE });
        return;
    }
    host.selection = slot === undefined ? null : { genomeId, slot };
    if (slot !== undefined) {
        host.post({ type: MESSAGE_TYPES.SELECTION, genomeId, state: SELECTION_STATES.TRACKING });
    }
    if (host.paused) {
        emitSnapshot(host, true);
    }
}

/**
 * @param {import('./host-output.js').HostState} host the host
 * @returns {void}
 */
function exportArchive(host) {
    const { policy, config } = host.run;
    if (policy.archive === undefined) {
        warnLimited(host, 'ArchiveExportSkipped', { reason: `policy ${policy.name} has no archive` });
        return;
    }
    host.post({ type: MESSAGE_TYPES.ARCHIVE, json: JSON.stringify(encodeArchive(policy.archive, config)) });
}

/**
 * @param {import('./host-output.js').HostState} host the host
 * @param {Record<string, any>} message a pause, resume, step, speed, buffer or lens message
 * @returns {void}
 */
function control(host, message) {
    switch (message.type) {
        case MESSAGE_TYPES.SET_SPEED:
            host.ticksPerSecond = message.ticksPerSecond;
            break;
        case MESSAGE_TYPES.PAUSE:
            host.paused = true;
            emitSnapshot(host, true);
            host.post({ type: MESSAGE_TYPES.PAUSED, epoch: host.epoch, tick: host.run.world.tick });
            break;
        case MESSAGE_TYPES.RESUME:
            host.paused = false;
            restartClock(host.pacer, host.now());
            host.window.startAt = host.now();
            scheduleNext(host);
            break;
        case MESSAGE_TYPES.STEP:
            runTicks(host, message.ticks);
            emitSnapshot(host, true);
            break;
        case MESSAGE_TYPES.RETURN_BUFFER: {
            const pool = message.pool === POOLS.SNAPSHOT ? host.snapshotPool : host.fieldPool;
            if (pool !== null && message.buffer.byteLength === pool.bytes) {
                giveBuffer(pool, message.buffer);
            }
            break;
        }
        default:
            host.rays = message.rays;
            if (host.paused) {
                emitSnapshot(host, true);
            }
    }
}

/** The types `control` handles. */
const CONTROL_TYPES = new Set([
    MESSAGE_TYPES.SET_SPEED,
    MESSAGE_TYPES.PAUSE,
    MESSAGE_TYPES.RESUME,
    MESSAGE_TYPES.STEP,
    MESSAGE_TYPES.RETURN_BUFFER,
    MESSAGE_TYPES.SET_LENSES,
]);

/**
 * @param {import('./host-output.js').HostState} host the host
 * @param {Record<string, any>} message a validated incoming message
 * @returns {void}
 */
function dispatch(host, message) {
    if (message.type === MESSAGE_TYPES.INIT || message.type === MESSAGE_TYPES.RESET) {
        if ((message.type === MESSAGE_TYPES.INIT) !== (host.run === null)) {
            throw new Error(
                `${message.type}: ${host.run === null ? 'send init first' : 'already initialised, send reset'}`,
            );
        }
        startWorld(host, /** @type {any} */ (message));
    } else if (host.run === null) {
        throw new Error(`${message.type}: no world yet, send init first`);
    } else if (CONTROL_TYPES.has(message.type)) {
        control(host, message);
    } else if (message.type === MESSAGE_TYPES.SELECT) {
        select(host, message.genomeId);
    } else if (message.type === MESSAGE_TYPES.EXPORT_ARCHIVE) {
        exportArchive(host);
    }
}

/**
 * Creates the host. It does nothing until it receives `init`.
 * @param {SimHostOptions} options the injected functions
 * @returns {{receive: (message: any) => void, run: () => (Record<string, any> | null)}} `receive` handles one
 *   incoming message; `run` returns the current run (world, observer, policy), for tests and tools
 */
export function createSimHost({ post, now, schedule, createPolicy }) {
    /** @type {import('./host-output.js').HostState} */
    const host = {
        post,
        now,
        schedule,
        createPolicy,
        run: null,
        seed: 0,
        epoch: 0,
        paused: false,
        stopped: false,
        ticksPerSecond: BASE_TICKS_PER_SECOND,
        rays: false,
        selection: null,
        pacer: createPacer(),
        snapshotPool: null,
        fieldPool: null,
        timerPending: false,
        window: { startAt: 0, ticks: 0, workMs: 0 },
        warnedDropped: 0,
        lastWarn: new Map(),
        log: createSimLog(
            (record) => {
                post({ type: MESSAGE_TYPES.LOG, record });
                if (host.run !== null) {
                    noteLogRecord(host.run.live, record, host.run.world.tick);
                }
            },
            { level: 'info' },
        ),
    };
    host.onTimer = () => runSlice(host);
    return {
        receive(message) {
            if (host.stopped) {
                return;
            }
            try {
                validateMessage(message, { direction: DIRECTION.TO_WORKER, paused: host.paused });
                dispatch(host, message);
            } catch (error) {
                fail(host, error);
            }
        },
        run: () => host.run,
    };
}
