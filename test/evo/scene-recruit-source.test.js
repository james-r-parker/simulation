// The birth facts the recruit scene reads (honest-budgets T33a): the cohort source of a birth source and the parent rows of a child.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { BIRTH_SOURCE } from '../../js/sim/hunter-ledger.js';
import { cohortSource, hunterBirthParents } from '../../js/evo/scene-recruit-source.js';

/**
 * @param {number} cause the `BORN_CAUSE`
 * @param {number} a the first parent's genome id
 * @param {number} b the second parent's genome id
 * @returns {Float64Array} a ring holding one `AgentBorn` at offset 0
 */
function born(cause, a, b) {
    const ring = createEventRing(1);
    const o = pushEvent(ring, EVENT_TYPE.AGENT_BORN, 1);
    ring.data[o + 6] = a;
    ring.data[o + 7] = b;
    ring.data[o + 8] = cause;
    return ring.data;
}

describe('cohortSource', () => {
    it('maps the three hunter sources to their own index and every other source to the floor entrants', () => {
        expect(cohortSource(BIRTH_SOURCE.MATE_HUNTER)).toBe(0);
        expect(cohortSource(BIRTH_SOURCE.SPLIT_HUNTER)).toBe(1);
        expect(cohortSource(BIRTH_SOURCE.SPEC_FLIP)).toBe(2);
        expect(cohortSource(BIRTH_SOURCE.FLOOR)).toBe(3);
        expect(cohortSource(BIRTH_SOURCE.IMMIGRANT)).toBe(3);
    });
});

describe('hunterBirthParents', () => {
    const scene = { rowOf: new Map([[10, 4]]) };

    it('reads the rows of the cohort parents of a mating, -1 for one outside the cohort', () => {
        expect(hunterBirthParents(scene, born(BORN_CAUSE.MATE, 10, 11), 0)).toEqual({ parentA: 4, parentB: -1 });
    });

    it('names a split mother once', () => {
        expect(hunterBirthParents(scene, born(BORN_CAUSE.SPLIT, 10, 10), 0)).toEqual({ parentA: 4, parentB: -1 });
    });

    it('has no parents for a floor birth', () => {
        expect(hunterBirthParents(scene, born(BORN_CAUSE.FLOOR, 10, 10), 0)).toEqual({ parentA: -1, parentB: -1 });
    });
});
