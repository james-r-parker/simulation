import { describe, expect, it, vi } from 'vitest';
import { gain, main, parseArgs, recommendDefault, runWave, throughput } from '../scripts/bench-parallel.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

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
    it(
        'runs real worlds in workers',
        async () => {
            for (const count of [1, 2]) {
                const { total, cpu } = await runWave(count, { ticks: 20, agents: 50 });
                expect(total).toBeGreaterThan(0);
                expect(cpu.threads).toBeGreaterThan(0);
            }
        },
        scaleTimeout(60000),
    );
});

describe('main', () => {
    /**
     * @param {string[]} argv arguments
     * @returns {Promise<string[]>} what was logged
     */
    async function logged(argv) {
        /** @type {string[]} */
        const lines = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((line) => void lines.push(String(line)));
        try {
            await main(argv);
        } finally {
            spy.mockRestore();
        }
        return lines;
    }

    it(
        'prints a table with a row per count and the recommendation',
        async () => {
            const lines = await logged(['--counts', '1,2', '--ticks', '10', '--agents', '30']);
            expect(lines[0]).toBe('30 agents, 10 ticks per world; gain is over 1 worker(s)');
            expect(lines[1]).toMatch(/ticks\/s/);
            expect(lines[2]).toMatch(/^ {2}1 .*1\.00x.*cpu \d+% of \d+ threads$/);
            expect(lines[3]).toMatch(/^ {2}2 /);
            expect(lines[4]).toMatch(/^recommended default: 2 workers/);
        },
        scaleTimeout(60000),
    );

    it(
        'prints metrics as JSON with --json',
        async () => {
            const lines = await logged(['--counts', '1,2', '--ticks', '10', '--agents', '30', '--json']);
            const metrics = JSON.parse(lines.join('\n'));
            expect(Object.keys(metrics)).toEqual([
                'bench.recommended_workers',
                'bench.parallel_ticks_per_s@1',
                'bench.parallel_ticks_per_s@2',
            ]);
            expect(metrics['bench.recommended_workers']).toBe(2);
        },
        scaleTimeout(60000),
    );
});
