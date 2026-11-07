import { describe, expect, it } from 'vitest';
import { uploadManifest } from '../scripts/lib/release-upload.mjs';

describe('uploadManifest', () => {
    it('maps files to release keys with content types, in path order', () => {
        const rows = uploadManifest('6.1.0', ['index.html', 'assets/b.js', 'assets/a.css', 'x.wasm']);
        expect(rows.map((r) => r.key)).toEqual([
            'releases/6.1.0/assets/a.css',
            'releases/6.1.0/assets/b.js',
            'releases/6.1.0/index.html',
            'releases/6.1.0/x.wasm',
        ]);
        expect(rows.find((r) => r.path === 'x.wasm')?.contentType).toBe('application/wasm');
    });

    it.each(['../escape', 'a/../../b', 'a//b', '/abs'])('refuses the path %s', (path) => {
        expect(() => uploadManifest('6.1.0', ['index.html', path])).toThrow('refusing path');
    });

    it('refuses a bad version and a release without index.html', () => {
        expect(() => uploadManifest('6.1', ['index.html'])).toThrow('bad version');
        expect(() => uploadManifest('../../x', ['index.html'])).toThrow('bad version');
        expect(() => uploadManifest('6.1.0', ['a.js'])).toThrow('no index.html');
    });
});
