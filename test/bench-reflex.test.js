import { describe, expect, it } from 'vitest';
import { main, parseArgs, runBench, timeReflex } from '../scripts/bench-reflex.mjs';

describe('parseArgs', () => {
    it('defaults to 512 genomes, 5 reps, 2 drill genomes at 32 trials, drills on', () => {
        expect(parseArgs([])).toEqual({
            genomes: 512,
            reps: 5,
            drillGenomes: 2,
            drillTrials: 32,
            noDrill: false,
            json: false,
        });
    });

    it('reads every flag and refuses a bad one', () => {
        expect(
            parseArgs([
                '--genomes',
                '8',
                '--reps',
                '2',
                '--drill-genomes',
                '1',
                '--drill-trials',
                '3',
                '--no-drill',
                '--json',
            ]),
        ).toEqual({ genomes: 8, reps: 2, drillGenomes: 1, drillTrials: 3, noDrill: true, json: true });
        expect(() => parseArgs(['--genomes', '0'])).toThrow(/--genomes/);
        expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    });
});

describe('timeReflex', () => {
    it('reports genomes per second and the forwards one genome costs on the four forager cases', () => {
        const result = timeReflex({ genomes: 4, reps: 1 });
        expect(result.genomesPerS).toBeGreaterThan(0);
        expect(result.ms).toBeCloseTo(1000 / result.genomesPerS, 6);
        // twelve sequences a trial (2 + 2 + 2 + 6), 16 trials, 6 ticks each
        expect(result.forwardsPerGenome).toBe(12 * 16 * 6);
    });
});

describe('runBench', () => {
    it('gives the reflex metrics', () => {
        const reflex = runBench({ genomes: 4, reps: 1, drillGenomes: 1, drillTrials: 1, noDrill: true, json: false });
        expect(Object.keys(reflex)).toEqual([
            'bench.reflex_genomes_per_s',
            'bench.reflex_ms_per_genome',
            'bench.reflex_forwards_per_genome',
        ]);
    });
});

describe('main', () => {
    it('prints one line per metric, or JSON', async () => {
        /** @type {string[]} */
        const lines = [];
        expect(await main(['--genomes', '2', '--reps', '1', '--no-drill'], (l) => lines.push(l))).toBe(0);
        expect(lines.map((l) => l.split(' ')[0])).toEqual([
            'bench.reflex_genomes_per_s',
            'bench.reflex_ms_per_genome',
            'bench.reflex_forwards_per_genome',
        ]);
        lines.length = 0;
        await main(['--genomes', '2', '--reps', '1', '--no-drill', '--json'], (l) => lines.push(l));
        expect(JSON.parse(lines[0])['bench.reflex_forwards_per_genome']).toBeGreaterThan(0);
    });

    it('exits 1 on a bad argument', async () => {
        expect(await main(['--genomes', 'x'], () => {})).toBe(1);
    });
});
