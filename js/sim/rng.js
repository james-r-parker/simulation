// Seeded sfc32 random number generator with named, deterministic sub-streams.
import { detCos, detLog } from './det-math.js';
import { fnv64Init, fnv64String } from './fnv.js';

const UINT32_RANGE = 4294967296;
const SEED_MIX_A = 0x9e3779b9;
const SEED_MIX_C = 0x85ebca6b;
const WARMUP_DRAWS = 12;
const PI = 3.141592653589793;
const ROTATE_BITS = 21;
const WORD_BITS = 32;

/** Scratch FNV state for `fork`; the only module-level state, never read across calls. */
const forkHash = new Uint32Array(2);

/**
 * @typedef {object} Rng
 * @property {number} seed the uint32 the stream was created from
 * @property {Uint32Array} s sfc32 state `[a, b, c, d]`
 */

/**
 * Advances the sfc32 state in place.
 * @param {Uint32Array} s `[a, b, c, d]`
 * @returns {number} the next uint32
 */
function step(s) {
    const a = s[0];
    const b = s[1];
    const c = s[2];
    const d = s[3];
    const t = (a + b + d) >>> 0;
    s[3] = (d + 1) >>> 0;
    s[0] = b ^ (b >>> 9);
    s[1] = (c + (c << 3)) >>> 0;
    s[2] = (((c << ROTATE_BITS) | (c >>> (WORD_BITS - ROTATE_BITS))) + t) >>> 0;
    return t;
}

/**
 * Creates a generator from a seed.
 * @param {number} seed an integer 0 .. 2^32 - 1
 * @returns {Rng}
 * @throws {Error} when the seed is not a uint32 integer
 */
export function createRng(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
        throw new Error(`createRng: seed must be an integer 0 .. 2^32 - 1, got ${seed}`);
    }
    const s = new Uint32Array(4);
    s[0] = (SEED_MIX_A ^ seed) >>> 0;
    s[1] = seed;
    s[2] = (seed + SEED_MIX_C) >>> 0;
    s[3] = 1;
    for (let i = 0; i < WARMUP_DRAWS; i++) {
        step(s);
    }
    return { seed, s };
}

/**
 * Draws a float in `[0, 1)`.
 * @param {Rng} rng
 * @returns {number}
 */
export function nextFloat(rng) {
    return step(rng.s) / UINT32_RANGE;
}

/**
 * Draws an integer in `[0, n)`.
 * @param {Rng} rng
 * @param {number} n an integer 1 .. 2^32
 * @returns {number}
 * @throws {Error} when `n` is not an integer in range
 */
export function nextInt(rng, n) {
    if (!Number.isInteger(n) || n < 1 || n > UINT32_RANGE) {
        throw new Error(`nextInt: n must be an integer 1 .. 2^32, got ${n}`);
    }
    return Math.floor(nextFloat(rng) * n);
}

/**
 * Draws a standard normal value (Box-Muller, two uint32 draws, no cached spare).
 * @param {Rng} rng
 * @returns {number}
 */
export function nextGaussian(rng) {
    const u1 = 1 - nextFloat(rng);
    const u2 = nextFloat(rng);
    return Math.sqrt(-2 * detLog(u1)) * detCos(2 * PI * u2);
}

/**
 * Creates an independent stream named `name`, derived from the parent's seed only; the parent does not advance.
 * @param {Rng} rng the parent
 * @param {string} name ASCII stream name
 * @returns {Rng}
 */
export function fork(rng, name) {
    fnv64Init(forkHash);
    fnv64String(forkHash, name);
    return createRng((forkHash[0] ^ rng.seed) >>> 0);
}
