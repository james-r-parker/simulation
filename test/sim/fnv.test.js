import { describe, expect, it } from 'vitest';
import { fnv64Bytes, fnv64Hex, fnv64Init, fnv64String } from '../../js/sim/fnv.js';

const encoder = new TextEncoder();

/**
 * Hashes a string through `fnv64String` and returns the hex digest.
 * @param {string} text
 * @returns {string}
 */
function hashString(text) {
    return fnv64Hex(fnv64String(fnv64Init(new Uint32Array(2)), text));
}

/**
 * Hashes a string's bytes through `fnv64Bytes` and returns the hex digest.
 * @param {string} text
 * @returns {string}
 */
function hashBytes(text) {
    return fnv64Hex(fnv64Bytes(fnv64Init(new Uint32Array(2)), encoder.encode(text)));
}

/**
 * Reference FNV-1a 64 using BigInt, for checking the limb arithmetic.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function referenceFnv64Hex(bytes) {
    const mask = (1n << 64n) - 1n;
    const prime = 0x100000001b3n;
    let hash = 0xcbf29ce484222325n;
    for (const byte of bytes) {
        hash = ((hash ^ BigInt(byte)) * prime) & mask;
    }
    return hash.toString(16).padStart(16, '0');
}

/**
 * Deterministic byte generator (LCG) so reference inputs are reproducible.
 * @param {number} seed
 * @param {number} length
 * @returns {Uint8Array}
 */
function seededBytes(seed, length) {
    const out = new Uint8Array(length);
    let x = seed >>> 0;
    for (let i = 0; i < length; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        out[i] = x >>> 24;
    }
    return out;
}

describe('fnv64Init', () => {
    it('sets the offset basis into [lo, hi] and returns the same array', () => {
        const state = new Uint32Array([1, 2]);
        expect(fnv64Init(state)).toBe(state);
        expect(state[0]).toBe(0x84222325);
        expect(state[1]).toBe(0xcbf29ce4);
    });

    it('resets a state that was already folded', () => {
        const state = fnv64String(fnv64Init(new Uint32Array(2)), 'abc');
        expect(fnv64Hex(fnv64Init(state))).toBe('cbf29ce484222325');
    });
});

describe('fnv64Hex', () => {
    it('formats the offset basis as 16 lowercase hex characters, high word first', () => {
        expect(fnv64Hex(fnv64Init(new Uint32Array(2)))).toBe('cbf29ce484222325');
    });

    it('zero-pads words whose hex form is shorter than eight digits', () => {
        expect(fnv64Hex(new Uint32Array([0x1, 0x2]))).toBe('0000000200000001');
    });

    it('formats an all-ones state as ffffffffffffffff', () => {
        expect(fnv64Hex(new Uint32Array([0xffffffff, 0xffffffff]))).toBe('ffffffffffffffff');
    });
});

describe('FNV-1a 64 test vectors', () => {
    it('hashes the empty string to the offset basis via fnv64String', () => {
        expect(hashString('')).toBe('cbf29ce484222325');
    });

    it('hashes the empty string to the offset basis via fnv64Bytes', () => {
        expect(hashBytes('')).toBe('cbf29ce484222325');
    });

    it('hashes "a" to af63dc4c8601ec8c via fnv64String', () => {
        expect(hashString('a')).toBe('af63dc4c8601ec8c');
    });

    it('hashes "a" to af63dc4c8601ec8c via fnv64Bytes', () => {
        expect(hashBytes('a')).toBe('af63dc4c8601ec8c');
    });

    it('hashes "foobar" to 85944171f73967e8 via fnv64String', () => {
        expect(hashString('foobar')).toBe('85944171f73967e8');
    });

    it('hashes "foobar" to 85944171f73967e8 via fnv64Bytes', () => {
        expect(hashBytes('foobar')).toBe('85944171f73967e8');
    });
});

describe('fnv64Bytes', () => {
    it('returns the state it was given', () => {
        const state = fnv64Init(new Uint32Array(2));
        expect(fnv64Bytes(state, new Uint8Array([7]))).toBe(state);
    });

    it('matches a BigInt reference over long seeded inputs, exercising carries between limbs', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const bytes = seededBytes(seed, 300);
            const state = fnv64Bytes(fnv64Init(new Uint32Array(2)), bytes);
            expect(fnv64Hex(state)).toBe(referenceFnv64Hex(bytes));
        }
    });

    it('folds high-bit bytes (128 to 255) the same as the BigInt reference', () => {
        const bytes = new Uint8Array([0x80, 0xff, 0xc3, 0x00, 0xfe]);
        const state = fnv64Bytes(fnv64Init(new Uint32Array(2)), bytes);
        expect(fnv64Hex(state)).toBe(referenceFnv64Hex(bytes));
    });
});

describe('fnv64String', () => {
    it('agrees with fnv64Bytes on a longer ASCII string', () => {
        const text = 'the quick brown fox jumps over the lazy dog - 0123456789 !@#$%^&*()';
        expect(hashString(text)).toBe(hashBytes(text));
    });

    it('matches the BigInt reference on ASCII text', () => {
        const text = 'blob-evolution/config:v6';
        expect(hashString(text)).toBe(referenceFnv64Hex(encoder.encode(text)));
    });

    it('returns the state it was given', () => {
        const state = fnv64Init(new Uint32Array(2));
        expect(fnv64String(state, 'x')).toBe(state);
    });

    it('accepts code 127 and throws for code 128', () => {
        expect(() => fnv64String(fnv64Init(new Uint32Array(2)), '\x7f')).not.toThrow();
        expect(() => fnv64String(fnv64Init(new Uint32Array(2)), '\x80')).toThrow(
            'fnv64String: character 0 has code 128; only ASCII (0-127) can be hashed',
        );
    });

    it('throws on non-ASCII text and names the character index and code', () => {
        expect(() => fnv64String(fnv64Init(new Uint32Array(2)), 'abcédef')).toThrow(
            'fnv64String: character 3 has code 233; only ASCII (0-127) can be hashed',
        );
    });

    it('throws on an emoji, reporting the UTF-16 code unit that is out of range', () => {
        expect(() => fnv64String(fnv64Init(new Uint32Array(2)), '\u{1F600}')).toThrow(/character 0 has code 55357/);
    });
});

describe('chunked folding', () => {
    it('equals folding the whole input at once for bytes', () => {
        const bytes = seededBytes(99, 128);
        const whole = fnv64Hex(fnv64Bytes(fnv64Init(new Uint32Array(2)), bytes));
        const state = fnv64Init(new Uint32Array(2));
        fnv64Bytes(state, bytes.subarray(0, 50));
        fnv64Bytes(state, bytes.subarray(50));
        expect(fnv64Hex(state)).toBe(whole);
    });

    it('equals folding the whole input at once for strings', () => {
        const whole = hashString('namespace:fork-name');
        const state = fnv64Init(new Uint32Array(2));
        fnv64String(state, 'namespace:');
        fnv64String(state, 'fork-name');
        expect(fnv64Hex(state)).toBe(whole);
    });

    it('lets a string and its bytes be folded in alternating chunks', () => {
        const state = fnv64Init(new Uint32Array(2));
        fnv64String(state, 'ab');
        fnv64Bytes(state, encoder.encode('cd'));
        expect(fnv64Hex(state)).toBe(hashString('abcd'));
    });
});
