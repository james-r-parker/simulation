import { describe, expect, it } from 'vitest';
import { availableParallelism } from 'node:os';
import { createPool, defaultWorkers, resolvePoolSize, runPool } from '../scripts/lib/worker-pool.mjs';

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

describe('createPool', () => {
    it('keeps its workers between runs and returns each run in task order', async () => {
        const pool = createPool({ workerUrl, workers: 2 });
        try {
            const first = await pool.run(uneven.slice(0, 4));
            const second = await pool.run(uneven.slice(4));
            expect(first.map((r) => r.value)).toEqual([0, 1, 2, 3]);
            expect(second.map((r) => r.value)).toEqual([4, 5, 6, 7]);
            const threads = new Set([...first, ...second].map((r) => r.threadId));
            expect(threads.size).toBe(2);
        } finally {
            await pool.close();
        }
    });

    it('starts only as many workers as a run has tasks, up to its size', async () => {
        const pool = createPool({ workerUrl, workers: 4 });
        try {
            const one = await pool.run([{ value: 0 }]);
            expect(one).toHaveLength(1);
            const many = await pool.run(uneven);
            expect(new Set(many.map((r) => r.threadId)).size).toBeLessThanOrEqual(4);
        } finally {
            await pool.close();
        }
    });

    it('rejects a failed run, then runs the next on fresh workers', async () => {
        const pool = createPool({ workerUrl, workers: 2 });
        try {
            const error = await pool.run([{ value: 0 }, { fail: 'boom' }]).catch((e) => e);
            expect(error.message).toMatch(/task 1 failed: boom/);
            const after = await pool.run([{ value: 5 }, { value: 6 }]);
            expect(after.map((r) => r.value)).toEqual([5, 6]);
        } finally {
            await pool.close();
        }
    });

    it('is the pool runPool uses when given one, and leaves its workers alive', async () => {
        const pool = createPool({ workerUrl, workers: 2 });
        try {
            const a = await runPool(uneven.slice(0, 2), { workerUrl, pool });
            const b = await runPool(uneven.slice(0, 2), { workerUrl, pool });
            expect(new Set([...a, ...b].map((r) => r.threadId)).size).toBeLessThanOrEqual(2);
        } finally {
            await pool.close();
        }
    });

    it('refuses a second run while one is in flight, and an invalid size', async () => {
        const pool = createPool({ workerUrl, workers: 1 });
        try {
            const running = pool.run([{ value: 0, delay: 30 }]);
            await expect(pool.run([{ value: 1 }])).rejects.toThrow(/one batch/);
            await running;
        } finally {
            await pool.close();
        }
        expect(() => createPool({ workerUrl, workers: 0 })).toThrow(/positive integer/);
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

describe('resolvePoolSize even', () => {
    it('takes the fewest workers that finish in the waves the requested pool would', () => {
        const even = { even: true };
        expect(resolvePoolSize(12, 32, even)).toBe(11);
        expect(resolvePoolSize(24, 32, even)).toBe(16);
        expect(resolvePoolSize(8, 10, even)).toBe(5);
        expect(resolvePoolSize(3, 10, even)).toBe(3);
    });

    it('never adds a wave or exceeds the request, and leaves a divisor and an exact fit alone', () => {
        for (let tasks = 1; tasks <= 40; tasks++) {
            for (let requested = 1; requested <= 40; requested++) {
                const plain = resolvePoolSize(requested, tasks);
                const size = resolvePoolSize(requested, tasks, { even: true });
                expect(size).toBeLessThanOrEqual(plain);
                expect(Math.ceil(tasks / size)).toBe(Math.ceil(tasks / plain));
            }
        }
        expect(resolvePoolSize(8, 32, { even: true })).toBe(8);
        expect(resolvePoolSize(32, 32, { even: true })).toBe(32);
        expect(resolvePoolSize(undefined, 0, { even: true })).toBe(1);
        expect(() => resolvePoolSize(0, 4, { even: true })).toThrow(/positive integer/);
    });
});

describe('defaultWorkers', () => {
    it('leaves 8 cores free on a big machine', () => {
        expect(defaultWorkers(32, {})).toBe(24);
        expect(defaultWorkers(24, {})).toBe(16);
        expect(defaultWorkers(20, {})).toBe(12);
    });

    it('never takes fewer than half the cores, and at least one', () => {
        expect(defaultWorkers(16, {})).toBe(8);
        expect(defaultWorkers(12, {})).toBe(6);
        expect(defaultWorkers(8, {})).toBe(4);
        expect(defaultWorkers(4, {})).toBe(2);
        expect(defaultWorkers(2, {})).toBe(1);
        expect(defaultWorkers(1, {})).toBe(1);
    });

    it('is at most cores - 8 above 16 cores', () => {
        for (let cores = 17; cores <= 128; cores++) {
            expect(defaultWorkers(cores, {})).toBeLessThanOrEqual(cores - 8);
        }
    });

    it('uses every core on a CI runner, which nothing else shares', () => {
        expect(defaultWorkers(4, { CI: 'true' })).toBe(4);
        expect(defaultWorkers(32, { CI: 'true' })).toBe(32);
        expect(defaultWorkers(4, { CI: '' })).toBe(2);
    });

    it('reads the machine when given no count, and sizes a pool from it', () => {
        expect(defaultWorkers()).toBe(defaultWorkers(availableParallelism(), process.env));
        expect(resolvePoolSize(undefined, 1000)).toBe(defaultWorkers());
        expect(resolvePoolSize(undefined, 2)).toBe(Math.min(2, defaultWorkers()));
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
