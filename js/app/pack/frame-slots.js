// The frame slots: one SharedArrayBuffer between the main thread and the pack worker (docs/designs/pack-worker.md,
// "Frame slots"). A request block the main thread writes every frame, and FRAME_SLOTS output slots the worker fills, each
// holding the blended agents and every spec bucket's interleaved instance rows. Pure: it touches only the buffer it is
// given, and the words both threads race on only through Atomics.
//
// A request is guarded by a sequence lock: the writer stores `BEGIN`, writes the fields, then stores `SEQ` and notifies;
// the reader takes a request only when `BEGIN` still equals the `SEQ` it started from after copying the fields, so a
// request the main thread overwrites mid-read is read again, never torn. A slot is protected by two indices: the newest
// published slot and the one the main thread reads (`takeFrame`); the worker writes the third.

import { FAMILY_SLOTS } from '../family-slots.js';
import { createInterpolated } from '../interpolate.js';
import { createLanes } from '../lanes.js';
import { PALETTE_NAMES } from '../prefs.js';
import { AGENT_ROW_FLOATS } from '../renderer/agent-lanes.js';

/** Output slots: one the worker writes, one the main thread reads, one published and waiting. */
export const FRAME_SLOTS = 3;

/** Int32 words of the request block. */
export const REQ = Object.freeze({
    /** The sequence number of the newest complete request; the worker waits on it. */
    SEQ: 0,
    /** The sequence number the writer is writing; equal to `SEQ` between requests. */
    BEGIN: 1,
    /** 1 once the worker must exit. */
    STOP: 2,
    PREV_SEQ: 3,
    LATEST_SEQ: 4,
    LENS: 5,
    PALETTE: 6,
    /** The newest published slot plus 1, 0 before the first. */
    PUBLISHED: 7,
    /** The slot the main thread reads plus 1, 0 when none. */
    READING: 8,
    /** Requests the worker skipped because a snapshot slot was overwritten under it. */
    SKIPPED: 9,
    /** The first of the `FAMILY_SLOTS` family ids. */
    FAMILY: 10,
});
const REQ_WORDS = 32;
/** Float64 words after them: the playhead blend factor and tick, wall time and the zoom. */
export const REQ_F64 = Object.freeze({ ALPHA: 0, TICK: 1, NOW_MS: 2, ZOOM: 3 });
const REQ_F64_WORDS = 4;
const REQUEST_BYTES = REQ_WORDS * 4 + REQ_F64_WORDS * 8;

/** Int32 words of a slot header; the bucket row counts follow. */
export const SLOT = Object.freeze({
    /** The request the slot answers, 0 while it is written. */
    SEQ: 0,
    /** Agents blended. */
    COUNT: 1,
    PREV_SEQ: 2,
    LATEST_SEQ: 3,
    /** The first bucket's row count. */
    BUCKETS: 4,
});
/** Float64 words of a slot's meta: what the request that made it asked for. */
export const SLOT_F64 = Object.freeze({ ALPHA: 0, TICK: 1, NOW_MS: 2 });

/** The lens bits of a request. */
export const LENS = Object.freeze({ TEMPERATURE: 1, SCENT: 2, TERRITORY: 4, VISION: 8, CALLS: 16 });

/**
 * @typedef {object} Request one frame's request, rewritten in place
 * @property {number} seq the request's sequence number (0 for none; set by the reader)
 * @property {number} prevSeq the older snapshot's ring sequence
 * @property {number} latestSeq the newer snapshot's ring sequence
 * @property {number} alpha the blend factor
 * @property {number} tick the render tick
 * @property {number} nowMs wall time
 * @property {number} zoom the camera zoom
 * @property {number} lens the lens bits (`LENS`)
 * @property {number} palette the index into `PALETTE_NAMES`
 * @property {Int32Array} family the family id in each colour slot, -1 for free
 */

/**
 * @returns {Request} an empty request
 */
