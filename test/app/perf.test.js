import { describe, expect, it } from 'vitest';
import { createFrameStats, recordFrame } from '../../js/app/frame-stats.js';
import { buildPerf, installPerf, spreadOf } from '../../js/app/perf.js';

const GPU = { geometries: 9, textures: 4, programs: 7 };

describe('spreadOf', () => {
    it('is null with no samples and the percentiles otherwise', () => {
        expect(spreadOf(new Float64Array(0))).toBeNull();
        const samples = Float64Array.from({ length: 100 }, (_, i) => i + 1);
        expect(spreadOf(samples)).toEqual({ p50: 50, p95: 95, p99: 99 });
    });

    it('does not reorder the caller samples', () => {
        const samples = Float64Array.from([3, 1, 2]);
        spreadOf(samples);
        expect(Array.from(samples)).toEqual([3, 1, 2]);
    });
});

describe('buildPerf', () => {
    it('reports the v6 shape from the rings, the worker stats and the renderer counts', () => {
        const stats = createFrameStats(64);
        for (let i = 0; i < 20; i++) {
            recordFrame(stats, 4.2, 1.1);
        }
        const perf = buildPerf({
            stats,
            worker: { tick: 5, ticksPerSecond: 58, droppedTicks: 2 },
            gpu: GPU,
            gpuSamples: Float64Array.from([2, 3]),
            heapBytes: 50 * 1048576,
        });
        expect(perf).toMatchObject({
            app: 'v6',
            refreshHz: 238.1,
            frameMs: { p50: 4.2, p95: 4.2, p99: 4.2 },
            drawMs: { p50: 1.1, p95: 1.1, p99: 1.1 },
            gpuMs: { p50: 2, p95: 3, p99: 3 },
            frames: 20,
            ticksPerSecond: 58,
            droppedTicks: 2,
            heapMb: 50,
            gpu: GPU,
        });
    });

    it('reports null GPU time and heap, and zero worker rates, when they are unavailable', () => {
        const perf = buildPerf({
            stats: createFrameStats(8),
            worker: null,
            gpu: GPU,
            gpuSamples: null,
            heapBytes: null,
        });
        expect(perf).toMatchObject({ gpuMs: null, heapMb: null, ticksPerSecond: 0, droppedTicks: 0, frames: 0 });
    });
});

describe('installPerf', () => {
    it('puts a __perf function on the target that reads live values each call', () => {
        const target = /** @type {{__perf?: () => any}} */ ({});
        let drops = 0;
        installPerf(target, () => ({
            stats: createFrameStats(8),
            worker: { tick: 1, ticksPerSecond: 60, droppedTicks: drops },
            gpu: GPU,
            gpuSamples: null,
            heapBytes: null,
        }));
        expect(target.__perf?.().droppedTicks).toBe(0);
        drops = 3;
        expect(target.__perf?.().droppedTicks).toBe(3);
    });
});
