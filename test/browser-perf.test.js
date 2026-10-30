import { describe, expect, it } from 'vitest';
import { buildBaseline, describeAdapter, parseArgs } from '../scripts/browser-perf.mjs';

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
    it('defaults to the v6 app, 60 seconds, 500 agents, 4K and headless', () => {
        expect(parseArgs([])).toEqual({
            seconds: 60,
            out: 'bench/browser-baseline.json',
            headed: false,
            allowFallback: false,
            allowLowRefresh: false,
            cdp: '',
            app: 'v6',
            agents: 500,
            viewport: { width: 3840, height: 2160 },
            look: '',
        });
    });

    it('writes the legacy app to its own baseline file', () => {
        expect(parseArgs(['--app=legacy'])).toMatchObject({ app: 'legacy', out: 'bench/legacy-baseline.json' });
    });

    it('applies overrides', () => {
        expect(
            parseArgs([
                '--seconds=5',
                '--out=/tmp/x.json',
                '--headed',
                '--allow-fallback',
                '--allow-low-refresh',
                '--cdp=http://127.0.0.1:9222',
                '--agents=300',
                '--viewport=2560x1440',
                '--look=rocks,aurora',
            ]),
        ).toEqual({
            seconds: 5,
            out: '/tmp/x.json',
            headed: true,
            allowFallback: true,
            allowLowRefresh: true,
            cdp: 'http://127.0.0.1:9222',
            app: 'v6',
            agents: 300,
            viewport: { width: 2560, height: 1440 },
            look: 'rocks,aurora',
        });
    });

    it('rejects an unknown flag with or without a value', () => {
        expect(() => parseArgs(['--nope=1'])).toThrow(/Unknown argument "--nope=1"/);
        expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument "--nope"/);
        expect(() => parseArgs(['--look', '--headed'])).toThrow(/requires a value/);
    });

    it('supports space-separated flag values for look', () => {
        expect(parseArgs(['--look', 'all']).look).toBe('all');
        expect(() => parseArgs(['--look'])).toThrow(/requires a value/);
    });

    it('rejects a non-positive run length, a bad app, agents or viewport, and unknown flags', () => {
        expect(() => parseArgs(['--seconds=0'])).toThrow('--seconds');
        expect(() => parseArgs(['--app=v7'])).toThrow('--app');
        expect(() => parseArgs(['--agents=0'])).toThrow('--agents');
        expect(() => parseArgs(['--agents=1.5'])).toThrow('--agents');
        expect(() => parseArgs(['--viewport=wide'])).toThrow('--viewport');
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

describe('describeAdapter', () => {
    const swiftshader = { vendor: 'google', architecture: 'swiftshader', description: '', fallback: true };

    it('names a hardware adapter', () => {
        const gpu = { vendor: 'nvidia', architecture: 'lovelace', description: 'RTX 4090', fallback: false };
        expect(describeAdapter(gpu, false)).toBe('nvidia / lovelace / RTX 4090');
    });

    it('refuses a software fallback adapter unless allowed', () => {
        expect(() => describeAdapter(swiftshader, false)).toThrow('--allow-fallback');
        expect(describeAdapter(swiftshader, true)).toBe('google / swiftshader (fallback)');
    });

    it('fails when there is no adapter', () => {
        expect(() => describeAdapter(null, true)).toThrow('No WebGPU adapter');
    });
});
