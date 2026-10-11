import { describe, expect, it } from 'vitest';
import { buildBaseline, parseArgs } from '../scripts/browser-perf.mjs';

const perf = {
    app: 'legacy',
    frameMs: { p50: 8.3, p95: 16.9, p99: 33.4 },
    frames: 3540,
    phases: { update: { avg: 2.1 }, render: { avg: 5.2 } },
};

const meta = {
    longTasks: 7,
    browserVersion: '156.0.8078.4',
    gpuAdapter: 'nvidia / ampere / RTX',
    agentCount: 42,
    seconds: 60,
    commit: 'abc123',
    recordedAt: '2026-10-11T00:00:00.000Z',
};

describe('parseArgs', () => {
    it('defaults to 60 seconds, the baseline path and headless', () => {
        expect(parseArgs([])).toEqual({ seconds: 60, out: 'bench/legacy-baseline.json', headed: false });
    });

    it('applies overrides', () => {
        expect(parseArgs(['--seconds=5', '--out=/tmp/x.json', '--headed'])).toEqual({
            seconds: 5,
            out: '/tmp/x.json',
            headed: true,
        });
    });

    it('rejects a non-positive run length and unknown flags', () => {
        expect(() => parseArgs(['--seconds=0'])).toThrow('--seconds');
        expect(() => parseArgs(['--bogus'])).toThrow('--bogus');
    });
});

describe('buildBaseline', () => {
    it('extracts the metrics from a recorded payload', () => {
        const baseline = buildBaseline({ perf, ...meta });
        expect(baseline.metrics).toEqual({
            'browser.frame_p50_ms': 8.3,
            'browser.frame_p95_ms': 16.9,
            'browser.frame_p99_ms': 33.4,
            'browser.main_long_tasks': 7,
        });
        expect(baseline).toMatchObject({ frames: 3540, phases: perf.phases, agentCount: 42, commit: 'abc123' });
    });

    it('rejects a payload from another app', () => {
        expect(() => buildBaseline({ perf: { ...perf, app: 'v6' }, ...meta })).toThrow('"legacy"');
    });

    it('rejects frame times that are not finite numbers', () => {
        const bad = { ...perf, frameMs: { ...perf.frameMs, p95: NaN } };
        expect(() => buildBaseline({ perf: bad, ...meta })).toThrow('frameMs.p95');
        expect(() => buildBaseline({ perf: { ...perf, frameMs: {} }, ...meta })).toThrow('frameMs.p50');
    });
});
