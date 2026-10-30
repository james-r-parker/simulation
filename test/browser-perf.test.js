import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/browser-perf.mjs';

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
