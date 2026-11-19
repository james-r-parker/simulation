import { describe, expect, it } from 'vitest';
import { ladderYield, runYield } from '../../js/evo/ladder-yield.js';

const manifest = (/** @type {object[]} */ stages, offset = 8) => ({ options: { seedOffset: offset }, stages });

describe('runYield', () => {
    it('scores a run that stalled in its third stage as the stage index plus its best progress there', () => {
        const stages = [{ name: 'a', passedAt: 10 }, { name: 'b', passedAt: 30 }, { name: 'c' }];
        const rows = [
            { stage: 'c', bestProgress: 0.2, cpuSeconds: 100 },
            { stage: 'c', bestProgress: 0.35, cpuSeconds: 160 },
            { stage: 'c', bestProgress: 0.3, cpuSeconds: 200 },
        ];
        const yielded = runYield(manifest(stages), rows);
        expect(yielded).toMatchObject({ offset: 8, reached: 2, bestProgress: 0.35, score: 2.35, cpuSeconds: 200 });
        expect(yielded.passed).toEqual([
            { stage: 'a', generation: 10 },
            { stage: 'b', generation: 30 },
        ]);
    });

    it('scores a run whose last stage passed as finished, with progress 1', () => {
        const yielded = runYield(manifest([{ name: 'a', passedAt: 12 }]), []);
        expect(yielded).toMatchObject({ reached: 0, bestProgress: 1, score: 1, cpuSeconds: 0 });
    });

    it('splits the episode seconds by the stage of each row, from the row-to-row difference', () => {
        const stages = [{ name: 'a', passedAt: 10 }, { name: 'b' }];
        const rows = [
            { stage: 'a', cpuSeconds: 50, bestProgress: 1 },
            { stage: 'b', cpuSeconds: 80, bestProgress: 0.1 },
            { stage: 'b', cpuSeconds: 100, bestProgress: 0.1 },
        ];
        expect(runYield(manifest(stages), rows).stageCpuSeconds).toEqual({ a: 50, b: 50 });
    });

    it('reads cpuShare x workers x the wall seconds between rows for a curve without cpuSeconds', () => {
        const rows = [
            { stage: 'a', cpuShare: 0.5, workers: 4, wallSeconds: 10, bestProgress: 0.1 },
            { stage: 'a', cpuShare: 0.25, workers: 4, wallSeconds: 30, bestProgress: 0.1 },
        ];
        expect(runYield(manifest([{ name: 'a' }]), rows).cpuSeconds).toBe(20 + 20);
    });

    it('reads a row with none of the timing columns as no CPU time', () => {
        expect(runYield(manifest([{ name: 'a' }]), [{ stage: 'a', bestProgress: 0.1 }]).cpuSeconds).toBe(0);
    });

    it('takes the best progress over the stage`s rows, so a review that reset it does not lower the score', () => {
        const rows = [
            { stage: 'a', bestProgress: 0.6, cpuSeconds: 1 },
            { stage: 'a', bestProgress: 0.1, cpuSeconds: 2 },
        ];
        expect(runYield(manifest([{ name: 'a' }]), rows).bestProgress).toBe(0.6);
        expect(runYield(manifest([{ name: 'a' }]), [{ stage: 'a', cpuSeconds: 1 }]).bestProgress).toBe(0);
    });

    it('defaults the offset to 0 and refuses a manifest with no stage', () => {
        expect(runYield({ stages: [{ name: 'a' }] }, []).offset).toBe(0);
        expect(() => runYield({ stages: [] }, [])).toThrow(/no stage/);
        expect(() => runYield({}, [])).toThrow(/no stage/);
    });
});

describe('ladderYield', () => {
    const run = (/** @type {object[]} */ stages, /** @type {Record<string, any>[]} */ rows) =>
        runYield(manifest(stages), rows);

    it('reads the pass share, median generations to pass and CPU hours per pass of each stage', () => {
        const rowsA = [
            { stage: 'a', cpuSeconds: 3600, bestProgress: 1 },
            { stage: 'b', cpuSeconds: 7200, bestProgress: 0.5 },
        ];
        const runs = [
            run([{ name: 'a', passedAt: 10 }, { name: 'b' }], rowsA),
            run([{ name: 'a', passedAt: 30 }], [{ stage: 'a', cpuSeconds: 3600, bestProgress: 1 }]),
            run([{ name: 'a' }], [{ stage: 'a', cpuSeconds: 1800, bestProgress: 0.2 }]),
        ];
        const yielded = ladderYield(runs, ['a', 'b']);
        expect(yielded.runs).toBe(3);
        expect(yielded.stages[0]).toEqual({
            stage: 'a',
            passShare: 2 / 3,
            medianGenerations: 20,
            cpuHoursPerPass: (3600 + 3600 + 1800) / 3600 / 2,
        });
        expect(yielded.stages[1]).toEqual({ stage: 'b', passShare: 0, medianGenerations: null, cpuHoursPerPass: null });
        expect(yielded.meanScore).toBeCloseTo((1.5 + 1 + 0.2) / 3, 12);
        expect(yielded.cpuHours).toBeCloseTo((7200 + 3600 + 1800) / 3600, 12);
    });

    it('measures a stage`s generations from the previous pass, and an empty arm reads 0', () => {
        const runs = [
            run(
                [
                    { name: 'a', passedAt: 10 },
                    { name: 'b', passedAt: 25 },
                ],
                [],
            ),
        ];
        expect(ladderYield(runs, ['a', 'b']).stages[1].medianGenerations).toBe(15);
        expect(ladderYield([], ['a'])).toMatchObject({ runs: 0, meanScore: 0, cpuHours: 0 });
        expect(ladderYield([], ['a']).stages[0].passShare).toBe(0);
    });
});
