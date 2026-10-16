import { describe, expect, it } from 'vitest';
import { gain, parseArgs, recommendDefault, runWave, throughput } from '../scripts/bench-parallel.mjs';

describe('parseArgs', () => {
    it('defaults to the doc sizes', () => {
        expect(parseArgs([])).toEqual({ counts: [1, 8, 16, 24, 32], ticks: 2000, agents: 500, json: false });
    });

    it('reads every flag', () => {
        expect(parseArgs(['--counts', '1,2', '--ticks', '20', '--agents', '50', '--json'])).toEqual({
            counts: [1, 2],
            ticks: 20,
            agents: 50,
            json: true,
        });
    });

    it('rejects bad input', () => {
        expect(() => parseArgs(['--counts', '1,x'])).toThrow(/--counts/);
        expect(() => parseArgs(['--ticks', '0'])).toThrow(/--ticks/);
        expect(() => parseArgs(['--agents'])).toThrow(/needs a value/);
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    });
});

describe('throughput and gain', () => {
    it('is n * ticks / slowest loop', () => {
        const results = [
            { ticks: 1000, elapsedMs: 1000 },
            { ticks: 1000, elapsedMs: 2000 },
        ];
        expect(throughput(results)).toBe(1000);
    });

    it('gain is the ratio to one worker', () => {
        expect(gain(750, 100)).toBe(7.5);
        expect(gain(5, 0)).toBe(0);
    });
});

describe('recommendDefault', () => {
    it('falls back to physical cores when 32 beats 16 by under 5%', () => {
        expect(recommendDefault({ 1: 10, 16: 100, 32: 104 }, 16)).toBe(16);
    });

    it('keeps 32 when it beats 16 by 5% or more', () => {
        expect(recommendDefault({ 1: 10, 16: 100, 32: 106 }, 16)).toBe(32);
    });

    it('takes the highest count when 32 was not run', () => {
        expect(recommendDefault({ 1: 10, 8: 70 }, 16)).toBe(8);
    });
});

describe('runWave', () => {
    it('runs real worlds in workers', async () => {
        for (const count of [1, 2]) {
            const { total, cpu } = await runWave(count, { ticks: 20, agents: 50 });
            expect(total).toBeGreaterThan(0);
            expect(cpu.threads).toBeGreaterThan(0);
        }
    }, 60000);
});
