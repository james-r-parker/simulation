import { describe, expect, it } from 'vitest';
import { planRun } from '../../js/evo/curriculum.js';

const gated = { name: 'a', config: null, gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }], maxGenerations: 5 };
const world = { name: 'w', config: null };

describe('plateauStop', () => {
    it('is a count of checkpoints on a gated stage and survives planning', () => {
        expect(planRun([{ ...gated, plateauStop: 6 }, world], 20)[0].plateauStop).toBe(6);
        expect(planRun([{ ...gated, plateauStop: 0 }, world], 20)[0].plateauStop).toBe(0);
    });

    it('rejects a negative or fractional count and a fixed stage that sets it', () => {
        const bad = (/** @type {any} */ entry) => () => planRun([entry, world], 20);
        expect(bad({ ...gated, plateauStop: -1 })).toThrow('"plateauStop" must be an integer >= 0');
        expect(bad({ ...gated, plateauStop: 1.5 })).toThrow('"plateauStop" must be an integer >= 0');
        expect(bad({ ...gated, plateauStop: '6' })).toThrow('"plateauStop" must be an integer >= 0');
        expect(bad({ name: 'f', config: null, generations: 3, plateauStop: 2 })).toThrow(
            /"plateauStop" belongs to a gated/,
        );
    });
});
