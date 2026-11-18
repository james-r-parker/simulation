import { describe, expect, it } from 'vitest';
import {
    HELD,
    PUBLISHED,
    READER,
    RELEASED,
    RING_SLOTS,
    SLOT_SEQ,
    SLOT_TICK,
    claimSlot,
    createRingViews,
    holdFrom,
    publishSlot,
    releaseAll,
    ringBytes,
    slotOfSeq,
} from '../../js/worker/snapshot-ring.js';

const SLOT_BYTES = 36;

/** @returns {import('../../js/worker/snapshot-ring.js').Ring} a fresh ring with both readers released */
function freshRing() {
    const ring = createRingViews(new SharedArrayBuffer(ringBytes(SLOT_BYTES)), SLOT_BYTES);
    releaseAll(ring);
    return ring;
}

/**
 * @param {import('../../js/worker/snapshot-ring.js').Ring} ring the ring
 * @param {number} tick the tick to publish
 * @returns {number} the sequence published, -1 when no slot was free
 */
function writeOne(ring, tick) {
    const slot = claimSlot(ring);
    return slot < 0 ? -1 : publishSlot(ring, slot, tick);
}

describe('createRingViews and ringBytes', () => {
    it('sizes the buffer as a header and RING_SLOTS slots, each slot 8-byte aligned', () => {
        expect(RING_SLOTS).toBe(6);
        expect(ringBytes(40)).toBe(64 + 6 * 40);
        expect(ringBytes(36)).toBe(64 + 6 * 40);
        const ring = freshRing();
        for (const slot of ring.slots) {
            expect(slot.u32.byteOffset % 8).toBe(0);
            expect(slot.u32.length).toBe(SLOT_BYTES / 4);
            expect(slot.f32.buffer).toBe(slot.u32.buffer);
            expect(slot.f32.byteOffset).toBe(slot.u32.byteOffset);
        }
    });

    it('gives slots that do not overlap', () => {
        const ring = freshRing();
        ring.slots[1].u32[0] = 7;
        expect(ring.slots.map((s) => s.u32[0])).toEqual([0, 7, 0, 0, 0, 0]);
    });

    it('refuses a buffer of the wrong size or a slot size that is not a multiple of 4', () => {
        expect(() => createRingViews(new SharedArrayBuffer(10), SLOT_BYTES)).toThrow(/expected/);
        expect(() => createRingViews(new SharedArrayBuffer(ringBytes(10)), 10)).toThrow(/multiple of 4/);
    });

    it('releases both readers so a fresh ring is claimable', () => {
        const ring = freshRing();
        expect(Atomics.load(ring.header, HELD + READER.MAIN)).toBe(RELEASED);
        expect(Atomics.load(ring.header, HELD + READER.PACK)).toBe(RELEASED);
        expect(claimSlot(ring)).toBeGreaterThanOrEqual(0);
    });
});

describe('publishSlot and slotOfSeq', () => {
    it('numbers snapshots from 1 in publish order and records the tick', () => {
        const ring = freshRing();
        expect(writeOne(ring, 10)).toBe(1);
        expect(writeOne(ring, 20)).toBe(2);
        expect(Atomics.load(ring.header, PUBLISHED)).toBe(2);
        const slot = slotOfSeq(ring, 2);
        expect(Atomics.load(ring.header, SLOT_TICK + slot)).toBe(20);
        expect(Atomics.load(ring.header, SLOT_SEQ + slot)).toBe(2);
        expect(slotOfSeq(ring, 1)).not.toBe(slot);
    });

    it('marks a claimed slot as being written (sequence 0) until it is published', () => {
        const ring = freshRing();
        writeOne(ring, 1);
        const slot = slotOfSeq(ring, 1);
        for (let i = 0; i < RING_SLOTS; i++) {
            writeOne(ring, 100 + i);
        }
        expect(slotOfSeq(ring, 1)).toBe(-1);
        const claimed = claimSlot(ring);
        expect(Atomics.load(ring.header, SLOT_SEQ + claimed)).toBe(0);
        expect(slot).toBeGreaterThanOrEqual(0);
    });

    it('answers -1 for a sequence that is gone after reuse, was never published or is not positive', () => {
        const ring = freshRing();
        for (let i = 1; i <= RING_SLOTS + 2; i++) {
            expect(writeOne(ring, i)).toBe(i);
        }
        expect(slotOfSeq(ring, 1)).toBe(-1);
        expect(slotOfSeq(ring, 2)).toBe(-1);
        expect(slotOfSeq(ring, 3)).toBeGreaterThanOrEqual(0);
        expect(slotOfSeq(ring, RING_SLOTS + 2)).toBeGreaterThanOrEqual(0);
        expect(slotOfSeq(ring, RING_SLOTS + 3)).toBe(-1);
        expect(slotOfSeq(ring, 0)).toBe(-1);
        expect(slotOfSeq(ring, -4)).toBe(-1);
    });
});

