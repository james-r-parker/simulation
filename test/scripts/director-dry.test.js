import { describe, expect, it } from 'vitest';
import { BARS, meetsBars, runDirectorDry } from '../../scripts/lib/director-dry.mjs';
import { DEFAULT_TICKS, parseDryArgs, reportLines } from '../../scripts/director-dry.mjs';
import { noisePolicy, SMALL_CONFIG } from '../worker/helpers/host-harness.js';

describe('parseDryArgs', () => {
    it('defaults to seed 1, 72000 ticks and the live policy', () => {
        const options = parseDryArgs([]);
        expect(options).toMatchObject({ seeds: [1], ticks: DEFAULT_TICKS, json: false, config: {} });
        expect(typeof options.policy).toBe('string');
    });

    it('reads a seed list, a length and the json flag', () => {
        expect(parseDryArgs(['--seed', '1,2,3', '--ticks', '600', '--json'])).toMatchObject({
            seeds: [1, 2, 3],
            ticks: 600,
            json: true,
        });
    });

    it('refuses a bad seed, length or flag', () => {
        expect(() => parseDryArgs(['--seed', 'x'])).toThrow(/--seed/);
        expect(() => parseDryArgs(['--ticks', '0'])).toThrow(/--ticks/);
        expect(() => parseDryArgs(['--nope'])).toThrow();
    });
});

describe('meetsBars', () => {
    it('reads each reading against its bar, and a missing chase precision as not applicable', () => {
        const base = { chasePrecision: 0.6, maxKindShare: 0.4, shotsPerHour: 60, minShotHoldS: 30 };
        expect(meetsBars(/** @type {any} */ (base))).toEqual({
            chasePrecision: true,
            maxKindShare: true,
            shotsPerHour: true,
            minShotHoldS: true,
        });
        const missed = { chasePrecision: 0.59, maxKindShare: 0.41, shotsPerHour: 61, minShotHoldS: 29.5 };
        expect(meetsBars(/** @type {any} */ (missed))).toEqual({
            chasePrecision: false,
            maxKindShare: false,
            shotsPerHour: false,
            minShotHoldS: false,
        });
        expect(meetsBars(/** @type {any} */ ({ ...base, shotsPerHour: 19.9 })).shotsPerHour).toBe(false);
        expect(meetsBars(/** @type {any} */ ({ ...base, shotsPerHour: 20 })).shotsPerHour).toBe(true);
        const none = meetsBars(/** @type {any} */ ({ ...base, chasePrecision: null, minShotHoldS: null }));
        expect(none.chasePrecision).toBeNull();
        expect(none.minShotHoldS).toBeNull();
        expect(BARS.shotsPerHour).toEqual([20, 60]);
        expect(BARS.minShotHoldS).toBe(30);
    });
});

describe('runDirectorDry', () => {
    const run = () => runDirectorDry({ seed: 3, ticks: 9000, overrides: SMALL_CONFIG, createPolicy: noisePolicy });

    it('takes shots from a headless world, and the shares of the kinds add up to one', () => {
        const r = run();
        expect(r.ticks).toBe(9000);
        expect(r.shots.length).toBeGreaterThan(0);
        expect(Object.values(r.shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        expect(r.maxKindShare).toBe(Math.max(...Object.values(r.shares)));
        expect(r.shotsPerHour).toBeCloseTo((r.shots.length * 3600 * 60) / 9000);
    });

    it('replays a seed to the same shot list', () => {
        expect(run().shots).toEqual(run().shots);
    });

    it('prints a line for each shot and the four readings with their bars', () => {
        const lines = reportLines(run());
        expect(lines.filter((l) => l.startsWith('director.')).map((l) => l.split(' ')[0])).toEqual([
            'director.chase_precision',
            'director.max_kind_share',
            'director.shots_per_hour',
            'director.min_shot_hold_s',
        ]);
        expect(lines.some((l) => /^seed 3 tick \d+ /.test(l))).toBe(true);
        expect(lines.join('\n')).toMatch(/bar <= 0.4/);
    });
});
