import { describe, expect, it } from 'vitest';
import { createGpuTimer, hasGpuTimer, MAX_IN_FLIGHT } from '../../js/app/gpu-timer.js';

/**
 * @param {{extension?: boolean, disjoint?: boolean}} [options] whether the extension exists and a disjoint event occurred
 * @returns {{gl: any, finish: (ns: number) => void, log: string[]}} a fake WebGL2 context whose queries finish on demand
 */
function fakeGl({ extension = true, disjoint = false } = {}) {
    const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
    const log = /** @type {string[]} */ ([]);
    const queries = /** @type {{ready: boolean, ns: number}[]} */ ([]);
    const gl = {
        QUERY_RESULT_AVAILABLE: 10,
        QUERY_RESULT: 11,
        getExtension: (/** @type {string} */ name) =>
            extension && name === 'EXT_disjoint_timer_query_webgl2' ? ext : null,
        createQuery() {
            queries.push({ ready: false, ns: 0 });
            return queries.length - 1;
        },
        beginQuery: () => log.push('begin'),
        endQuery: () => log.push('end'),
        deleteQuery: () => log.push('delete'),
        getParameter: () => disjoint,
        getQueryParameter: (/** @type {number} */ q, /** @type {number} */ what) =>
            what === 10 ? queries[q].ready : queries[q].ns,
    };
    return {
        gl,
        log,
        finish(ns) {
            for (const q of queries) {
                q.ready = true;
                q.ns = ns;
            }
        },
    };
}

describe('createGpuTimer', () => {
    it('is null when the extension is missing', () => {
        const { gl } = fakeGl({ extension: false });
        expect(hasGpuTimer(gl)).toBe(false);
        expect(createGpuTimer(gl)).toBeNull();
    });

    it('collects a finished query in milliseconds and not before it finishes', () => {
        const { gl, finish } = fakeGl();
        const timer = /** @type {NonNullable<ReturnType<typeof createGpuTimer>>} */ (createGpuTimer(gl));
        timer.begin();
        timer.end();
        timer.poll();
        expect(timer.samples()).toHaveLength(0);
        finish(2_500_000);
        timer.poll();
        expect(Array.from(timer.samples())).toEqual([2.5]);
    });

    it('discards results after a disjoint event', () => {
        const { gl, finish, log } = fakeGl({ disjoint: true });
        const timer = /** @type {NonNullable<ReturnType<typeof createGpuTimer>>} */ (createGpuTimer(gl));
        timer.begin();
        timer.end();
        finish(1_000_000);
        timer.poll();
        expect(timer.samples()).toHaveLength(0);
        expect(log).toContain('delete');
    });

    it('skips frames while the maximum number of queries is in flight', () => {
        const { gl, log } = fakeGl();
        const timer = /** @type {NonNullable<ReturnType<typeof createGpuTimer>>} */ (createGpuTimer(gl));
        for (let i = 0; i < MAX_IN_FLIGHT + 4; i++) {
            timer.begin();
            timer.end();
        }
        expect(log.filter((entry) => entry === 'begin')).toHaveLength(MAX_IN_FLIGHT);
    });

    it('ends nothing when no query was begun', () => {
        const { gl, log } = fakeGl();
        const timer = /** @type {NonNullable<ReturnType<typeof createGpuTimer>>} */ (createGpuTimer(gl));
        timer.end();
        expect(log).toEqual([]);
    });
});
