import { describe, expect, it } from 'vitest';
import { createFailedBundleTaker, exportBundle } from '../../js/app/interface-exports.js';

const READY = { seed: 3, policy: 'p', configHash: 'c', rulesHash: 'r' };

describe('createFailedBundleTaker', () => {
    it('gives each failed bundle once', () => {
        const a = { seed: 1 };
        const b = { seed: 2 };
        let current = /** @type {any} */ (null);
        const take = createFailedBundleTaker(() => current);
        expect(take()).toBeNull();
        current = a;
        expect(take()).toBe(a);
        expect(take()).toBeNull();
        current = b;
        expect(take()).toBe(b);
    });
});

describe('exportBundle', () => {
    /** @param {Record<string, any> | null} ready @param {any} failed @returns {{files: any[], toasts: string[]}} */
    function run(ready, failed) {
        const files = /** @type {any[]} */ ([]);
        const toasts = /** @type {string[]} */ ([]);
        exportBundle({
            getReady: () => ready,
            getClient: () => ({ latest: { tick: 40 } }),
            overrides: {},
            download: (f) => files.push(f),
            toast: (t) => toasts.push(t),
            takeFailed: () => failed,
        });
        return { files, toasts };
    }

    it('names the file by seed and tick', () => {
        const { files } = run(READY, null);
        expect(files[0].name).toBe('blob-debug-3-40.json');
        expect(JSON.parse(files[0].text).replay).toContain('--seed 3');
    });

    it('prefers the failed run', () => {
        expect(run(READY, { seed: 8, tick: 2 }).files[0].name).toBe('blob-debug-8-2.json');
    });

    it('toasts when there is nothing to describe', () => {
        const { files, toasts } = run(null, null);
        expect(files).toEqual([]);
        expect(toasts).toHaveLength(1);
    });
});
