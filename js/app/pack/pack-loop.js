// What the pack worker does, with the worker scope injected (docs/designs/pack-worker.md, "Pack worker"): validate
// `packInit`, build the host over the shared memory, say `packReady`, then loop on the request block until `STOP`. The
// loop blocks in `wait` (an `Atomics.wait`) between requests, so after `packInit` the worker takes no messages. Any
// failure is posted as `packError` and ends the run; the main thread's client restarts it.

import { createRingViews } from '../../worker/snapshot-ring.js';
import { createEffectStores } from './effect-stores.js';
import { createFrameSlots, createRequest, isStopped, readRequest, REQ } from './frame-slots.js';
import { createPackHost, packRequest } from './pack-host.js';
import { PACK_MESSAGES, validatePackMessage } from './pack-protocol.js';

/**
 * @typedef {object} PackScope what the loop needs of its worker scope
 * @property {(message: Record<string, any>) => void} post sends a message to the main thread
 * @property {(words: Int32Array, index: number, value: number, timeoutMs: number) => unknown} wait blocks while
 *   `words[index]` is `value`, for at most `timeoutMs` (`Atomics.wait` in the worker; a fake in the tests)
 */

/** The longest one wait lasts, ms: a stop set between the loop's check and its wait is noticed by the next check. */
export const WAIT_MS = 250;

/**
 * Packs requests until the request block says stop.
 * @param {import('./pack-host.js').PackHost} host the host
 * @param {PackScope['wait']} wait the blocking wait
 * @returns {number} requests packed
 */
export function serve(host, wait) {
    const { slots } = host.init;
    const request = createRequest();
    let seen = 0;
    let packed = 0;
    while (!isStopped(slots)) {
        const seq = readRequest(slots, request);
        if (seq !== 0 && seq !== seen) {
            seen = seq;
            packed += packRequest(host, request) ? 1 : 0;
        } else {
            wait(slots.req, REQ.SEQ, seen, WAIT_MS);
        }
    }
    return packed;
}

/**
 * Handles the one message the worker takes. After a valid `packInit` it serves until stopped.
 * @param {unknown} data the message
 * @param {PackScope} scope the worker scope
 * @returns {void}
 */
export function receive(data, scope) {
    let epoch = 0;
    try {
        const message = validatePackMessage(data, { direction: 'toWorker' });
        epoch = message.epoch;
        const host = createPackHost({
            info: message.info,
            layout: message.layout,
            ring: createRingViews(message.ring, message.slotBytes),
            slots: createFrameSlots(message.slots, message.info),
            stores: createEffectStores(message.stores, message.info.maxAgents),
            causeNames: message.causeNames,
        });
        scope.post({ type: PACK_MESSAGES.READY, epoch });
        serve(host, scope.wait);
    } catch (error) {
        const e = error instanceof Error ? error : new Error(String(error));
        scope.post({ type: PACK_MESSAGES.ERROR, epoch, message: e.message, stack: String(e.stack) });
    }
}
