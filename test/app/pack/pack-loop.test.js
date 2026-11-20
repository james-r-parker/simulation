import { describe, expect, it } from 'vitest';
import {
    createFrameSlots,
    createRequest,
    isStopped,
    requestStop,
    takeFrame,
    writeRequest,
} from '../../../js/app/pack/frame-slots.js';
import { receive, serve, WAIT_MS } from '../../../js/app/pack/pack-loop.js';
import { PACK_MESSAGES } from '../../../js/app/pack/pack-protocol.js';
import { READER, RELEASED, HELD } from '../../../js/worker/snapshot-ring.js';
import { CAUSES, FIRST, info, publishSnapshot, READY, SECOND, SLOT_BYTES, world } from '../helpers/pack-world.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/**
 * @param {ReturnType<typeof world>} w the world
 * @returns {Record<string, any>} the `packInit` for it
 */
function initMessage(w) {
    return {
        type: PACK_MESSAGES.INIT,
        epoch: 3,
        info,
        layout: { flags: READY.layout.flags, stateBits: READY.layout.stateBits },
        ring: w.ringWorld.memory,
        slotBytes: SLOT_BYTES,
        slots: w.slotsMemory,
        stores: w.storesMemory,
        causeNames: CAUSES,
    };
}

describe('serve', () => {
    it('packs each new request once and waits on the request sequence between them, until stopped', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        const main = createFrameSlots(w.slotsMemory, info);
        const waits = /** @type {any[]} */ ([]);
        const request = createRequest();
        Object.assign(request, { prevSeq, latestSeq, alpha: 0.5, tick: 10.5, nowMs: 100, zoom: 1 });
        const packed = serve(w.host, (words, index, value, timeoutMs) => {
            waits.push([index, value, timeoutMs]);
            if (waits.length === 1) {
                writeRequest(main, request);
            } else if (waits.length === 2) {
                writeRequest(main, request);
            } else {
                requestStop(main);
            }
        });
        expect(packed).toBe(2);
        expect(waits).toEqual([
            [0, 0, WAIT_MS],
            [0, 1, WAIT_MS],
            [0, 2, WAIT_MS],
        ]);
        expect(takeFrame(main)?.count).toBe(3);
        expect(main.taken.seq).toBe(2);
        expect(isStopped(w.slots)).toBe(true);
    });

    it('does not count a request it skipped (its snapshot slot was gone)', () => {
        const w = world();
        const main = createFrameSlots(w.slotsMemory, info);
        const request = createRequest();
        Object.assign(request, { prevSeq: 0, latestSeq: 77, alpha: 1, tick: 1, nowMs: 1, zoom: 1 });
        let calls = 0;
        const packed = serve(w.host, () => {
            calls += 1;
            if (calls === 1) {
                writeRequest(main, request);
            } else {
                requestStop(main);
            }
        });
        expect(packed).toBe(0);
        expect(takeFrame(main)).toBeNull();
    });

    it('returns at once when already stopped', () => {
        const w = world();
        requestStop(w.slots);
        expect(serve(w.host, () => expect.unreachable())).toBe(0);
    });
});

describe('receive', () => {
    it('says packReady, serves the request and ends quietly on stop', () => {
        const w = world();
        const prevSeq = publishSnapshot(w, makeSnapshot(10, FIRST));
        const latestSeq = publishSnapshot(w, makeSnapshot(11, SECOND));
        const main = createFrameSlots(w.slotsMemory, info);
        const posted = /** @type {any[]} */ ([]);
        let calls = 0;
        receive(initMessage(w), {
            post: (message) => posted.push(message),
            wait() {
                calls += 1;
                if (calls === 1) {
                    const request = createRequest();
                    Object.assign(request, { prevSeq, latestSeq, alpha: 1, tick: 11, nowMs: 5, zoom: 1 });
                    writeRequest(main, request);
                } else {
                    requestStop(main);
                }
            },
        });
        expect(posted).toEqual([{ type: PACK_MESSAGES.READY, epoch: 3 }]);
        expect(takeFrame(main)?.count).toBe(3);
        expect(w.ring.header[HELD + READER.PACK]).toBe(RELEASED);
    });

    it('posts packError with the message and stack for a bad init, with epoch 0 when it had none', () => {
        const posted = /** @type {any[]} */ ([]);
        receive({ type: 'nope' }, { post: (m) => posted.push(m), wait: () => {} });
        expect(posted).toHaveLength(1);
        expect(posted[0]).toMatchObject({ type: PACK_MESSAGES.ERROR, epoch: 0 });
        expect(posted[0].message).toMatch(/unknown message type/);
        expect(typeof posted[0].stack).toBe('string');
    });

    it('posts packError, carrying the epoch, when the memory does not match the world', () => {
        const w = world();
        const posted = /** @type {any[]} */ ([]);
        receive(
            { ...initMessage(w), slots: new SharedArrayBuffer(64) },
            { post: (m) => posted.push(m), wait: () => {} },
        );
        expect(posted).toHaveLength(1);
        expect(posted[0]).toMatchObject({ type: PACK_MESSAGES.ERROR, epoch: 3 });
        expect(posted[0].message).toMatch(/expected/);
    });

    it('posts packError when the loop throws something that is not an Error', () => {
        const w = world();
        const posted = /** @type {any[]} */ ([]);
        receive(initMessage(w), {
            post: (m) => posted.push(m),
            wait() {
                throw 'plain string';
            },
        });
        expect(posted[1]).toMatchObject({ type: PACK_MESSAGES.ERROR, message: 'plain string' });
    });
});
