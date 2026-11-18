// The main thread's side of the pack worker (docs/designs/pack-worker.md, "Lifecycle"): starts the worker for a world with
// `packInit`, stops it and releases its snapshot hold for a new world or a hidden page, and restarts it with a back-off
// when it reports `packError`, errors or sends a message that does not validate. Every side effect (the worker, the
// timers, the clock and the log) is injected.

import { holdFrom, READER, RELEASED } from '../../worker/snapshot-ring.js';
import { restartDelay } from '../supervisor.js';
import { clearStop, createFrameSlots, frameSlotBytes, requestStop } from './frame-slots.js';
import { PACK_MESSAGES, validatePackMessage } from './pack-protocol.js';

/**
 * @typedef {object} PackWorld what the worker is started with, for one world
 * @property {number} epoch the world's epoch (`ready.epoch`)
 * @property {Record<string, any>} info `ready.info`
 * @property {{flags: Record<string, number>, stateBits: Record<string, number>}} layout the layout parts the pack reads
 * @property {import('../../worker/snapshot-ring.js').Ring} ring the main thread's views of the snapshot ring
 * @property {SharedArrayBuffer} ringMemory the ring's buffer (`ready.ring`)
 * @property {number} slotBytes the bytes of one snapshot (`ready.slotBytes`)
 * @property {import('./frame-slots.js').FrameSlots} slots the main thread's views of the frame slots
 * @property {SharedArrayBuffer} slotsMemory the frame slots' buffer
 * @property {SharedArrayBuffer} storesMemory the effect stores' buffer
 * @property {string[]} causeNames the death cause names by number
 */

/**
 * @param {{ready: Record<string, any>, ring: import('../../worker/snapshot-ring.js').Ring,
 *   storesMemory: SharedArrayBuffer, causeNames: string[]}} source the `ready` message, the client's ring views, the
 *   effect stores' buffer and the cause names
 * @returns {PackWorld} the world, with a new frame slot buffer
 */
export function createPackWorld({ ready, ring, storesMemory, causeNames }) {
    const slotsMemory = new SharedArrayBuffer(frameSlotBytes(ready.info));
    return {
        epoch: ready.epoch,
        info: ready.info,
        layout: { flags: ready.layout.flags, stateBits: ready.layout.stateBits },
        ring,
        ringMemory: ready.ring,
        slotBytes: ready.slotBytes,
        slots: createFrameSlots(slotsMemory, ready.info),
        slotsMemory,
        storesMemory,
        causeNames,
    };
}

/**
 * @typedef {object} PackClientOptions
 * @property {() => {postMessage: (message: any) => void, terminate: () => void,
 *   onmessage: ((event: {data: any}) => void) | null, onerror: ((event: any) => void) | null,
 *   onmessageerror: ((event: any) => void) | null}} createWorker makes a worker
 * @property {() => number} now the clock, in ms
 * @property {(ms: number, run: () => void) => unknown} setTimer runs `run` after `ms`
 * @property {(handle: unknown) => void} clearTimer cancels a timer
 * @property {(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, any>) => void} log
 *   writes a structured record
 */

/**
 * @typedef {object} PackState
 * @property {PackClientOptions} options the injected functions
 * @property {PackWorld | null} world the world being packed, null before `start` and after `stop`
 * @property {ReturnType<PackClientOptions['createWorker']> | null} worker the running worker
 * @property {number[]} failures the times of the failures of this world
 * @property {unknown} timer the restart timer, null when none is pending
 * @property {boolean} paused whether `pause` stopped the worker
 */

/**
 * Ends the running worker: sets `STOP`, terminates it and releases its hold of the ring.
 * @param {PackState} state the state
 * @returns {void}
 */
function halt(state) {
    state.options.clearTimer(state.timer);
    state.timer = null;
    if (state.world !== null) {
        requestStop(state.world.slots);
        holdFrom(state.world.ring, READER.PACK, RELEASED);
    }
    if (state.worker !== null) {
        state.worker.onmessage = null;
        state.worker.onerror = null;
        state.worker.onmessageerror = null;
        state.worker.terminate();
        state.worker = null;
    }
}

/**
 * A failed worker: logs it, ends it and arranges the restart after the back-off.
 * @param {PackState} state the state
 * @param {{message: string, stack: string}} why the error
 * @returns {void}
 */
function fail(state, why) {
    state.options.log('error', 'PackWorkerFailed', { message: why.message, stack: why.stack });
    halt(state);
    state.failures.push(state.options.now());
    const delay = restartDelay(state.failures, state.options.now());
    state.timer = state.options.setTimer(delay, () => {
        state.timer = null;
        if (state.world !== null && !state.paused) {
            launch(state);
            state.options.log('warn', 'PackWorkerRestarted', { failures: state.failures.length });
        }
    });
}

/**
 * @param {unknown} reason an error event or a message-error event
 * @returns {{message: string, stack: string}} what to log
 */
function describeEvent(reason) {
    const e = /** @type {any} */ (reason);
    return { message: String(e?.message ?? e?.type ?? 'worker error'), stack: String(e?.error?.stack ?? '') };
}

/**
 * Starts the worker on the current world.
 * @param {PackState} state the state, `world` not null
 * @returns {void}
 */
function launch(state) {
    const world = /** @type {PackWorld} */ (state.world);
    const worker = state.options.createWorker();
    state.worker = worker;
    clearStop(world.slots);
    worker.onmessage = (event) => {
        try {
            const message = validatePackMessage(event.data, { direction: 'fromWorker' });
            if (message.type === PACK_MESSAGES.ERROR) {
                fail(state, { message: message.message, stack: message.stack });
            }
        } catch (error) {
            fail(state, { message: /** @type {Error} */ (error).message, stack: '' });
        }
    };
    worker.onerror = (event) => fail(state, describeEvent(event));
    worker.onmessageerror = (event) => fail(state, describeEvent(event));
    worker.postMessage({
        type: PACK_MESSAGES.INIT,
        epoch: world.epoch,
        info: world.info,
        layout: world.layout,
        ring: world.ringMemory,
        slotBytes: world.slotBytes,
        slots: world.slotsMemory,
        stores: world.storesMemory,
        causeNames: world.causeNames,
    });
}

/**
 * Creates the client. Nothing runs until `start`.
 * @param {PackClientOptions} options the injected functions
 * @returns {{start: (world: PackWorld) => void, pause: () => void, resume: () => void, stop: () => void,
 *   slots: () => import('./frame-slots.js').FrameSlots | null, failures: () => number}} `start` runs a world (stopping
 *   the previous one); `pause` and `resume` stop and restart the worker for a hidden page; `stop` ends it; `slots` is
 *   the world's frame slots; `failures` counts this world's failures
 */
export function createPackClient(options) {
    /** @type {PackState} */
    const state = { options, world: null, worker: null, failures: [], timer: null, paused: false };
    return {
        start(world) {
            halt(state);
            state.world = world;
            state.failures = [];
            state.paused = false;
            launch(state);
        },
        pause() {
            if (state.world !== null && !state.paused) {
                state.paused = true;
                halt(state);
            }
        },
        resume() {
            if (state.world !== null && state.paused) {
                state.paused = false;
                launch(state);
            }
        },
        stop() {
            halt(state);
            state.world = null;
        },
        slots: () => state.world?.slots ?? null,
        failures: () => state.failures.length,
    };
}
