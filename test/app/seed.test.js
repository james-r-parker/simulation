import { describe, expect, it } from 'vitest';
import { chooseSeed, parseSeed } from '../../js/app/seed.js';

describe('chooseSeed', () => {
    it('uses the URL seed, even 0', () => {
        expect(chooseSeed(1234, { getRandomValues: () => new Uint32Array([9]) })).toBe(1234);
        expect(chooseSeed(0, { getRandomValues: () => new Uint32Array([9]) })).toBe(0);
    });

    it('draws from the crypto source when the URL has none', () => {
        const source = { getRandomValues: (/** @type {Uint32Array} */ a) => (a.fill(77), a) };
        expect(chooseSeed(null, source)).toBe(77);
    });

    it('defaults to the platform crypto and gives an unsigned 32-bit integer', () => {
        const seed = chooseSeed(null);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(0xffffffff);
    });
});

describe('parseSeed', () => {
    it('reads an unsigned 32-bit integer, trimming space', () => {
        expect(parseSeed('0')).toBe(0);
        expect(parseSeed(' 4294967295 ')).toBe(4294967295);
        expect(parseSeed('1234')).toBe(1234);
    });

    it('rejects anything else', () => {
        for (const bad of ['', 'abc', '-1', '1.5', '4294967296', '12345678901', '0x10']) {
            expect(parseSeed(bad), bad).toBeNull();
        }
    });
});
