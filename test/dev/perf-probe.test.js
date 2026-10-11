import { describe, it, expect } from 'vitest';
import { percentile, createFrameRing, buildPerfPayload, installPerfProbe } from '../../js/dev/perf-probe.js';

/** @param {number[]} frameTimes Frame times the fake reports in order. */
function fakeMonitor(frameTimes) {
    let i = 0;
    return {
        timings: { frame: /** @type {number[]} */ ([]) },
        endFrame() {
            this.timings.frame.push(frameTimes[i++]);
        },
        getReport() {
            return { phases: { physics: { time: '1.00' } } };
        },
    };
}

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

describe('installPerfProbe', () => {
    it('records frames and exposes the payload on the target', () => {
        const monitor = fakeMonitor([10, 20, 30, 40]);
        /** @type {{ __perf?: () => any }} */
        const target = {};
        installPerfProbe(target, monitor);
        for (let i = 0; i < 4; i++) {
            monitor.endFrame();
        }
        const payload = target.__perf?.();
        expect(payload.app).toBe('legacy');
        expect(payload.frames).toBe(4);
        expect(payload.frameMs).toEqual({ p50: 20, p95: 40, p99: 40 });
        expect(payload.phases).toEqual({ physics: { time: '1.00' } });
    });

    it('keeps recording after the monitor rolling window drops samples', () => {
        const monitor = fakeMonitor([1, 2, 3]);
        /** @type {{ __perf?: () => any }} */
        const target = {};
        installPerfProbe(target, monitor);
        monitor.endFrame();
        monitor.timings.frame.length = 0;
        monitor.endFrame();
        monitor.timings.frame.length = 0;
        monitor.endFrame();
        expect(target.__perf?.().frames).toBe(3);
    });
});

describe('buildPerfPayload', () => {
    it('reports zeros for an empty ring', () => {
        const payload = buildPerfPayload(createFrameRing(8), fakeMonitor([]));
        expect(payload.frameMs).toEqual({ p50: 0, p95: 0, p99: 0 });
        expect(payload.frames).toBe(0);
    });

    it('rounds percentiles to 2 decimal places', () => {
        const ring = createFrameRing(2);
        ring.push(16.66666);
        const payload = buildPerfPayload(ring, fakeMonitor([]));
        expect(payload.frameMs.p50).toBe(16.67);
    });
});
