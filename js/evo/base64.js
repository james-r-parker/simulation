// Base64 text for float32 weight rows: the champion file and genome formats.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * @param {Float32Array} weights the weights
 * @returns {string} base64 of the little-endian float32 bytes
 */
export function encodeWeights(weights) {
    const bytes = new Uint8Array(weights.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < weights.length; i++) {
        view.setFloat32(i * 4, weights[i], true);
    }
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
        out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '=';
        out += i + 2 < bytes.length ? ALPHABET[n & 63] : '=';
    }
    return out;
}

/**
 * @param {string} text base64 of little-endian float32 bytes
 * @param {number} count how many floats it must hold
 * @returns {Float32Array} the weights
 * @throws {Error} when the text is not base64 or holds a different number of floats
 */
export function decodeWeights(text, count) {
    if (
        typeof text !== 'string' ||
        text.length !== Math.ceil((count * 4) / 3) * 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(text)
    ) {
        throw new Error(`weights: expected base64 of ${count} float32 values`);
    }
    const bytes = new Uint8Array(count * 4);
    for (let i = 0, j = 0; i < text.length; i += 4) {
        const n =
            (ALPHABET.indexOf(text[i]) << 18) |
            (ALPHABET.indexOf(text[i + 1]) << 12) |
            (Math.max(0, ALPHABET.indexOf(text[i + 2])) << 6) |
            Math.max(0, ALPHABET.indexOf(text[i + 3]));
        for (let shift = 16; shift >= 0 && j < bytes.length; shift -= 8) {
            bytes[j++] = (n >> shift) & 255;
        }
    }
    const view = new DataView(bytes.buffer);
    const weights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        weights[i] = view.getFloat32(i * 4, true);
    }
    return weights;
}
