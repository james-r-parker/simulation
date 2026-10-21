import { describe, expect, it } from 'vitest';
import { measureHeapGrowth, parseArgs } from '../scripts/alloc-check.mjs';

describe('alloc-check arguments', () => {
    it('has no policy by default', () => {
        expect(parseArgs([])).toEqual({});
    });

    it('reads --policy in both spellings', () => {
        expect(parseArgs(['--policy', 'map-elites-v1q'])).toEqual({ policy: 'map-elites-v1q' });
        expect(parseArgs(['--policy=baseline-v5'])).toEqual({ policy: 'baseline-v5' });
    });

    it('rejects a missing policy name and unknown arguments', () => {
        expect(() => parseArgs(['--policy'])).toThrow(/needs a policy name/);
        expect(() => parseArgs(['--policy='])).toThrow(/needs a policy name/);
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
    });
});

describe('measureHeapGrowth', () => {
    it('steps the reference policy and a named policy through the observer', () => {
        let collections = 0;
        const gc = () => {
            collections += 1;
        };
        const base = { gc, warmup: 5, measured: 5, runs: 2 };
        expect(Number.isFinite(measureHeapGrowth(base))).toBe(true);
        expect(Number.isFinite(measureHeapGrowth({ ...base, policy: 'map-elites-v1q' }))).toBe(true);
        expect(collections).toBe(8);
    });

    it('fails loudly on an unregistered policy', () => {
        expect(() => measureHeapGrowth({ policy: 'nope', gc: () => {}, warmup: 1, measured: 1, runs: 1 })).toThrow();
    });
});
