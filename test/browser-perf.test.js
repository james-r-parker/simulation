import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/browser-perf.mjs';
import { setMeasurementViewport } from '../scripts/lib/perf-v6-run.mjs';

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
        });
    });

    it('rejects an unknown flag with or without a value', () => {
        expect(() => parseArgs(['--nope=1'])).toThrow(/Unknown argument "--nope=1"/);
        expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument "--nope"/);
        expect(() => parseArgs(['--agents', '--headed'])).toThrow(/requires a value/);
    });

    it('supports space-separated flag values', () => {
        expect(parseArgs(['--agents', '1000']).agents).toBe(1000);
        expect(() => parseArgs(['--agents'])).toThrow(/requires a value/);
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

describe('setMeasurementViewport', () => {
    it('sets and verifies the CSS viewport and 1x device scale through CDP', async () => {
        const calls = /** @type {Array<[string, unknown]>} */ ([]);
        const page = /** @type {any} */ ({
            async setViewportSize(/** @type {{width: number, height: number}} */ viewport) {
                calls.push(['setViewportSize', viewport]);
            },
            context() {
                return {
                    async newCDPSession() {
                        return {
                            async send(/** @type {string} */ method, /** @type {unknown} */ params) {
                                calls.push([method, params]);
                            },
                        };
                    },
                };
            },
            async evaluate() {
                return { width: 3840, height: 2160, scale: 1 };
            },
        });

        await setMeasurementViewport(page, { width: 3840, height: 2160 });

        expect(calls).toEqual([
            ['setViewportSize', { width: 3840, height: 2160 }],
            ['Emulation.setDeviceMetricsOverride', { width: 3840, height: 2160, deviceScaleFactor: 1, mobile: false }],
        ]);
    });

    it('refuses a viewport that CDP did not apply', async () => {
        const page = /** @type {any} */ ({
            async setViewportSize() {},
            context() {
                return {
                    async newCDPSession() {
                        return { async send() {} };
                    },
                };
            },
            async evaluate() {
                return { width: 1508, height: 1567, scale: 1.25 };
            },
        });

        await expect(setMeasurementViewport(page, { width: 3840, height: 2160 })).rejects.toThrow(
            'requested 3840x2160 at scale 1, got 1508x1567 at scale 1.25',
        );
    });
});
