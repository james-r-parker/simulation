// Lane allocation. The per-slot arrays of the effect stores and of the blended agents are built through an allocator, so
// the same constructor makes plain arrays (tests, the one-thread reference) or views over one SharedArrayBuffer (the
// pack worker, docs/designs/pack-worker.md). Every lane starts 8-byte aligned, so any element type can sit anywhere.

/**
 * @callback LaneAllocator
 * @param {any} Type a typed array class
 * @param {number} length elements
 * @returns {any} the lane
 */

/** Bytes every lane is aligned to. */
export const LANE_ALIGN = 8;

/**
 * @param {number} bytes a byte count
 * @returns {number} it rounded up to a multiple of `LANE_ALIGN`
 */
export function alignUp(bytes) {
    return Math.ceil(bytes / LANE_ALIGN) * LANE_ALIGN;
}

/**
 * The default allocator: a plain array of its own.
 * @param {any} Type a typed array class
 * @param {number} length elements
 * @returns {any} a new array
 */
export function plainLane(Type, length) {
    return new Type(length);
}

/**
 * Hands out lanes one after another from `start`. With no memory it measures instead: it returns empty arrays and counts
 * the bytes the lanes would take, so a layout is sized by the code that builds it.
 * @param {SharedArrayBuffer | ArrayBuffer | null} memory the buffer to carve, null to measure
 * @param {number} [start] the byte offset of the first lane
 * @returns {{alloc: LaneAllocator, end: () => number}} `alloc` carves the next lane; `end` is the byte offset after the
 *   last one, rounded up to 8
 */
export function createLanes(memory, start = 0) {
    let offset = alignUp(start);
    return {
        alloc(Type, length) {
            const at = offset;
            offset = alignUp(offset + length * Type.BYTES_PER_ELEMENT);
            return memory === null ? new Type(0) : new Type(memory, at, length);
        },
        end: () => offset,
    };
}
