import { describe, expect, it } from 'vitest';
import { createPackClient, createPackWorld } from '../../../js/app/pack/pack-client.js';
import { isStopped, REQ } from '../../../js/app/pack/frame-slots.js';
import { PACK_MESSAGES } from '../../../js/app/pack/pack-protocol.js';
import { BACKOFF_MS } from '../../../js/app/supervisor.js';
import { createRingViews, HELD, holdFrom, READER, RELEASED, releaseAll } from '../../../js/worker/snapshot-ring.js';
import { CAUSES, info, READY, SLOT_BYTES, world } from '../helpers/pack-world.js';

/** A fake worker the client talks to, and the timers and clock it uses. */
function harness() {
    const workers = /** @type {any[]} */ ([]);
    const timers = /** @type {any[]} */ ([]);
    const logs = /** @type {any[]} */ ([]);
    let now = 1000;
    const client = createPackClient({
        createWorker() {
            const worker = {
                posted: /** @type {any[]} */ ([]),
                terminated: false,
                onmessage: /** @type {any} */ (null),
                onerror: /** @type {any} */ (null),
                onmessageerror: /** @type {any} */ (null),
                postMessage(/** @type {any} */ m) {
                    this.posted.push(m);
                },
                terminate() {
                    this.terminated = true;
                },
            };
            workers.push(worker);
            return worker;
        },
        now: () => now,
        setTimer(ms, run) {
            timers.push({ ms, run, live: true });
            return timers.length - 1;
        },
        clearTimer(handle) {
            if (typeof handle === 'number') {
                timers[handle].live = false;
            }
        },
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
    });
    return { client, workers, timers, logs, advance: (/** @type {number} */ ms) => (now += ms) };
}

/** @returns {ReturnType<typeof createPackWorld>} a pack world over a ring the main thread holds */
function packWorld() {
    const w = world();
    const ring = createRingViews(w.ringWorld.memory, SLOT_BYTES);
    releaseAll(ring);
    holdFrom(ring, READER.PACK, 1);
    const ready = { ...READY, info, epoch: 4, ring: w.ringWorld.memory, slotBytes: SLOT_BYTES };
    return createPackWorld({ ready, ring, storesMemory: w.storesMemory, causeNames: CAUSES });
}

describe('createPackWorld', () => {
    it('sizes new frame slots for the world and keeps the ring and the stores it was given', () => {
        const pw = packWorld();
        expect(pw.epoch).toBe(4);
        expect(pw.slots.slots).toHaveLength(3);
        expect(pw.slotsMemory).toBeInstanceOf(SharedArrayBuffer);
        expect(pw.layout.flags).toBe(READY.layout.flags);
    });
});

