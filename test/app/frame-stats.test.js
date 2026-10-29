import { describe, expect, it } from 'vitest';
import {
    clearFrameStats,
    createFrameRing,
    createFrameStats,
    frameReport,
    MAX_INTERVAL_MS,
    percentile,
    recordFrame,
} from '../../js/app/frame-stats.js';

describe('frame stats', () => {
    it('reports percentiles of intervals and draw times', () => {
        const stats = createFrameStats();
        for (let i = 1; i <= 100; i++) {
            recordFrame(stats, i, i / 10);
        }
        const report = frameReport(stats);
        expect(report.frames).toBe(100);
        expect(report.frameMs).toEqual({ p50: 50, p95: 95, p99: 99 });
        expect(report.drawMs).toEqual({ p50: 5, p95: 9.5, p99: 9.9 });
    });

    it('measures the refresh rate from the fast frames, so dropped frames do not stretch it', () => {
        const stats = createFrameStats();
        for (let i = 0; i < 80; i++) {
            recordFrame(stats, 4.17, 1);
        }
        for (let i = 0; i < 20; i++) {
            recordFrame(stats, 12.5, 1);
        }
        const report = frameReport(stats);
        expect(report.refreshMs).toBe(4.17);
        expect(report.refreshHz).toBe(239.8);
    });

    it('ignores intervals while hidden, over 250 ms or not positive', () => {
        const stats = createFrameStats();
        expect(recordFrame(stats, 16, 1, true)).toBe(false);
        expect(recordFrame(stats, MAX_INTERVAL_MS + 1, 1)).toBe(false);
        expect(recordFrame(stats, 0, 1)).toBe(false);
        expect(recordFrame(stats, NaN, 1)).toBe(false);
        expect(recordFrame(stats, MAX_INTERVAL_MS, 1)).toBe(true);
        expect(frameReport(stats).frames).toBe(1);
    });

    it('reports zeros before any frame', () => {
        const report = frameReport(createFrameStats());
        expect(report).toMatchObject({ frames: 0, refreshMs: 0, refreshHz: 0, frameMs: { p50: 0, p95: 0, p99: 0 } });
    });

    it('keeps only the newest samples', () => {
        const stats = createFrameStats(10);
        for (let i = 1; i <= 25; i++) {
            recordFrame(stats, i, 1);
        }
        expect(frameReport(stats).frames).toBe(10);
        expect(frameReport(stats).frameMs.p50).toBe(20);
    });

    it('forgets every frame when cleared', () => {
        const stats = createFrameStats(16);
        recordFrame(stats, 5, 1);
        clearFrameStats(stats, 16);
        expect(frameReport(stats).frames).toBe(0);
        recordFrame(stats, 6, 1);
        expect(frameReport(stats).frames).toBe(1);
    });
});

describe('percentile', () => {
    it('returns nearest-rank values on a sorted array', () => {
        const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
        expect(percentile(sorted, 50)).toBe(50);
        expect(percentile(sorted, 95)).toBe(95);
        expect(percentile(sorted, 99)).toBe(99);
    });

    it('returns 0 for an empty array', () => {
        expect(percentile([], 50)).toBe(0);
    });
});

describe('createFrameRing', () => {
    it('keeps the newest samples once capacity is exceeded', () => {
        const ring = createFrameRing(3);
        [1, 2, 3, 4, 5].forEach((v) => ring.push(v));
        expect(Array.from(ring.values())).toEqual([3, 4, 5]);
    });

    it('returns only pushed samples before it is full', () => {
        const ring = createFrameRing(4);
        ring.push(7);
        expect(Array.from(ring.values())).toEqual([7]);
    });
});
