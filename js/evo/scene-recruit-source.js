// The birth facts the recruit scene reads from an `AgentBorn` record: the cohort source of a hunter and the cohort rows of its parents.

import { BORN_CAUSE, EVENT } from '../sim/events.js';
import { BIRTH_SOURCE } from '../sim/hunter-ledger.js';

/** The index of the `floor` source in `RECRUIT_SOURCES`, which also holds an entrant of an unlisted source (an immigrant). */
const FLOOR_SOURCE = 3;

/** The cohort source index of each `BIRTH_SOURCE` a hunter born after burn-in can have. */
const SOURCE_INDEX = Object.freeze({
    [BIRTH_SOURCE.MATE_HUNTER]: 0,
    [BIRTH_SOURCE.SPLIT_HUNTER]: 1,
    [BIRTH_SOURCE.SPEC_FLIP]: 2,
});

/**
 * @param {number} birthSource a `BIRTH_SOURCE`
 * @returns {number} its index in `RECRUIT_SOURCES`
 */
export function cohortSource(birthSource) {
    return /** @type {Record<number, number>} */ (SOURCE_INDEX)[birthSource] ?? FLOOR_SOURCE;
}

/**
 * @param {Record<string, any>} scene the recruit scene (`rowOf`)
 * @param {Float64Array} d the event ring data
 * @param {number} o the `AgentBorn` record offset
 * @returns {{parentA: number, parentB: number}} the cohort rows of the parents of a mating or split child, `-1` for a parent
 *   outside the cohort, for a split's second parent (it names the mother twice) and for any other birth
 */
export function hunterBirthParents(scene, d, o) {
    const cause = d[o + EVENT.AGENT_BORN.CAUSE];
    if (cause !== BORN_CAUSE.MATE && cause !== BORN_CAUSE.SPLIT) {
        return { parentA: -1, parentB: -1 };
    }
    const parentA = scene.rowOf.get(d[o + EVENT.AGENT_BORN.PARENT_A]) ?? -1;
    const parentB =
        d[o + EVENT.AGENT_BORN.PARENT_B] === d[o + EVENT.AGENT_BORN.PARENT_A]
            ? -1
            : (scene.rowOf.get(d[o + EVENT.AGENT_BORN.PARENT_B]) ?? -1);
    return { parentA, parentB };
}
