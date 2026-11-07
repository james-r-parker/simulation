// The reflex cases (brain-reflex-tests.md, Reflex cases): short input sequences with expected outputs, one list in the
// shape of `DRILLS`. A reflex score is a detector and a filter; it never enters fitness, merit, mate rank or archive rank.

import { FORAGER_CASES } from './reflex-cases-forager.js';
import { PREDATOR_CASES } from './reflex-cases-predator.js';

/** The six cases, foragers first. */
export const REFLEX_CASES = Object.freeze([...FORAGER_CASES, ...PREDATOR_CASES]);

/**
 * @param {number} spec a specialisation index
 * @returns {import('./reflex-stage.js').ReflexCase[]} the cases that specialisation faces (a genome's reflex score is
 *   its mean over these, as a drill skips a subject whose `spec` does not match)
 */
export function casesFor(spec) {
    return REFLEX_CASES.filter((c) => c.spec === spec);
}

/**
 * @param {string} name a case's name
 * @returns {import('./reflex-stage.js').ReflexCase} the case
 * @throws {Error} on an unknown name, listing the known ones
 */
export function caseNamed(name) {
    const found = REFLEX_CASES.find((c) => c.name === name);
    if (found === undefined) {
        throw new Error(`reflex: unknown case "${name}"; known: ${REFLEX_CASES.map((c) => c.name).join(', ')}`);
    }
    return found;
}