describe('claimSlot', () => {
    it('never returns the newest published slot, even with nothing held', () => {
        const ring = freshRing();
        for (let i = 0; i < 40; i++) {
            const slot = claimSlot(ring);
            expect(slot).not.toBe(slotOfSeq(ring, Atomics.load(ring.header, PUBLISHED)));
            publishSlot(ring, slot, i);
        }
    });

    it('returns -1 when every slot is held', () => {
        const ring = freshRing();
        for (let i = 0; i < RING_SLOTS; i++) {
            writeOne(ring, i);
        }
        holdFrom(ring, READER.MAIN, 1);
        expect(claimSlot(ring)).toBe(-1);
        holdFrom(ring, READER.MAIN, RELEASED);
        holdFrom(ring, READER.PACK, 1);
        expect(claimSlot(ring)).toBe(-1);
    });

    it('frees only the slots below the oldest hold of any reader', () => {
        const ring = freshRing();
        for (let i = 0; i < RING_SLOTS; i++) {
            writeOne(ring, i);
        }
        holdFrom(ring, READER.MAIN, 4);
        holdFrom(ring, READER.PACK, 3);
        const free = [slotOfSeq(ring, 1), slotOfSeq(ring, 2)];
        const slot = claimSlot(ring);
        expect(free).toContain(slot);
        expect(slotOfSeq(ring, 3)).toBeGreaterThanOrEqual(0);
        holdFrom(ring, READER.PACK, RELEASED);
        holdFrom(ring, READER.MAIN, RELEASED);
        expect(claimSlot(ring)).toBeGreaterThanOrEqual(0);
    });

    it('takes the oldest free slot first', () => {
        const ring = freshRing();
        for (let i = 0; i < RING_SLOTS; i++) {
            writeOne(ring, i);
        }
        const oldest = slotOfSeq(ring, 1);
        expect(claimSlot(ring)).toBe(oldest);
    });

    it('never overwrites a slot at or after any hold, over a random publish and hold sequence', () => {
        const ring = freshRing();
        let state = 12345;
        const random = (/** @type {number} */ n) => {
            state = (Math.imul(state, 1103515245) + 12345) >>> 0;
            return state % n;
        };
        let published = 0;
        for (let step = 0; step < 4000; step++) {
            const newest = Atomics.load(ring.header, PUBLISHED);
            const holds = [READER.MAIN, READER.PACK].map((r) => Atomics.load(ring.header, HELD + r));
            const protectedSeqs = [];
            for (let seq = Math.min(...holds, newest + 1); seq <= newest; seq++) {
                if (slotOfSeq(ring, seq) >= 0) {
                    protectedSeqs.push(seq);
                }
            }
            if (random(3) > 0) {
                const sequence = writeOne(ring, step);
                published += sequence >= 0 ? 1 : 0;
            }
            for (const seq of protectedSeqs) {
                expect(slotOfSeq(ring, seq)).toBeGreaterThanOrEqual(0);
            }
            const reader = random(2);
            const choice = random(4);
            // A reader only moves its hold forward, to a sequence that still exists, or releases.
            const now = Atomics.load(ring.header, HELD + reader);
            const target = Atomics.load(ring.header, PUBLISHED) - random(RING_SLOTS);
            if (choice === 0) {
                holdFrom(ring, reader, RELEASED);
            } else if (slotOfSeq(ring, target) >= 0 && (now === RELEASED || target >= now)) {
                holdFrom(ring, reader, target);
            }
        }
        expect(published).toBeGreaterThan(100);
    });
});

describe('holdFrom', () => {
    it('stores the hold, and RELEASED frees the reader', () => {
        const ring = freshRing();
        holdFrom(ring, READER.PACK, 9);
        expect(Atomics.load(ring.header, HELD + READER.PACK)).toBe(9);
        holdFrom(ring, READER.PACK, RELEASED);
        expect(Atomics.load(ring.header, HELD + READER.PACK)).toBe(0x7fffffff);
    });

    it('lets a released reader stop blocking the writer', () => {
        const ring = freshRing();
        for (let i = 0; i < RING_SLOTS; i++) {
            writeOne(ring, i);
        }
        holdFrom(ring, READER.PACK, 1);
        expect(claimSlot(ring)).toBe(-1);
        holdFrom(ring, READER.PACK, RELEASED);
        expect(claimSlot(ring)).toBeGreaterThanOrEqual(0);
    });
});
