import { describe, expect, it } from 'vitest';
import {
    BUDGETS,
    buildV6Entry,
    checkRefresh,
    checkRenderer,
    formatReport,
    GC_PAUSE_EVENTS,
    longTasksAfterWarmup,
    mergeBaseline,
    overBudget,
    parseViewport,
    sumGcPauseMs,
    WARMUP_MS,
} from '../scripts/lib/perf-v6.mjs';

const perf = {
    app: 'v6',
    refreshHz: 240,
    frames: 14000,
    agents: 500,
    frameMs: { p50: 4.2, p95: 5.1, p99: 7.9 },
    drawMs: { p50: 0.8, p95: 1.4, p99: 2.2 },
    gpuMs: { p50: 1.1, p95: 2.3, p99: 3.0 },
};
const run = { browser: '1', gpuAdapter: 'RTX', viewport: '3840x2160', seconds: 60, commit: 'abc', recordedAt: 't' };

describe('parseViewport', () => {
    it('reads WIDTHxHEIGHT', () => {
        expect(parseViewport('3840x2160')).toEqual({ width: 3840, height: 2160 });
    });

    it('names a malformed value', () => {
        for (const bad of ['3840', '3840*2160', 'x1080', '0x0', '1920x1080x2']) {
            expect(() => parseViewport(bad), bad).toThrow('--viewport');
        }
    });
});

describe('checkRefresh and checkRenderer', () => {
    it('refuses a display under 120 Hz unless allowed', () => {
        expect(() => checkRefresh(59.9, false)).toThrow('--allow-low-refresh');
        expect(() => checkRefresh(0, false)).toThrow('--allow-low-refresh');
        expect(() => checkRefresh(59.9, true)).not.toThrow();
        expect(() => checkRefresh(120, false)).not.toThrow();
        expect(() => checkRefresh(240, false)).not.toThrow();
    });

    it('refuses a software renderer unless allowed', () => {
        for (const name of [
            'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))',
            'llvmpipe (LLVM 15)',
            'Software Rasterizer',
        ]) {
            expect(() => checkRenderer(name, false), name).toThrow('--allow-fallback');
            expect(() => checkRenderer(name, true)).not.toThrow();
        }
        expect(() => checkRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11)', false)).not.toThrow();
    });
});

describe('sumGcPauseMs', () => {
    const meta = [
        { ph: 'M', name: 'thread_name', pid: 1, tid: 10, args: { name: 'CrRendererMain' } },
        { ph: 'M', name: 'thread_name', pid: 1, tid: 11, args: { name: 'DedicatedWorker thread' } },
    ];

    it('sums whole pauses on the renderer main thread only', () => {
        const events = [
            ...meta,
            { ph: 'X', name: 'MinorGC', pid: 1, tid: 10, dur: 2000 },
            { ph: 'X', name: 'MajorGC', pid: 1, tid: 10, dur: 10500 },
            { ph: 'X', name: 'MinorGC', pid: 1, tid: 11, dur: 99000 },
            { ph: 'X', name: 'MinorGC', pid: 2, tid: 10, dur: 99000 },
        ];
        expect(sumGcPauseMs(events)).toBe(12.5);
    });

    it('does not count the nested phases of a pause', () => {
        const events = [
            ...meta,
            { ph: 'X', name: 'MinorGC', pid: 1, tid: 10, dur: 1000 },
            { ph: 'X', name: 'V8.GCScavenger', pid: 1, tid: 10, dur: 900 },
            { ph: 'X', name: 'V8.GC_SCAVENGER_SCAVENGE', pid: 1, tid: 10, dur: 800 },
        ];
        expect(sumGcPauseMs(events)).toBe(1);
    });

    it('is 0 without a main thread, without GC events, or for events with no duration', () => {
        expect(sumGcPauseMs([{ ph: 'X', name: 'MinorGC', pid: 1, tid: 10, dur: 5000 }])).toBe(0);
        expect(sumGcPauseMs(meta)).toBe(0);
        expect(sumGcPauseMs([...meta, { ph: 'B', name: 'MinorGC', pid: 1, tid: 10 }])).toBe(0);
    });

    it('takes the names to count from the caller', () => {
        const events = [...meta, { ph: 'X', name: 'Odd', pid: 1, tid: 10, dur: 3000 }];
        expect(sumGcPauseMs(events, ['Odd'])).toBe(3);
        expect(GC_PAUSE_EVENTS).toEqual(['MinorGC', 'MajorGC']);
    });
});

describe('longTasksAfterWarmup', () => {
    it('counts only tasks that started at or after the warm-up', () => {
        expect(longTasksAfterWarmup([100, WARMUP_MS - 1, WARMUP_MS, 9000])).toBe(2);
        expect(longTasksAfterWarmup([])).toBe(0);
    });
});

