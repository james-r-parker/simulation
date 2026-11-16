import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEAVY_TESTS, STATISTICAL_TESTS, excludedFor, includedFor } from '../scripts/lib/test-scope.mjs';

describe('test scopes', () => {
    it('lists only files that exist, so a rename cannot silently drop a test from a pass', () => {
        for (const file of [...STATISTICAL_TESTS, ...HEAVY_TESTS]) {
            expect(existsSync(file), file).toBe(true);
        }
    });

    it('keeps the statistical and heavy lists apart, so no file runs in two CI passes', () => {
        expect(STATISTICAL_TESTS.filter((file) => HEAVY_TESTS.includes(file))).toEqual([]);
    });

    it('runs everything when unset', () => {
        expect(includedFor(undefined)).toBeNull();
        expect(excludedFor(undefined)).toEqual([]);
    });

    it('leaves out the slow files under fast', () => {
        expect(includedFor('fast')).toBeNull();
        expect(excludedFor('fast')).toEqual(['**/*.slow.test.js']);
    });

    it('splits check.sh into a coverage pass without the statistical files and a statistical pass of only them', () => {
        expect(excludedFor('coverage')).toEqual(STATISTICAL_TESTS);
        expect(includedFor('coverage')).toBeNull();
        expect(includedFor('statistical')).toEqual(STATISTICAL_TESTS);
        expect(excludedFor('statistical')).toEqual([]);
    });

    it('gives CI shards everything except the statistical and heavy files, and the heavy pass only those', () => {
        expect(excludedFor('shard')).toEqual([...STATISTICAL_TESTS, ...HEAVY_TESTS]);
        expect(includedFor('shard')).toBeNull();
        expect(includedFor('heavy')).toEqual(HEAVY_TESTS);
        expect(excludedFor('heavy')).toEqual([]);
    });
});
