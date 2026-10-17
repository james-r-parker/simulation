// Chooses the world seed: the one in the URL, else a random one from the platform's cryptographic source.

/**
 * @param {number | null} urlSeed the validated `seed` parameter, null when absent
 * @param {{getRandomValues: (array: Uint32Array) => Uint32Array}} [source] the random source; `crypto` by default
 * @returns {number} an unsigned 32-bit seed
 */
export function chooseSeed(urlSeed, source = globalThis.crypto) {
    if (urlSeed !== null) {
        return urlSeed;
    }
    return source.getRandomValues(new Uint32Array(1))[0];
}