describe('overBudget', () => {
    it('lists each metric over its limit and marks the done criteria', () => {
        const over = overBudget({
            'browser.frame_p50_ms': 4.0,
            'browser.frame_p95_ms': 9,
            'browser.gpu_frame_p95_ms': 5,
            'browser.main_long_tasks': 0,
            'browser.gc_pause_ms': null,
        });
        expect(over).toEqual([
            { metric: 'browser.frame_p95_ms', value: 9, max: 8.4, criterion: true },
            { metric: 'browser.gpu_frame_p95_ms', value: 5, max: 4, criterion: false },
        ]);
    });

    it('holds the budgets of the design doc', () => {
        expect(Object.fromEntries(Object.entries(BUDGETS).map(([k, v]) => [k, v.max]))).toEqual({
            'browser.frame_p50_ms': 4.5,
            'browser.frame_p95_ms': 8.4,
            'browser.frame_p99_ms': 12.5,
            'browser.draw_cpu_p95_ms': 2,
            'browser.gpu_frame_p95_ms': 4,
            'browser.main_long_tasks': 0,
            'browser.gc_pause_ms': 30,
        });
    });
});

describe('buildV6Entry', () => {
    it('builds the metrics from the payload and the script readings', () => {
        const entry = buildV6Entry({ perf, longTaskTimes: [10, 6000], gcPauseMs: 4.5, run });
        expect(entry.metrics).toEqual({
            'browser.frame_p50_ms': 4.2,
            'browser.frame_p95_ms': 5.1,
            'browser.frame_p99_ms': 7.9,
            'browser.draw_cpu_p95_ms': 1.4,
            'browser.gpu_frame_p95_ms': 2.3,
            'browser.main_long_tasks': 1,
            'browser.gc_pause_ms': 4.5,
        });
        expect(entry).toMatchObject({
            refreshHz: 240,
            frames: 14000,
            agents: 500,
            viewport: '3840x2160',
            commit: 'abc',
        });
    });

    it('records a null GPU time when the timer query is absent', () => {
        const entry = buildV6Entry({ perf: { ...perf, gpuMs: null }, longTaskTimes: [], gcPauseMs: 0, run });
        expect(entry.metrics['browser.gpu_frame_p95_ms']).toBeNull();
    });

    it('rejects a payload from another app and times that are not finite', () => {
        expect(() => buildV6Entry({ perf: { ...perf, app: 'other' }, longTaskTimes: [], gcPauseMs: 0, run })).toThrow(
            '"v6"',
        );
        expect(() => buildV6Entry({ perf: null, longTaskTimes: [], gcPauseMs: 0, run })).toThrow('"v6"');
        const bad = { ...perf, drawMs: { p95: NaN } };
        expect(() => buildV6Entry({ perf: bad, longTaskTimes: [], gcPauseMs: 0, run })).toThrow('drawMs.p95');
        expect(() => buildV6Entry({ perf, longTaskTimes: [], gcPauseMs: NaN, run })).toThrow('gcPauseMs');
    });
});

describe('mergeBaseline', () => {
    it('keeps the other viewports and replaces this one', () => {
        const merged = mergeBaseline({ '2560x1440': { a: 1 }, '3840x2160': { a: 0 } }, '3840x2160', { a: 2 });
        expect(merged).toEqual({ '2560x1440': { a: 1 }, '3840x2160': { a: 2 } });
    });

    it('starts a file when there is none', () => {
        expect(mergeBaseline(null, '1920x1080', { a: 1 })).toEqual({ '1920x1080': { a: 1 } });
    });
});

describe('formatReport', () => {
    const entry = buildV6Entry({ perf, longTaskTimes: [], gcPauseMs: 1, run });

    it('lists the run, every metric and says the budgets are met', () => {
        const lines = formatReport({ viewport: '3840x2160', entry });
        expect(lines[0]).toBe('Viewport 3840x2160: 14000 frames, 500 agents, 240 Hz, RTX');
        expect(lines).toContain('browser.frame_p95_ms: 5.1');
        expect(lines.at(-1)).toBe('Budgets: met');
    });

    it('names each metric over budget and fails the verdict only for a done criterion', () => {
        const slow = {
            ...entry,
            metrics: { ...entry.metrics, 'browser.frame_p95_ms': 12, 'browser.gpu_frame_p95_ms': 6 },
        };
        const lines = formatReport({ viewport: '3840x2160', entry: slow });
        expect(lines).toContain('OVER BUDGET: browser.frame_p95_ms 12 > 8.4');
        expect(lines).toContain('over (reported only): browser.gpu_frame_p95_ms 6 > 4');
        expect(lines.at(-1)).toBe('Budgets: not met');
        const gpuOnly = { ...entry, metrics: { ...entry.metrics, 'browser.gpu_frame_p95_ms': 6 } };
        expect(formatReport({ viewport: 'v', entry: gpuOnly }).at(-1)).toBe('Budgets: met');
    });
});
