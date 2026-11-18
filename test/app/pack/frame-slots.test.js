import { describe, expect, it } from 'vitest';
import {
    bucketRows,
    claimFrameSlot,
    createFrameSlots,
    createRequest,
    FRAME_SLOTS,
    frameSlotBytes,
    isStopped,
    LENS,
    lensBits,
    noteSkipped,
    paletteIndex,
    publishFrame,
    readRequest,
    REQ,
    requestStop,
    skippedPacks,
    SLOT,
    takeFrame,
    writeRequest,
    writeSlotMeta,
} from '../../../js/app/pack/frame-slots.js';
import { AGENT_ROW_FLOATS } from '../../../js/app/renderer/agent-lanes.js';

const INFO = { maxAgents: 6, specs: [{}, {}, {}] };

/** @returns {ReturnType<typeof createFrameSlots>} slots over a fresh shared buffer */
function make() {
    return createFrameSlots(new SharedArrayBuffer(frameSlotBytes(INFO)), INFO);
}

/**
 * Publishes a slot the way the worker does.
 * @param {ReturnType<typeof createFrameSlots>} slots the slots
 * @param {number} seq the request it answers
 * @param {number} count agents in it
 * @returns {number} the slot written
 */
function publish(slots, seq, count) {
    const k = claimFrameSlot(slots);
    slots.slots[k].agents.count = count;
    publishFrame(slots, k, seq);
    return k;
}

describe('frame slot layout', () => {
    it('makes every lane 8-byte aligned and the slots disjoint, over the buffer given', () => {
        const slots = make();
        const memory = slots.slots[0].agents.x.buffer;
        const ends = [];
        for (const slot of slots.slots) {
            const lanes = [
                slot.head,
                slot.meta,
                ...Object.values(slot.agents).filter((v) => ArrayBuffer.isView(v) && v.buffer === memory),
                ...slot.rows,
            ];
            for (const lane of lanes) {
                expect(lane.byteOffset % 8).toBe(0);
                expect(lane.buffer).toBe(memory);
            }
            ends.push(Math.max(...lanes.map((l) => l.byteOffset + l.byteLength)));
        }
        expect(slots.req.byteOffset % 8).toBe(0);
        expect(slots.reqF64.byteOffset % 8).toBe(0);
        expect(slots.slots[1].head.byteOffset).toBeGreaterThanOrEqual(ends[0]);
        expect(slots.slots[2].head.byteOffset).toBeGreaterThanOrEqual(ends[1]);
        expect(memory.byteLength).toBeGreaterThanOrEqual(ends[2]);
        expect(slots.slots).toHaveLength(FRAME_SLOTS);
        expect(slots.slots[0].rows[0]).toHaveLength(INFO.maxAgents * AGENT_ROW_FLOATS);
    });

    it('keeps `previous` off the shared memory and refuses a buffer of the wrong size', () => {
        const slots = make();
        expect(slots.slots[0].agents.previous.buffer).not.toBe(slots.slots[0].agents.x.buffer);
        expect(() => createFrameSlots(new SharedArrayBuffer(64), INFO)).toThrow(/expected/);
    });
});

describe('requests', () => {
    it('round trips every field and bumps the sequence', () => {
        const slots = make();
        const request = createRequest();
        Object.assign(request, { prevSeq: 4, latestSeq: 5, alpha: 0.25, tick: 123.5, nowMs: 9876.5, zoom: 2.5 });
        request.lens = lensBits({ temperature: true, scent: false, territory: true, vision: false, calls: false });
        request.palette = paletteIndex('high-contrast');
        request.family.set([3, -1, 7, -1, -1, -1, -1, 9]);
        expect(writeRequest(slots, request)).toBe(1);
        const out = createRequest();
        expect(readRequest(slots, out)).toBe(1);
        expect(out).toEqual({ ...request, seq: 1, family: request.family });
        expect(Array.from(out.family)).toEqual([3, -1, 7, -1, -1, -1, -1, 9]);
        expect(writeRequest(slots, request)).toBe(2);
        expect(readRequest(slots, out)).toBe(2);
    });

    it('reads nothing before the first request', () => {
        expect(readRequest(make(), createRequest())).toBe(0);
    });

    it('reads again when the writer overwrites the request mid-copy (a torn read is never returned)', () => {
        const slots = make();
        const request = createRequest();
        request.tick = 1;
        writeRequest(slots, request);
        // the writer is between `BEGIN` and `SEQ` of request 2 while the reader copies
        Atomics.store(slots.req, REQ.BEGIN, 2);
        slots.reqF64[1] = 2;
        const real = Atomics.load.bind(Atomics);
        let calls = 0;
        const spy = (/** @type {Int32Array} */ a, /** @type {number} */ i) => {
            if (a === slots.req && i === REQ.LATEST_SEQ && ++calls === 1) {
                // the writer finishes while the reader holds the half-written copy
                Atomics.store(slots.req, REQ.SEQ, 2);
            }
            return real(a, i);
        };
        Atomics.load = /** @type {any} */ (spy);
        try {
            const out = createRequest();
            expect(readRequest(slots, out)).toBe(2);
            expect(out.tick).toBe(2);
        } finally {
            Atomics.load = real;
        }
    });

    it('packs lens flags and palette names', () => {
        expect(lensBits({ temperature: false, scent: false, territory: false, vision: false, calls: false })).toBe(0);
        expect(lensBits({ temperature: true, scent: true, territory: true, vision: true, calls: true })).toBe(
            LENS.TEMPERATURE | LENS.SCENT | LENS.TERRITORY | LENS.VISION | LENS.CALLS,
        );
        expect(paletteIndex('cvd-safe')).toBe(1);
        expect(paletteIndex('nonsense')).toBe(0);
    });

    it('stops the worker and counts skipped packs', () => {
        const slots = make();
        expect(isStopped(slots)).toBe(false);
        requestStop(slots);
        expect(isStopped(slots)).toBe(true);
        noteSkipped(slots);
        noteSkipped(slots);
        expect(skippedPacks(slots)).toBe(2);
    });
});