export function createRequest() {
    return {
        seq: 0,
        prevSeq: 0,
        latestSeq: 0,
        alpha: 1,
        tick: 0,
        nowMs: 0,
        zoom: 1,
        lens: 0,
        palette: 0,
        family: new Int32Array(FAMILY_SLOTS).fill(-1),
    };
}

/**
 * @typedef {object} FrameSlot
 * @property {Int32Array} head `SEQ`, `COUNT`, the snapshot sequences and the bucket row counts
 * @property {Float64Array} meta alpha, tick and wall time of the request it answers
 * @property {import('../interpolate.js').Interpolated} agents the blended agents over the slot's memory
 * @property {Float32Array[]} rows per spec bucket, its interleaved instance rows (`AGENT_ROW_FLOATS` each)
 */

/**
 * @typedef {object} FrameSlots
 * @property {Int32Array} req the request block's Int32 words
 * @property {Float64Array} reqF64 its Float64 words
 * @property {FrameSlot[]} slots the output slots, views made once
 * @property {number} capacity the most agents a slot holds
 * @property {number} buckets the spec buckets per slot
 * @property {{seq: number, prevSeq: number, latestSeq: number, alpha: number, tick: number, nowMs: number}} taken the
 *   slot `takeFrame` returned last, rewritten by it
 * @property {FrameSlot | null} current the slot `takeFrame` returned last, null before the first
 * @property {boolean} fresh whether the last `takeFrame` returned a slot it had not returned before
 */

/**
 * Builds one slot's lanes from an allocator, so the same code sizes the buffer and makes the views.
 * @param {import('../lanes.js').LaneAllocator} alloc the lane allocator
 * @param {{maxAgents: number, specs: unknown[]}} info `ready.info`
 * @returns {FrameSlot} the slot
 */
function buildSlot(alloc, info) {
    const buckets = info.specs.length;
    const head = alloc(Int32Array, SLOT.BUCKETS + buckets);
    const meta = alloc(Float64Array, 3);
    const agents = createInterpolated(info.maxAgents, alloc);
    const rows = info.specs.map(() => alloc(Float32Array, info.maxAgents * AGENT_ROW_FLOATS));
    return { head, meta, agents, rows };
}

/**
 * @param {{maxAgents: number, specs: unknown[]}} info `ready.info`: the agent cap and the spec buckets
 * @returns {number} the buffer size for the request block and `FRAME_SLOTS` slots, every lane 8-byte aligned
 */
export function frameSlotBytes(info) {
    const lanes = createLanes(null, REQUEST_BYTES);
    for (let k = 0; k < FRAME_SLOTS; k++) {
        buildSlot(lanes.alloc, info);
    }
    return lanes.end();
}

/**
 * @param {SharedArrayBuffer | ArrayBuffer} memory a buffer of `frameSlotBytes(info)` bytes (zero on creation)
 * @param {{maxAgents: number, specs: unknown[]}} info `ready.info`
 * @returns {FrameSlots} the request view and every slot's views
 * @throws {Error} when the buffer is not `frameSlotBytes(info)` bytes
 */
export function createFrameSlots(memory, info) {
    if (memory.byteLength !== frameSlotBytes(info)) {
        throw new Error(`createFrameSlots: ${memory.byteLength} bytes, expected ${frameSlotBytes(info)}`);
    }
    const lanes = createLanes(memory, REQUEST_BYTES);
    const slots = [];
    for (let k = 0; k < FRAME_SLOTS; k++) {
        slots.push(buildSlot(lanes.alloc, info));
    }
    return {
        req: new Int32Array(memory, 0, REQ_WORDS),
        reqF64: new Float64Array(memory, REQ_WORDS * 4, REQ_F64_WORDS),
        slots,
        capacity: info.maxAgents,
        buckets: info.specs.length,
        taken: { seq: 0, prevSeq: 0, latestSeq: 0, alpha: 1, tick: 0, nowMs: 0 },
        current: null,
        fresh: false,
    };
}

/**
 * @param {readonly boolean[] | {temperature: boolean, scent: boolean, territory: boolean, vision: boolean, calls: boolean}} lenses
 *   the frame's lens flags
 * @returns {number} the lens bits
 */
