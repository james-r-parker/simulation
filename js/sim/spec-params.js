// Looks up a specialisation's config entry from its index without allocating.

import { SPEC_NAMES } from './specs.js';

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {number} index a specialisation index, 0 .. 4
 * @returns {Readonly<Record<string, any>>} the entry of `config.specialisations` whose `index` matches
 * @throws {Error} when no specialisation has that index
 */
export function specParams(config, index) {
    const specs = config.specialisations;
    for (let k = 0; k < SPEC_NAMES.length; k++) {
        if (specs[SPEC_NAMES[k]].index === index) {
            return specs[SPEC_NAMES[k]];
        }
    }
    throw new Error(`specParams: no specialisation has index ${index}`);
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} field a numeric field of each specialisation entry
 * @returns {Float64Array} that field of each specialisation, indexed by its `index`
 */
export function specTable(config, field) {
    const specs = Object.values(config.specialisations);
    const table = new Float64Array(Math.max(...specs.map((s) => s.index)) + 1);
    for (const s of specs) {
        table[s.index] = s[field];
    }
    return table;
}
