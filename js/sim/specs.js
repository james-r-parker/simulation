// The five specialisations: their names, their indices and the role tests, in the one place. An index is fixed by the
// key order of `config.specialisations` (`SPECIALISATION_KEYS` in `config-spec-rules.js` is `SPEC_NAMES`), so a module
// that needs "the predator" or "how many" imports it from here and holds no number of its own.

/** The specialisation names, in index order. */
export const SPEC_NAMES = Object.freeze(['forager', 'predator', 'reproducer', 'scout', 'defender']);

/** The number of specialisations. */
export const SPEC_COUNT = SPEC_NAMES.length;

/** The index of each specialisation, by `UPPER_CASE` name: `SPEC.SCOUT` is 3. */
export const SPEC = Object.freeze(Object.fromEntries(SPEC_NAMES.map((name, index) => [name.toUpperCase(), index])));

/**
 * @param {number} spec a specialisation index
 * @returns {boolean} whether it is the forager, the one that lives on plants
 */
export const isForager = (spec) => spec === SPEC.FORAGER;

/**
 * @param {number} spec a specialisation index
 * @returns {boolean} whether it is the predator, the hunter
 */
export const isPredator = (spec) => spec === SPEC.PREDATOR;

/**
 * @param {number} spec a specialisation index
 * @returns {boolean} whether it is the reproducer
 */
export const isReproducer = (spec) => spec === SPEC.REPRODUCER;

/**
 * @param {number} spec a specialisation index
 * @returns {boolean} whether it is the scout, the one that sees furthest and calls
 */
export const isScout = (spec) => spec === SPEC.SCOUT;

/**
 * @param {number} spec a specialisation index
 * @returns {boolean} whether it is the defender
 */
export const isDefender = (spec) => spec === SPEC.DEFENDER;

/**
 * @param {number} spec a value
 * @returns {boolean} whether it is the index of a specialisation
 */
export function isSpecIndex(spec) {
    return Number.isInteger(spec) && spec >= 0 && spec < SPEC_COUNT;
}