export function lensBits(lenses) {
    const l = /** @type {any} */ (lenses);
    return (
        (l.temperature ? LENS.TEMPERATURE : 0) |
        (l.scent ? LENS.SCENT : 0) |
        (l.territory ? LENS.TERRITORY : 0) |
        (l.vision ? LENS.VISION : 0) |
        (l.calls ? LENS.CALLS : 0)
    );
}

/**
 * @param {string} palette a palette name
 * @returns {number} its index in `PALETTE_NAMES` (0, the default, for an unknown name)
 */
export function paletteIndex(palette) {
    return Math.max(PALETTE_NAMES.indexOf(palette), 0);
}

/**
 * Writes a request and wakes the worker.
 * @param {FrameSlots} slots the frame slots
 * @param {Request} request the frame to pack
 * @returns {number} the request's sequence number
 */
export function writeRequest(slots, request) {
    const { req, reqF64 } = slots;
    const last = Atomics.load(req, REQ.SEQ);
    const seq = last >= 0x7ffffffe ? 1 : last + 1;
    Atomics.store(req, REQ.BEGIN, seq);
    Atomics.store(req, REQ.PREV_SEQ, request.prevSeq);
    Atomics.store(req, REQ.LATEST_SEQ, request.latestSeq);
    Atomics.store(req, REQ.LENS, request.lens);
    Atomics.store(req, REQ.PALETTE, request.palette);
    for (let s = 0; s < FAMILY_SLOTS; s++) {
        Atomics.store(req, REQ.FAMILY + s, request.family[s]);
    }
    reqF64[REQ_F64.ALPHA] = request.alpha;
    reqF64[REQ_F64.TICK] = request.tick;
    reqF64[REQ_F64.NOW_MS] = request.nowMs;
    reqF64[REQ_F64.ZOOM] = request.zoom;
    Atomics.store(req, REQ.SEQ, seq);
    Atomics.notify(req, REQ.SEQ);
    return seq;
}

/**
 * Copies the newest request, retrying when the main thread overwrites it mid-copy.
 * @param {FrameSlots} slots the frame slots
 * @param {Request} out receives the request
 * @returns {number} its sequence number, 0 when none has been written
 */
export function readRequest(slots, out) {
    const { req, reqF64 } = slots;
    for (;;) {
        const seq = Atomics.load(req, REQ.SEQ);
        if (seq === 0) {
            return 0;
        }
        out.prevSeq = Atomics.load(req, REQ.PREV_SEQ);
        out.latestSeq = Atomics.load(req, REQ.LATEST_SEQ);
        out.lens = Atomics.load(req, REQ.LENS);
        out.palette = Atomics.load(req, REQ.PALETTE);
        for (let s = 0; s < FAMILY_SLOTS; s++) {
            out.family[s] = Atomics.load(req, REQ.FAMILY + s);
        }
        out.alpha = reqF64[REQ_F64.ALPHA];
        out.tick = reqF64[REQ_F64.TICK];
        out.nowMs = reqF64[REQ_F64.NOW_MS];
        out.zoom = reqF64[REQ_F64.ZOOM];
        if (Atomics.load(req, REQ.BEGIN) === seq) {
            out.seq = seq;
            return seq;
        }
    }
}

/**
 * Asks the worker to exit: sets `STOP` and wakes it.
 * @param {FrameSlots} slots the frame slots
 * @returns {void}
 */
export function requestStop(slots) {
    Atomics.store(slots.req, REQ.STOP, 1);
    Atomics.notify(slots.req, REQ.SEQ);
}

/**
 * @param {FrameSlots} slots the frame slots
 * @returns {boolean} whether the worker was asked to exit
 */
export function isStopped(slots) {
    return Atomics.load(slots.req, REQ.STOP) === 1;
}

/**
 * Counts a request the worker skipped.
 * @param {FrameSlots} slots the frame slots
 * @returns {void}
 */
