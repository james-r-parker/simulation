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

/**
 * @param {string} text what was typed in the seed field
 * @returns {number | null} the unsigned 32-bit integer it spells (digits only, surrounding space allowed), else null
 */
export function parseSeed(text) {
    const t = text.trim();
    if (!/^\d{1,10}$/.test(t)) {
        return null;
    }
    const n = Number(t);
    return n <= 0xffffffff ? n : null;
}
