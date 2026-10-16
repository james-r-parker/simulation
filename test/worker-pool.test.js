import { describe, expect, it } from 'vitest';
import { resolvePoolSize, runPool } from '../scripts/lib/worker-pool.mjs';

const workerUrl = new URL('./fixtures/pool-worker.mjs', import.meta.url);
const uneven = [60, 5, 30, 1, 45, 2, 10, 20].map((delay, value) => ({ delay, value }));

describe('runPool', () => {
    it.each([1, 2, 4])('returns results in task order with %i workers', async (workers) => {
        const results = await runPool(uneven, { workerUrl, workers });
        expect(results.map((r) => r.value)).toEqual(uneven.map((t) => t.value));
    });

    it('reports each result to onResult with its task index', async () => {
        /** @type {[number, number][]} */
        const seen = [];
        await runPool(uneven, { workerUrl, workers: 4, onResult: (i, r) => seen.push([i, r.value]) });
        expect(seen.map(([i]) => i).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(seen.every(([i, v]) => i === v)).toBe(true);
    });

    it('rejects naming the failing task index and the worker message', async () => {
        const tasks = [{ value: 0 }, { value: 1 }, { fail: 'boom' }, { value: 3 }];
        const error = await runPool(tasks, { workerUrl, workers: 2 }).catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/task 2 failed: boom/);
        expect(error.cause.message).toBe('boom');
    });

    it('rejects when a worker exits non-zero mid-task', async () => {
        const error = await runPool([{ value: 0 }, { crash: true }], { workerUrl, workers: 2 }).catch((e) => e);
        expect(error.message).toMatch(/task 1 failed: worker exited with code 3/);
    });

    it('rejects when a worker exits cleanly mid-task instead of hanging', async () => {
        const error = await runPool([{ quit: true }], { workerUrl, workers: 1 }).catch((e) => e);
        expect(error.message).toMatch(/task 0 failed: worker exited with code 0/);
    });

    it('resolves an empty task list without starting workers', async () => {
        expect(await runPool([], { workerUrl })).toEqual([]);
    });

    it('caps the pool at the task count', async () => {
        const results = await runPool(
            [
                { value: 0, delay: 20 },
                { value: 1, delay: 20 },
            ],
            { workerUrl, workers: 8 },
        );
        expect(new Set(results.map((r) => r.thread)).size).toBeLessThanOrEqual(2);
    });

    it.each(/** @type {any[]} */ ([0, -1, 1.5, Number.NaN, '2']))('throws for invalid workers %s', (workers) => {
        expect(() => runPool([{ value: 0 }], { workerUrl, workers })).toThrow(/positive integer/);
    });
});

describe('resolvePoolSize', () => {
    it('caps at the task count and keeps at least one', () => {
        expect(resolvePoolSize(8, 3)).toBe(3);
        expect(resolvePoolSize(2, 10)).toBe(2);
        expect(resolvePoolSize(undefined, 0)).toBe(1);
        expect(resolvePoolSize(undefined, 1)).toBe(1);
    });
});

describe('runPool worker errors', () => {
    it('rejects when the worker throws outside serveTasks', async () => {
        const url = new URL('./fixtures/throwing-worker.mjs', import.meta.url);
        const error = await runPool([{ value: 0 }], { workerUrl: url, workers: 1 }).catch((e) => e);
        expect(error.message).toMatch(/task 0 failed: top-level boom/);
    });
});

describe('serveTasks', () => {
    it('throws outside a worker thread', async () => {
        const { serveTasks } = await import('../scripts/lib/worker-pool.mjs');
        expect(() => serveTasks(() => 1)).toThrow(/worker thread/);
    });
});
