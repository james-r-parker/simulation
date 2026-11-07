// The canonical bytes of a champion file, and its content id. The id is the SHA-256 of the canonical bytes, so the same
// champion uploaded twice is one row.

const { crypto, TextEncoder } = globalThis;

/**
 * @param {Record<string, any>} file a champion file that `validateChampion` accepted
 * @returns {string} the file re-serialised with keys in a fixed order and no whitespace; `cell` is left out when absent,
 *   and every other extra field (`genomeId`, `fitness`) is dropped
 */
export function canonicalChampion(file) {
    const layout = file.layout;
    const ordered = {
        version: file.version,
        name: file.name,
        rulesHash: file.rulesHash,
        layout: {
            ...(layout.name === undefined ? {} : { name: layout.name }),
            inputCount: layout.inputCount,
            brainHidden: layout.brainHidden,
            outputCount: layout.outputCount,
        },
        specialisation: file.specialisation,
        ...(file.cell === undefined || file.cell === null ? {} : { cell: file.cell }),
        weights: file.weights,
    };
    return JSON.stringify(ordered);
}

/**
 * @param {string} text canonical bytes as text
 * @returns {Promise<string>} the SHA-256 of the UTF-8 bytes as 64 lowercase hex characters
 */
export async function championId(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
