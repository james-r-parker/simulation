// Looks up a specialisation's config entry from its index without allocating.

/** The specialisation names, in index order; config validation fixes the indices. */
const SPEC_NAMES = Object.freeze(['forager', 'predator', 'reproducer', 'scout', 'defender']);

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
