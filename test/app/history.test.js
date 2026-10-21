import { describe, expect, it } from 'vitest';
import {
    clearHistory,
    columns,
    createHistory,
    HISTORY_SIZE,
    INITIAL_SAMPLE_MS,
    lookback,
    pushSample,
} from '../../js/app/history.js';

/** @returns {ReturnType<typeof createHistory>} a history with one level and one flow, small enough to fill */
function small() {
    return createHistory({ names: ['pop', 'births'], kinds: ['level', 'flow'], capacity: 4, sampleMs: 1000 });
}

describe('createHistory', () => {
    it('defaults to 1024 samples at 5 s', () => {
        const h = createHistory({ names: ['a'], kinds: ['level'] });
        expect(h.capacity).toBe(HISTORY_SIZE);
        expect(h.sampleMs).toBe(INITIAL_SAMPLE_MS);
    });

    it('rejects mismatched lengths and an odd capacity', () => {
        expect(() => createHistory({ names: ['a'], kinds: [] })).toThrow(/1 names but 0 kinds/);
        expect(() => createHistory({ names: ['a'], kinds: ['level'], capacity: 3 })).toThrow(/even/);
    });
});

describe('pushSample', () => {
    it('stores the newest level and the summed flow once per interval', () => {
        const h = small();
        expect(pushSample(h, { nowMs: 0, tick: 10, values: [5, 2] })).toBe(true);
        expect(pushSample(h, { nowMs: 400, tick: 20, values: [6, 3] })).toBe(false);
        expect(pushSample(h, { nowMs: 800, tick: 30, values: [7, 4] })).toBe(false);
        expect(pushSample(h, { nowMs: 1000, tick: 40, values: [8, 1] })).toBe(true);
        const c = columns(h);
        expect(Array.from(c.t)).toEqual([10, 40]);
        expect(Array.from(c.pop)).toEqual([5, 8]);
        expect(Array.from(c.births)).toEqual([2, 8]);
    });

    it('halves a full history, summing flows in pairs and doubling the interval', () => {
        const h = small();
        for (let i = 0; i < 4; i++) {
            pushSample(h, { nowMs: i * 1000, tick: i, values: [i * 10, 1] });
        }
        expect(h.count).toBe(4);
        pushSample(h, { nowMs: 4000, tick: 4, values: [40, 1] });
        const c = columns(h);
        expect(h.sampleMs).toBe(2000);
        expect(Array.from(c.t)).toEqual([1, 3, 4]);
        expect(Array.from(c.pop)).toEqual([10, 30, 40]);
        expect(Array.from(c.births)).toEqual([2, 2, 1]);
    });

    it('keeps its size however long the run is, and loses no flow', () => {
        const h = small();
        let total = 0;
        for (let i = 0; i < 1000; i++) {
            pushSample(h, { nowMs: i * 500, tick: i, values: [i, 3] });
            total += 3;
        }
        expect(h.count).toBeLessThanOrEqual(4);
        const kept = Array.from(columns(h).births).reduce((a, b) => a + b, 0) + h.pending[1];
        expect(kept).toBe(total);
        expect(h.t.length).toBe(4);
    });
});

describe('columns and clearHistory', () => {
    it('gives views of the samples held, not the whole buffers', () => {
        const h = small();
        pushSample(h, { nowMs: 0, tick: 1, values: [1, 1] });
        expect(columns(h).t).toHaveLength(1);
        expect(columns(h).t.buffer).toBe(h.t.buffer);
    });

    it('starts over for a new world', () => {
        const h = small();
        for (let i = 0; i < 6; i++) {
            pushSample(h, { nowMs: i * 1000, tick: i, values: [1, 1] });
        }
        clearHistory(h);
        expect(h.count).toBe(0);
        expect(h.sampleMs).toBe(INITIAL_SAMPLE_MS);
        expect(pushSample(h, { nowMs: 0, tick: 0, values: [1, 1] })).toBe(true);
        expect(Array.from(columns(h).births)).toEqual([1]);
    });
});

describe('lookback', () => {
    it('reads a series about the given time before the newest sample', () => {
        const h = createHistory({ names: ['pop'], kinds: ['level'], capacity: 8, sampleMs: 5000 });
        for (let i = 0; i < 6; i++) {
            pushSample(h, { nowMs: i * 5000, tick: i, values: [100 + i] });
        }
        expect(lookback(h, { series: 'pop', agoMs: 60000 })).toBeNull();
        expect(lookback(h, { series: 'pop', agoMs: 10000 })).toBe(103);
        expect(lookback(h, { series: 'pop', agoMs: 0 })).toBe(105);
        expect(lookback(h, { series: 'missing', agoMs: 0 })).toBeNull();
    });
});
