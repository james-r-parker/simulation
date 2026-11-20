import { describe, expect, it } from 'vitest';
import { logTiming, timed, usage } from '../scripts/lib/train-timing.mjs';

describe('usage', () => {
    it('sums ticks and the pool`s episode seconds and shares them over the pool`s wall time', () => {
        const results = [
            { ticks: 100, wallMs: 1500 },
            { ticks: 50, wallMs: 500 },
        ];
        expect(usage(results, { wallSeconds: 1, workers: 4 })).toEqual({ ticks: 150, cpuShare: 0.5, busy: 2 });
    });

    it('has no share for a zero wall time', () => {
        expect(usage([{ ticks: 1, wallMs: 10 }], { wallSeconds: 0, workers: 2 }).cpuShare).toBe(0);
    });
});

describe('timed', () => {
    it('returns the step`s value and a non-negative duration', async () => {
        const out = await timed(async () => 7);
        expect(out.value).toBe(7);
        expect(out.seconds).toBeGreaterThanOrEqual(0);
    });

    it('lets a failing step throw', async () => {
        await expect(
            timed(async () => {
                throw new Error('no');
            }),
        ).rejects.toThrow('no');
    });
});

describe('logTiming', () => {
    it('logs one info TrainTiming record with the fields', () => {
        /** @type {unknown[][]} */
        const calls = [];
        const fields = {
            generation: 3,
            stage: 'a',
            workers: 2,
            busySeconds: 1,
            episodeSeconds: 2,
            checkpointSeconds: 0,
            saveSeconds: 0.1,
        };
        logTiming({ level: 'info', log: (...args) => calls.push(args) }, fields);
        expect(calls).toEqual([['info', 'TrainTiming', fields]]);
    });
});