describe('createPackClient', () => {
    it('starts a worker with packInit carrying the world, and exposes its frame slots', () => {
        const h = harness();
        const pw = packWorld();
        expect(h.client.slots()).toBeNull();
        h.client.start(pw);
        expect(h.workers).toHaveLength(1);
        expect(h.workers[0].posted[0]).toMatchObject({
            type: PACK_MESSAGES.INIT,
            epoch: 4,
            ring: pw.ringMemory,
            slots: pw.slotsMemory,
            stores: pw.storesMemory,
            causeNames: CAUSES,
        });
        expect(h.client.slots()).toBe(pw.slots);
        h.workers[0].onmessage({ data: { type: PACK_MESSAGES.READY, epoch: 4 } });
        expect(h.logs).toEqual([]);
    });

    it('sets STOP, terminates and releases the hold on a new world; the new world starts clean', () => {
        const h = harness();
        const first = packWorld();
        const second = packWorld();
        h.client.start(first);
        h.client.start(second);
        expect(isStopped(first.slots)).toBe(true);
        expect(h.workers[0].terminated).toBe(true);
        expect(first.ring.header[HELD + READER.PACK]).toBe(RELEASED);
        expect(isStopped(second.slots)).toBe(false);
        expect(h.workers).toHaveLength(2);
        expect(h.client.slots()).toBe(second.slots);
        h.client.stop();
        expect(h.workers[1].terminated).toBe(true);
        expect(h.client.slots()).toBeNull();
        h.client.stop();
    });

    it('logs PackWorkerFailed on packError, releases the hold and restarts with backoff, logging PackWorkerRestarted', () => {
        const h = harness();
        const pw = packWorld();
        h.client.start(pw);
        h.workers[0].onmessage({
            data: { type: PACK_MESSAGES.ERROR, epoch: 4, message: 'boom', stack: 'at x' },
        });
        expect(h.logs).toEqual([{ level: 'error', event: 'PackWorkerFailed', message: 'boom', stack: 'at x' }]);
        expect(h.workers[0].terminated).toBe(true);
        expect(pw.ring.header[HELD + READER.PACK]).toBe(RELEASED);
        expect(h.timers.at(-1)?.ms).toBe(BACKOFF_MS[0]);
        expect(h.workers).toHaveLength(1);
        h.timers.at(-1)?.run();
        expect(h.workers).toHaveLength(2);
        expect(isStopped(pw.slots)).toBe(false);
        expect(h.workers[1].posted[0].type).toBe(PACK_MESSAGES.INIT);
        expect(h.logs.at(-1)).toEqual({ level: 'warn', event: 'PackWorkerRestarted', failures: 1 });
        // a second failure waits longer
        h.advance(10);
        h.workers[1].onmessage({ data: { type: PACK_MESSAGES.ERROR, epoch: 4, message: 'again', stack: '' } });
        expect(h.timers.at(-1)?.ms).toBe(BACKOFF_MS[1]);
        expect(h.client.failures()).toBe(2);
    });

    it('treats a worker error event, a message error and an invalid message as failures', () => {
        const h = harness();
        h.client.start(packWorld());
        h.workers[0].onerror({ message: 'script error', error: { stack: 'trace' } });
        expect(h.logs[0]).toMatchObject({ event: 'PackWorkerFailed', message: 'script error', stack: 'trace' });
        h.timers.at(-1)?.run();
        h.workers[1].onmessageerror({ type: 'messageerror' });
        expect(h.logs.at(-1)).toMatchObject({ event: 'PackWorkerFailed', message: 'messageerror' });
        h.timers.at(-1)?.run();
        h.workers[2].onmessage({ data: { type: 'junk' } });
        expect(h.logs.at(-1)).toMatchObject({ event: 'PackWorkerFailed' });
        h.timers.at(-1)?.run();
        h.workers[3].onerror(null);
        expect(h.logs.at(-1)).toMatchObject({ message: 'worker error' });
    });

    it('does not restart a failed worker after a new world replaced it, or while paused', () => {
        const h = harness();
        h.client.start(packWorld());
        h.workers[0].onerror({ message: 'x' });
        const pending = h.timers.at(-1);
        h.client.start(packWorld());
        expect(pending?.live).toBe(false);
        expect(h.workers).toHaveLength(2);
        h.workers[1].onerror({ message: 'y' });
        h.client.pause();
        h.timers.at(-1)?.run();
        expect(h.workers).toHaveLength(2);
    });

    it('stops on pause and starts again on resume, with STOP cleared', () => {
        const h = harness();
        const pw = packWorld();
        h.client.resume();
        h.client.pause();
        expect(h.workers).toHaveLength(0);
        h.client.start(pw);
        h.client.pause();
        h.client.pause();
        expect(isStopped(pw.slots)).toBe(true);
        expect(pw.ring.header[HELD + READER.PACK]).toBe(RELEASED);
        expect(h.workers[0].terminated).toBe(true);
        h.client.resume();
        h.client.resume();
        expect(h.workers).toHaveLength(2);
        expect(Atomics.load(pw.slots.req, REQ.STOP)).toBe(0);
    });

    it('ignores a late message from a worker that was replaced', () => {
        const h = harness();
        h.client.start(packWorld());
        const old = h.workers[0];
        h.client.start(packWorld());
        expect(old.onmessage).toBeNull();
    });
});
