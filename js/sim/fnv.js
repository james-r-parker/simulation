// FNV-1a 64-bit hashing over a Uint32Array(2) [lo, hi], multiplied in 16-bit limbs with no allocation.
const OFFSET_HI = 0xcbf29ce4;
const OFFSET_LO = 0x84222325;
// The prime 0x0000_0100_0000_01b3 splits into 16-bit limbs: low limb 0x01b3, third limb 0x0100, others zero.
const PRIME_LIMB_0 = 0x01b3;
const PRIME_LIMB_2 = 0x0100;
const LIMB_MASK = 0xffff;
const LIMB_BITS = 16;

/**
 * Multiplies the 64-bit value in `state` by the FNV prime modulo 2^64, in place.
 * @param {Uint32Array} state `[lo, hi]`
 * @returns {void}
 */
function multiplyByPrime(state) {
    const lo = state[0];
    const hi = state[1];
    const a0 = lo & LIMB_MASK;
    const a1 = lo >>> LIMB_BITS;
    const a2 = hi & LIMB_MASK;
    const a3 = hi >>> LIMB_BITS;
    const c0 = a0 * PRIME_LIMB_0;
    const r0 = c0 & LIMB_MASK;
    const c1 = a1 * PRIME_LIMB_0 + (c0 >>> LIMB_BITS);
    const r1 = c1 & LIMB_MASK;
    const c2 = a2 * PRIME_LIMB_0 + a0 * PRIME_LIMB_2 + (c1 >>> LIMB_BITS);
    const r2 = c2 & LIMB_MASK;
    const c3 = a3 * PRIME_LIMB_0 + a1 * PRIME_LIMB_2 + (c2 >>> LIMB_BITS);
    state[0] = ((r1 << LIMB_BITS) | r0) >>> 0;
    state[1] = (((c3 & LIMB_MASK) << LIMB_BITS) | r2) >>> 0;
}

/**
 * Folds one byte into the hash: xor into the low word, then multiply by the prime.
 * @param {Uint32Array} state `[lo, hi]`
 * @param {number} byte an integer 0 .. 255
 * @returns {void}
 */
function foldByte(state, byte) {
    state[0] = state[0] ^ byte;
    multiplyByPrime(state);
}

/**
 * Resets `state` to the FNV-1a 64-bit offset basis.
 * @param {Uint32Array} state a `Uint32Array(2)` laid out `[lo, hi]`
 * @returns {Uint32Array} `state`
 */
export function fnv64Init(state) {
    state[0] = OFFSET_LO;
    state[1] = OFFSET_HI;
    return state;
}

/**
 * Folds every byte of `bytes` into the hash in order.
 * @param {Uint32Array} state `[lo, hi]`, updated in place
 * @param {Uint8Array} bytes the bytes to fold
 * @returns {Uint32Array} `state`
 */
export function fnv64Bytes(state, bytes) {
    for (let i = 0; i < bytes.length; i++) {
        foldByte(state, bytes[i]);
    }
    return state;
}

/**
 * Folds a string into the hash as its char codes, one byte per character, without building a byte array.
 * @param {Uint32Array} state `[lo, hi]`, updated in place
 * @param {string} text ASCII text only
 * @returns {Uint32Array} `state`
 * @throws {Error} when a character code is above 127
 */
export function fnv64String(state, text) {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code > 127) {
            throw new Error(`fnv64String: character ${i} has code ${code}; only ASCII (0-127) can be hashed`);
        }
        foldByte(state, code);
    }
    return state;
}

/**
 * Formats the hash as 16 lowercase hex characters, high word first.
 * @param {Uint32Array} state `[lo, hi]`
 * @returns {string} e.g. `cbf29ce484222325` for the offset basis
 */
export function fnv64Hex(state) {
    return hex32(state[1]) + hex32(state[0]);
}

/**
 * Formats one 32-bit word as 8 zero-padded lowercase hex characters.
 * @param {number} word an unsigned 32-bit integer
 * @returns {string}
 */
function hex32(word) {
    return (word >>> 0).toString(16).padStart(8, '0');
}
