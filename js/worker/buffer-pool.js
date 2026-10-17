// A fixed set of equal buffers handed out to be transferred and given back. The worker's snapshot pool holds 3 and
// its field pool 2; the main thread keeps at most two snapshots, so the worker always holds at least one.

/** Buffers in the snapshot pool. */
export const SNAPSHOT_POOL_SIZE = 3;

/** Buffers in the field pool. */
export const FIELD_POOL_SIZE = 2;

/**
 * @typedef {object} BufferPool
 * @property {number} count buffers the pool owns in all
 * @property {number} bytes the size of each
 * @property {(ArrayBuffer | undefined)[]} free the buffers the worker holds, `freeCount` of them from index 0
 * @property {number} freeCount buffers the worker holds now
 */

/**
 * @param {{count: number, bytes: number}} options how many buffers and how large
 * @returns {BufferPool} a pool holding `count` fresh buffers
 */
export function createBufferPool({ count, bytes }) {
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(bytes) || bytes < 1) {
        throw new Error(`createBufferPool: count and bytes must be positive integers, got ${count} and ${bytes}`);
    }
    const free = new Array(count);
    for (let i = 0; i < count; i++) {
        free[i] = new ArrayBuffer(bytes);
    }
    return { count, bytes, free, freeCount: count };
}

/**
 * Hands out a buffer the worker holds; the caller transfers it.
 * @param {BufferPool} pool the pool
 * @returns {ArrayBuffer | undefined} a buffer, or undefined when the worker holds none
 */
export function takeBuffer(pool) {
    if (pool.freeCount === 0) {
        return undefined;
    }
    pool.freeCount -= 1;
    const buffer = pool.free[pool.freeCount];
    pool.free[pool.freeCount] = undefined;
    return buffer;
}

/**
 * Takes a transferred buffer back. A buffer arriving from another thread is a new object, so the pool counts buffers
 * and does not track identity.
 * @param {BufferPool} pool the pool
 * @param {ArrayBuffer} buffer the returned buffer
 * @returns {void}
 * @throws {Error} when the buffer is not `bytes` long (detached, or from another pool) or the pool already holds all
 *   of its buffers
 */
export function giveBuffer(pool, buffer) {
    if (buffer.byteLength !== pool.bytes) {
        throw new Error(`giveBuffer: expected a buffer of ${pool.bytes} bytes, got ${buffer.byteLength}`);
    }
    if (pool.freeCount === pool.count) {
        throw new Error(`giveBuffer: the pool of ${pool.count} buffers already holds them all`);
    }
    pool.free[pool.freeCount] = buffer;
    pool.freeCount += 1;
}
