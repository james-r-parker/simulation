// The snapshot ring: one SharedArrayBuffer holding an Int32Array header and RING_SLOTS snapshot slots, written by the
// sim worker and read by the main thread and the pack worker without copies (docs/designs/pack-worker.md, "Snapshot
// ring"). Pure: it touches only the buffer it is given, and the header only through Atomics.
//
// Sequence numbers start at 1 and rise by 1 per published snapshot; 0 means "no snapshot" (never written, or being
// written). A reader holds "from" a sequence: no slot whose sequence is at or after its hold is ever overwritten. The
// sequence is an Int32, so it wraps after about 2^31 snapshots, which is years at the snapshot rate.

/** Snapshot slots in the ring. */
export const RING_SLOTS = 6;

/** Readers that hold the ring: the main thread and the pack worker. */
export const RING_READERS = 2;

/** The reader indices. */
export const READER = Object.freeze({ MAIN: 0, PACK: 1 });

/** The `HELD` value of a reader that reads nothing: the largest Int32, so it protects no slot. */
export const RELEASED = 0x7fffffff;

/** Header word of the newest published sequence. */
export const PUBLISHED = 0;
/** Header word of `SLOT_SEQ[0]`; slot `k` is at `SLOT_SEQ + k`. */
export const SLOT_SEQ = 1;
/** Header word of `SLOT_TICK[0]`. */
export const SLOT_TICK = SLOT_SEQ + RING_SLOTS;
/** Header word of `HELD[0]`; reader `r` is at `HELD + r`. */
export const HELD = SLOT_TICK + RING_SLOTS;

const HEADER_WORDS = 16;
const HEADER_BYTES = HEADER_WORDS * 4;

/**
 * @typedef {object} Ring
 * @property {Int32Array} header the shared header (`PUBLISHED`, `SLOT_SEQ`, `SLOT_TICK`, `HELD` words)
 * @property {number} slotBytes bytes of one snapshot (not padded)
 * @property {{u32: Uint32Array, f32: Float32Array}[]} slots the views of each slot, made once
 */

/**
 * @param {number} slotBytes the bytes of one snapshot (`layout.bytes`)
 * @returns {number} the slot stride: `slotBytes` rounded up to 8, so every slot starts 8-byte aligned
 */
function strideOf(slotBytes) {
    return Math.ceil(slotBytes / 8) * 8;
}

/**
 * @param {number} slotBytes the bytes of one snapshot
 * @returns {number} the buffer size for the header and `RING_SLOTS` slots
 */
export function ringBytes(slotBytes) {
    return HEADER_BYTES + RING_SLOTS * strideOf(slotBytes);
}

/**
 * Makes every view of the ring once. A fresh buffer is zero (nothing published, and holds of 0 that protect every slot),
 * so the writer calls `releaseAll` on it before the first claim.
 * @param {SharedArrayBuffer | ArrayBuffer} memory a buffer of `ringBytes(slotBytes)` bytes
 * @param {number} slotBytes the bytes of one snapshot
 * @returns {Ring} the views
 * @throws {Error} when `slotBytes` is not a multiple of 4 or the buffer is not `ringBytes(slotBytes)` bytes
 */
export function createRingViews(memory, slotBytes) {
    if (slotBytes % 4 !== 0) {
        throw new Error(`createRingViews: slotBytes ${slotBytes} is not a multiple of 4`);
    }
    if (memory.byteLength !== ringBytes(slotBytes)) {
        throw new Error(`createRingViews: ${memory.byteLength} bytes, expected ${ringBytes(slotBytes)}`);
    }
    const header = new Int32Array(memory, 0, HEADER_WORDS);
    const stride = strideOf(slotBytes);
    const slots = [];
    for (let k = 0; k < RING_SLOTS; k++) {
        const offset = HEADER_BYTES + k * stride;
        slots.push({
            u32: new Uint32Array(memory, offset, slotBytes / 4),
            f32: new Float32Array(memory, offset, slotBytes / 4),
        });
    }
    return { header, slotBytes, slots };
}

/**
 * Releases both readers: a new ring starts with no one holding anything. Called once by the writer on a fresh buffer.
 * @param {Ring} ring the ring
 * @returns {void}
 */
export function releaseAll(ring) {
    for (let r = 0; r < RING_READERS; r++) {
        Atomics.store(ring.header, HELD + r, RELEASED);
    }
}

/**
 * Claims a slot to write: one whose sequence is below every reader's hold, and not the newest published one. The slot's
 * `SLOT_SEQ` is set to 0 while it is written. Of the free slots the oldest is taken.
 * @param {Ring} ring the ring
 * @returns {number} the slot, -1 when every slot is held (or is the newest)
 */
export function claimSlot(ring) {
    const { header } = ring;
    let limit = RELEASED;
    for (let r = 0; r < RING_READERS; r++) {
        limit = Math.min(limit, Atomics.load(header, HELD + r));
    }
    const newest = Atomics.load(header, PUBLISHED);
    let best = -1;
    let bestSeq = RELEASED;
    for (let k = 0; k < RING_SLOTS; k++) {
        const seq = Atomics.load(header, SLOT_SEQ + k);
        if (seq < limit && (seq === 0 || seq !== newest) && seq < bestSeq) {
            best = k;
            bestSeq = seq;
        }
    }
    if (best >= 0) {
        Atomics.store(header, SLOT_SEQ + best, 0);
    }
    return best;
}

/**
 * Publishes a written slot under the next sequence number.
 * @param {Ring} ring the ring
 * @param {number} slot the slot `claimSlot` returned
 * @param {number} tick the world tick the slot holds
 * @returns {number} the sequence number it was published as
 */
export function publishSlot(ring, slot, tick) {
    const { header } = ring;
    const seq = Atomics.load(header, PUBLISHED) + 1;
    Atomics.store(header, SLOT_TICK + slot, tick);
    Atomics.store(header, SLOT_SEQ + slot, seq);
    Atomics.store(header, PUBLISHED, seq);
    return seq;
}

/**
 * Sets what a reader may still read: no slot at or after `seq` is overwritten until the next hold.
 * @param {Ring} ring the ring
 * @param {number} reader `READER.MAIN` or `READER.PACK`
 * @param {number} seq the oldest sequence to keep, or `RELEASED`
 * @returns {void}
 */
export function holdFrom(ring, reader, seq) {
    Atomics.store(ring.header, HELD + reader, seq);
}

/**
 * @param {Ring} ring the ring
 * @param {number} seq a sequence number
 * @returns {number} the slot holding `seq`, -1 when it is gone (or never published)
 */
export function slotOfSeq(ring, seq) {
    if (seq <= 0) {
        return -1;
    }
    for (let k = 0; k < RING_SLOTS; k++) {
        if (Atomics.load(ring.header, SLOT_SEQ + k) === seq) {
            return k;
        }
    }
    return -1;
}
