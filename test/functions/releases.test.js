import { describe, expect, it } from 'vitest';
import { safeSegments, upstreamUrl } from '../../functions/_lib/releases.js';

describe('safeSegments', () => {
    it('accepts plain names and refuses dots, empties, backslashes and NUL', () => {
        expect(safeSegments(['a', 'b.js'])).toBe(true);
        for (const bad of [['a', '..'], ['.'], ['a', '', 'b'], ['a\\b'], ['a\0b']]) {
            expect(safeSegments(bad)).toBe(false);
        }
    });
});

describe('upstreamUrl', () => {
    it('builds the file URL on the version alias and defaults to index.html', () => {
        expect(upstreamUrl('6.1.2', ['assets', 'a.js'], 'matrix-6be')).toBe(
            'https://v6-1-2.matrix-6be.pages.dev/assets/a.js',
        );
        expect(upstreamUrl('6.1.2', [], 'matrix-6be')).toBe('https://v6-1-2.matrix-6be.pages.dev/index.html');
    });

    it('returns null for a bad version, path or label, so the host never comes from the request', () => {
        expect(upstreamUrl('6.1', ['a'], 'matrix-6be')).toBeNull();
        expect(upstreamUrl('6.1.0', ['..', 'x'], 'matrix-6be')).toBeNull();
        expect(upstreamUrl('6.1.0', ['a'], undefined)).toBeNull();
        for (const label of ['a.evil.com', 'A', 'a/', 'a@b', '']) {
            expect(upstreamUrl('6.1.0', ['a'], label)).toBeNull();
        }
    });
});