describe('claimFrameSlot and takeFrame', () => {
    it('returns null before the first publish and the newest slot with its count after', () => {
        const slots = make();
        expect(takeFrame(slots)).toBeNull();
        expect(slots.fresh).toBe(false);
        const k = publish(slots, 7, 4);
        const agents = takeFrame(slots);
        expect(agents).toBe(slots.slots[k].agents);
        expect(agents?.count).toBe(4);
        expect(slots.fresh).toBe(true);
        expect(slots.taken.seq).toBe(7);
    });

    it('carries the meta of the request the slot answers', () => {
        const slots = make();
        const request = createRequest();
        Object.assign(request, { prevSeq: 2, latestSeq: 3, alpha: 0.5, tick: 40.25, nowMs: 1000.5 });
        const k = claimFrameSlot(slots);
        writeSlotMeta(slots, { slot: k, request });
        slots.slots[k].head[SLOT.BUCKETS + 1] = 9;
        publishFrame(slots, k, 1);
        takeFrame(slots);
        expect(slots.taken).toEqual({ seq: 1, prevSeq: 2, latestSeq: 3, alpha: 0.5, tick: 40.25, nowMs: 1000.5 });
        expect(bucketRows(slots, 1)).toBe(9);
        expect(bucketRows(make(), 0)).toBe(0);
    });

    it('takes the same slot again when nothing new is published, and says so', () => {
        const slots = make();
        publish(slots, 1, 2);
        takeFrame(slots);
        const again = takeFrame(slots);
        expect(slots.fresh).toBe(false);
        expect(again?.count).toBe(2);
        publish(slots, 2, 3);
        takeFrame(slots);
        expect(slots.fresh).toBe(true);
    });

    it('never claims the newest published slot or the one being read, through many publishes', () => {
        const slots = make();
        const seen = new Set();
        for (let seq = 1; seq <= 40; seq++) {
            const reading = slots.current;
            const k = claimFrameSlot(slots);
            expect(slots.slots[k]).not.toBe(reading);
            expect(k + 1).not.toBe(Atomics.load(slots.req, REQ.PUBLISHED));
            slots.slots[k].agents.count = seq;
            publishFrame(slots, k, seq);
            seen.add(k);
            if (seq % 3 !== 0) {
                expect(takeFrame(slots)?.count).toBe(seq);
            }
        }
        expect(seen.size).toBe(FRAME_SLOTS);
    });

    it('zeroes a claimed slot sequence while it is written', () => {
        const slots = make();
        const a = publish(slots, 5, 1);
        publish(slots, 6, 1);
        expect(Atomics.load(slots.slots[a].head, SLOT.SEQ)).toBe(5);
        const k = claimFrameSlot(slots);
        expect(k).toBe(a);
        expect(Atomics.load(slots.slots[a].head, SLOT.SEQ)).toBe(0);
    });

    it('retakes when a slot is published between the read and the mark', () => {
        const slots = make();
        publish(slots, 1, 1);
        const real = Atomics.store.bind(Atomics);
        let raced = false;
        Atomics.store = /** @type {any} */ (
            (/** @type {Int32Array} */ a, /** @type {number} */ i, /** @type {number} */ v) => {
                const out = real(a, i, v);
                if (!raced && a === slots.req && i === REQ.READING) {
                    raced = true;
                    // the worker publishes a newer slot right after the main thread marked the old one
                    const k = claimFrameSlot(slots);
                    slots.slots[k].agents.count = 9;
                    publishFrame(slots, k, 2);
                }
                return out;
            }
        );
        try {
            expect(takeFrame(slots)?.count).toBe(9);
        } finally {
            Atomics.store = real;
        }
        expect(Atomics.load(slots.req, REQ.READING)).toBe(Atomics.load(slots.req, REQ.PUBLISHED));
    });
});
