// A small seeded generator (mulberry32) for the director and the ambient motes. It is independent of js/sim/rng.js so
// the app never reaches into the sim.

/**
 * @typedef {object} Prng
 * @property {() => number} next the next float in [0, 1)
 * @property {(n: number) => number} int the next integer in [0, n)
 */

/**
 * @param {number} seed any integer; only its low 32 bits count
 * @returns {Prng} a generator that gives the same sequence for the same seed
 */
export function createPrng(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { next, int: (n) => Math.floor(next() * n) };
}
