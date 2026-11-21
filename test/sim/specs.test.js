import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    SPEC,
    SPEC_COUNT,
    SPEC_NAMES,
    isDefender,
    isForager,
    isPredator,
    isReproducer,
    isScout,
    isSpecIndex,
} from '../../js/sim/specs.js';

describe('specs', () => {
    it('lists the five specialisations in the index order the config fixes', () => {
        const config = createConfig({});
        expect([...SPEC_NAMES]).toEqual(Object.keys(config.specialisations));
        for (const [index, name] of SPEC_NAMES.entries()) {
            expect(config.specialisations[name].index).toBe(index);
        }
        expect(SPEC_COUNT).toBe(5);
    });

    it('names each index, frozen', () => {
        expect(SPEC).toEqual({ FORAGER: 0, PREDATOR: 1, REPRODUCER: 2, SCOUT: 3, DEFENDER: 4 });
        expect(Object.isFrozen(SPEC)).toBe(true);
        expect(Object.isFrozen(SPEC_NAMES)).toBe(true);
    });

    it('has a role test that holds for exactly one index', () => {
        const tests = [isForager, isPredator, isReproducer, isScout, isDefender];
        for (let spec = 0; spec < SPEC_COUNT; spec++) {
            expect(tests.filter((test) => test(spec))).toEqual([tests[spec]]);
        }
        expect(tests.some((test) => test(5))).toBe(false);
    });

    it('accepts only an integer index below the count', () => {
        expect([0, 4, 5, -1, 1.5, '1'].map((spec) => isSpecIndex(/** @type {number} */ (spec)))).toEqual([
            true,
            true,
            false,
            false,
            false,
            false,
        ]);
    });
});
