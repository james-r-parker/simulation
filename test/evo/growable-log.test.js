import { describe, expect, it } from 'vitest';
import { createLog, ensureRoom } from '../../js/evo/growable-log.js';

describe('growable log', () => {
    it('creates zeroed Float64 columns of the given capacity', () => {
        const log = createLog(['a', 'b'], 4);
        expect(log.capacity).toBe(4);
        expect(log.a).toEqual(new Float64Array(4));
        expect(log.b.length).toBe(4);
    });

    it('leaves the columns alone while the row fits', () => {
        const log = createLog(['a'], 4);
        const before = log.a;
        ensureRoom(log, 3);
        expect(log.a).toBe(before);
        expect(log.capacity).toBe(4);
    });

    it('doubles every column when the row is at the capacity and keeps the data', () => {
        const log = createLog(['a', 'b'], 2);
        log.a.set([1, 2]);
        log.b.set([3, 4]);
        ensureRoom(log, 2);
        expect(log.capacity).toBe(4);
        expect(Array.from(log.a)).toEqual([1, 2, 0, 0]);
        expect(Array.from(log.b)).toEqual([3, 4, 0, 0]);
    });

    it('defaults to 64 rows', () => {
        expect(createLog(['a']).capacity).toBe(64);
    });
});
