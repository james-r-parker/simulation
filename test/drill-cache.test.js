import { describe, expect, it } from 'vitest';
import { sprintArena } from '../js/evo/drill-scenarios.js';
import { CACHE_LIMIT, createDrillCache, drillTaskKey, runCached } from '../scripts/lib/drill-cache.mjs';

/**
 * @param {Record<string, any>} [over] fields to change
 * @returns {Record<string, any>} a genome drill task
 */
function task(over = {}) {
    const subject = { name: 'elite-a', id: 7, spec: 1, weights: new Float32Array([1, 2, 3]), reference: null };
    return { drill: 'food-ahead', subject, seed: 1, trials: 4, config: {}, arms: true, ...over };
}

/** @returns {{ran: any[][], run: (missing: any[]) => Promise<any[]>}} a runner that records the tasks it was given */
function recorder() {
    /** @type {any[][]} */
    const ran = [];
    return {
        ran,
        run: async (missing) => {
            ran.push(missing);
            return missing.map((t) => ({ winShare: t.seed, records: [] }));
        },
    };
}

describe('drillTaskKey', () => {
    it('is the same for the same task and differs in each thing the task reads', () => {
        const key = drillTaskKey(task());
        expect(drillTaskKey(task())).toBe(key);
        const changed = [
            task({ drill: 'bite-ahead' }),
            task({ seed: 2 }),
            task({ trials: 5 }),
            task({ arms: false }),
            task({ config: sprintArena(0.5) }),
            task({ subject: { ...task().subject, id: 8 } }),
            task({ subject: { ...task().subject, spec: 2 } }),
            task({ subject: { ...task().subject, name: 'elite-b' } }),
            task({ subject: { ...task().subject, reference: 'memoryless' } }),
        ];
        for (const other of changed) {
            expect(drillTaskKey(other)).not.toBe(key);
        }
    });

    it('keeps the steer config apart: two sprint values are two keys', () => {
        expect(drillTaskKey(task({ config: sprintArena(0.2) }))).not.toBe(
            drillTaskKey(task({ config: sprintArena(0.4) })),
        );
    });

    it('misses a genome whose weights changed although its id did not', () => {
        const edited = { ...task().subject, weights: new Float32Array([1, 2, 3.5]) };
        expect(drillTaskKey(task({ subject: edited }))).not.toBe(drillTaskKey(task()));
    });

    it('reads a weightless reference', () => {
        const reference = { name: 'memoryless', id: 0, spec: null, weights: null, reference: 'memoryless' };
        expect(drillTaskKey(task({ subject: reference }))).toContain('none');
    });
});

describe('runCached', () => {
    it('runs every task without a cache, in order', async () => {
        const { ran, run } = recorder();
        const results = await runCached([task({ seed: 3 }), task({ seed: 4 })], { cache: undefined, run });
        expect(results.map((r) => r.winShare)).toEqual([3, 4]);
        expect(ran).toHaveLength(1);
    });

    it('runs a task once, then answers it from the cache, keeping the order of a mixed call', async () => {
        const { ran, run } = recorder();
        const cache = createDrillCache();
        await runCached([task({ seed: 1 }), task({ seed: 2 })], { cache, run });
        const results = await runCached([task({ seed: 3 }), task({ seed: 1 }), task({ seed: 2 })], { cache, run });
        expect(results.map((r) => r.winShare)).toEqual([3, 1, 2]);
        expect(ran.map((missing) => missing.map((t) => t.seed))).toEqual([[1, 2], [3]]);
        expect([cache.hits, cache.misses]).toEqual([2, 3]);
    });

    it('does not start a run when everything is cached, and reruns a changed elite', async () => {
        const { ran, run } = recorder();
        const cache = createDrillCache();
        await runCached([task()], { cache, run });
        await runCached([task()], { cache, run });
        expect(ran).toHaveLength(1);
        const edited = { ...task().subject, weights: new Float32Array([9, 9, 9]) };
        await runCached([task({ subject: edited })], { cache, run });
        expect(ran).toHaveLength(2);
    });

    it('drops the least recently used result past the limit', async () => {
        const { run } = recorder();
        const cache = createDrillCache();
        const tasks = Array.from({ length: CACHE_LIMIT + 5 }, (_, seed) => task({ seed }));
        await runCached(tasks, { cache, run });
        expect(cache.entries.size).toBe(CACHE_LIMIT);
        expect(cache.entries.has(drillTaskKey(tasks[0]))).toBe(false);
        expect(cache.entries.has(drillTaskKey(tasks[tasks.length - 1]))).toBe(true);
    });
});
