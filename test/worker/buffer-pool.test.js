import { describe, expect, it } from 'vitest';
import {
    FIELD_POOL_SIZE,
    SNAPSHOT_POOL_SIZE,
    createBufferPool,
    giveBuffer,
    takeBuffer,
} from '../../js/worker/buffer-pool.js';

/**
 * Plays the main thread: it keeps the two newest snapshot buffers and returns the older one at once.
 * @param {ReturnType<typeof createBufferPool>} pool the worker's pool
 * @returns {{receive: (buffer: ArrayBuffer) => void, held: () => number}} the receive function and its held count
 */
function mainThread(pool) {
    /** @type {ArrayBuffer[]} */
    const held = [];
    return {
        receive(buffer) {
            held.push(buffer);
            if (held.length > 2) {
                giveBuffer(pool, /** @type {ArrayBuffer} */ (held.shift()));
            }
        },
        held: () => held.length,
    };
}

describe('createBufferPool', () => {
    it('holds the requested number of equal buffers', () => {
        const pool = createBufferPool({ count: SNAPSHOT_POOL_SIZE, bytes: 64 });
        expect(SNAPSHOT_POOL_SIZE).toBe(3);
        expect(pool.freeCount).toBe(3);
        const sizes = [takeBuffer(pool), takeBuffer(pool), takeBuffer(pool)].map((b) => b?.byteLength);
        expect(sizes).toEqual([64, 64, 64]);
    });

    it('rejects a count or a size that is not a positive integer', () => {
        expect(() => createBufferPool({ count: 0, bytes: 8 })).toThrow('positive integers');
        expect(() => createBufferPool({ count: 2, bytes: 0 })).toThrow('positive integers');
        expect(() => createBufferPool({ count: 2, bytes: 1.5 })).toThrow('positive integers');
    });
});

describe('takeBuffer and giveBuffer', () => {
    it('hands out distinct buffers and returns undefined when none is held', () => {
        const pool = createBufferPool({ count: 2, bytes: 8 });
        const a = takeBuffer(pool);
        const b = takeBuffer(pool);
        expect(a).not.toBe(b);
        expect(takeBuffer(pool)).toBeUndefined();
        expect(pool.freeCount).toBe(0);
    });

    it('takes a returned buffer back, whatever object it is', () => {
        const pool = createBufferPool({ count: 1, bytes: 8 });
        takeBuffer(pool);
        const replacement = new ArrayBuffer(8);
        giveBuffer(pool, replacement);
        expect(takeBuffer(pool)).toBe(replacement);
    });

    it('rejects a detached or wrong-sized buffer', () => {
        const pool = createBufferPool({ count: 1, bytes: 8 });
        const buffer = /** @type {ArrayBuffer} */ (takeBuffer(pool));
        structuredClone(buffer, { transfer: [buffer] });
        expect(() => giveBuffer(pool, buffer)).toThrow('expected a buffer of 8 bytes, got 0');
        expect(() => giveBuffer(pool, new ArrayBuffer(16))).toThrow('got 16');
    });

    it('rejects a return into a pool that holds all of its buffers', () => {
        const pool = createBufferPool({ count: 2, bytes: 8 });
        expect(() => giveBuffer(pool, new ArrayBuffer(8))).toThrow('already holds them all');
    });
});

describe('a worker with three buffers and a main thread that keeps two', () => {
    it('always holds at least one buffer once the main thread is steady', () => {
        const pool = createBufferPool({ count: SNAPSHOT_POOL_SIZE, bytes: 8 });
        const main = mainThread(pool);
        for (let i = 0; i < 100; i++) {
            const buffer = takeBuffer(pool);
            expect(buffer).toBeDefined();
            main.receive(/** @type {ArrayBuffer} */ (buffer));
            expect(main.held()).toBeLessThanOrEqual(2);
            expect(pool.freeCount).toBeGreaterThanOrEqual(1);
        }
    });

    it('skips a snapshot when the worker holds none and posts again after a return', () => {
        const pool = createBufferPool({ count: 3, bytes: 8 });
        const sent = [takeBuffer(pool), takeBuffer(pool), takeBuffer(pool)];
        expect(takeBuffer(pool)).toBeUndefined();
        giveBuffer(pool, /** @type {ArrayBuffer} */ (sent[0]));
        expect(takeBuffer(pool)).toBeDefined();
    });
});

describe('the field pool', () => {
    it('delivers ten fields in a row when each is returned at once', () => {
        const pool = createBufferPool({ count: FIELD_POOL_SIZE, bytes: 8 });
        expect(FIELD_POOL_SIZE).toBe(2);
        let delivered = 0;
        for (let i = 0; i < 10; i++) {
            const buffer = takeBuffer(pool);
            if (buffer !== undefined) {
                delivered += 1;
                giveBuffer(pool, buffer);
            }
        }
        expect(delivered).toBe(10);
    });

    it('skips a field when both buffers are with the client', () => {
        const pool = createBufferPool({ count: FIELD_POOL_SIZE, bytes: 8 });
        takeBuffer(pool);
        takeBuffer(pool);
        expect(takeBuffer(pool)).toBeUndefined();
    });
});
