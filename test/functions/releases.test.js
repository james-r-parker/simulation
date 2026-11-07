import { describe, expect, it } from 'vitest';
import {
    addRelease,
    contentTypeOf,
    INDEX_KEY,
    isVersion,
    releaseKey,
    resolveSeason,
    safeSegments,
} from '../../functions/_lib/releases.js';

const entry = (/** @type {string} */ version, season = 6) => ({ version, season, date: '2026-11-01', rulesHash: 'h' });

describe('isVersion and releaseKey', () => {
    it.each(['6.0.0', '10.20.30'])('accepts %s', (v) => expect(isVersion(v)).toBe(true));
    it.each(['6.0', 'v6.0.0', '6.0.0-rc1', '6.0.0/', '..', '', 6, null])('rejects %s', (v) =>
        expect(isVersion(v)).toBe(false),
    );

    it('builds keys under releases/<version>/ and defaults to index.html', () => {
        expect(releaseKey('6.1.2', 'assets/a.js')).toBe('releases/6.1.2/assets/a.js');
        expect(releaseKey('6.1.2', '')).toBe('releases/6.1.2/index.html');
    });

    it.each(['../x', 'a/../b', 'a//b', 'a\\b', './a', 'a/', 'a\0b'])('refuses the path %j', (path) => {
        expect(releaseKey('6.0.0', path)).toBeNull();
    });

    it('refuses a bad version and checks segments', () => {
        expect(releaseKey('6.0', 'a')).toBeNull();
        expect(safeSegments(['a', 'b.js'])).toBe(true);
        expect(safeSegments(['a', '..'])).toBe(false);
    });
});

describe('contentTypeOf', () => {
    it.each([
        ['a.html', 'text/html'],
        ['a.js', 'text/javascript'],
        ['a.css', 'text/css'],
        ['a.json', 'application/json'],
        ['a.wasm', 'application/wasm'],
        ['a.svg', 'image/svg+xml'],
        ['a.png', 'image/png'],
        ['a.woff2', 'font/woff2'],
        ['a.txt', 'text/plain'],
        ['a.JS', 'text/javascript'],
        ['a.bin', 'application/octet-stream'],
        ['noext', 'application/octet-stream'],
    ])('%s is %s', (path, type) => expect(contentTypeOf(path)).toContain(type));
});

describe('release index', () => {
    it('appends a release and keeps the rest', () => {
        const next = addRelease({ releases: [entry('6.0.0')] }, entry('6.1.0'));
        expect(next.releases.map((r) => r.version)).toEqual(['6.0.0', '6.1.0']);
    });

    it('accepts an identical entry as a no-op and refuses a different one', () => {
        const index = { releases: [entry('6.0.0')] };
        expect(addRelease(index, { ...entry('6.0.0') })).toBe(index);
        expect(() => addRelease(index, { ...entry('6.0.0'), rulesHash: 'other' })).toThrow('release_conflict');
        expect(() => addRelease(index, entry('6.0'))).toThrow('bad_version');
    });

    it('resolves the newest release of a season', () => {
        const index = { releases: [entry('6.0.0'), entry('6.1.0'), entry('7.0.0', 7)] };
        expect(resolveSeason(index, 6)).toBe('6.1.0');
        expect(resolveSeason(index, 7)).toBe('7.0.0');
        expect(resolveSeason(index, 8)).toBeNull();
        expect(INDEX_KEY).toBe('releases/index.json');
    });
});