export function noteSkipped(slots) {
    Atomics.add(slots.req, REQ.SKIPPED, 1);
}

/**
 * @param {FrameSlots} slots the frame slots
 * @returns {number} the requests the worker has skipped so far
 */
export function skippedPacks(slots) {
    return Atomics.load(slots.req, REQ.SKIPPED);
}

/**
 * Claims the slot to write: neither the newest published one nor the one the main thread reads. Its `SEQ` is 0 while it
 * is written.
 * @param {FrameSlots} slots the frame slots
 * @returns {number} the slot index (there is always one, with `FRAME_SLOTS` 3)
 */
export function claimFrameSlot(slots) {
    const published = Atomics.load(slots.req, REQ.PUBLISHED);
    const reading = Atomics.load(slots.req, REQ.READING);
    let k = 0;
    while (k + 1 === published || k + 1 === reading) {
        k += 1;
    }
    Atomics.store(slots.slots[k].head, SLOT.SEQ, 0);
    return k;
}

/**
 * Writes the request's values into a slot's meta, before it is published.
 * @param {FrameSlots} slots the frame slots
 * @param {{slot: number, request: Request}} at the slot and the request it answers
 * @returns {void}
 */
export function writeSlotMeta(slots, { slot, request }) {
    const s = slots.slots[slot];
    s.head[SLOT.PREV_SEQ] = request.prevSeq;
    s.head[SLOT.LATEST_SEQ] = request.latestSeq;
    s.meta[SLOT_F64.ALPHA] = request.alpha;
    s.meta[SLOT_F64.TICK] = request.tick;
    s.meta[SLOT_F64.NOW_MS] = request.nowMs;
}

/**
 * Publishes a written slot: stores its agent count and the request it answers, then makes it the newest.
 * @param {FrameSlots} slots the frame slots
 * @param {number} slot the slot `claimFrameSlot` returned
 * @param {number} seq the request it answers
 * @returns {void}
 */
export function publishFrame(slots, slot, seq) {
    const s = slots.slots[slot];
    Atomics.store(s.head, SLOT.COUNT, s.agents.count);
    Atomics.store(s.head, SLOT.SEQ, seq);
    Atomics.store(slots.req, REQ.PUBLISHED, slot + 1);
}

/**
 * Takes the newest published slot for the main thread and marks it read until the next call, so the worker never writes
 * it. `fresh` says whether it is a slot not returned before.
 * @param {FrameSlots} slots the frame slots
 * @returns {import('../interpolate.js').Interpolated | null} the slot's agents with `count` set from its header, null
 *   before the first publish
 */
export function takeFrame(slots) {
    const { req } = slots;
    let published = Atomics.load(req, REQ.PUBLISHED);
    for (;;) {
        if (published === 0) {
            slots.fresh = false;
            return null;
        }
        Atomics.store(req, REQ.READING, published);
        const again = Atomics.load(req, REQ.PUBLISHED);
        if (again === published) {
            break;
        }
        published = again;
    }
    const slot = slots.slots[published - 1];
    const seq = Atomics.load(slot.head, SLOT.SEQ);
    const { taken } = slots;
    slots.fresh = seq !== taken.seq;
    taken.seq = seq;
    taken.prevSeq = slot.head[SLOT.PREV_SEQ];
    taken.latestSeq = slot.head[SLOT.LATEST_SEQ];
    taken.alpha = slot.meta[SLOT_F64.ALPHA];
    taken.tick = slot.meta[SLOT_F64.TICK];
    taken.nowMs = slot.meta[SLOT_F64.NOW_MS];
    slots.current = slot;
    slot.agents.count = Atomics.load(slot.head, SLOT.COUNT);
    return slot.agents;
}

/**
 * @param {FrameSlots} slots the frame slots
 * @param {number} bucket a spec bucket
 * @returns {number} the rows the current slot holds for it, 0 before the first take
 */
export function bucketRows(slots, bucket) {
    return slots.current === null ? 0 : slots.current.head[SLOT.BUCKETS + bucket];
}
