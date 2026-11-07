import { describe, expect, it } from 'vitest';
import { runBench, timeDrills } from '../scripts/bench-reflex.mjs';

describe('timeDrills', () => {
    it('runs the five forager drills for each genome', () => {
        const result = timeDrills({ drillGenomes: 1, drillTrials: 1 });
        expect(result.drills).toBe(5);
        expect(result.genomesPerS).toBeGreaterThan(0);
    });
});

describe('runBench with the drills', () => {
    it('gives the ratio of the two throughputs', () => {
        const both = runBench({ genomes: 4, reps: 1, drillGenomes: 1, drillTrials: 1, noDrill: false, json: false });
        expect(both['bench.reflex_vs_drill']).toBeCloseTo(
            both['bench.reflex_genomes_per_s'] / both['bench.drill_genomes_per_s'],
            6,
        );
    });
});
