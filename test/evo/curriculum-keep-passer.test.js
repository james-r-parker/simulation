import { describe, expect, it } from 'vitest';
import { planRun } from '../../js/evo/curriculum.js';

const gated = { name: 'a', config: null, gate: [{ read: 'drill.food-ahead.edgeLow', min: 0.3 }], maxGenerations: 5 };

describe('keepPasser', () => {
    it('is a boolean on a gated stage and survives planning', () => {
        const plan = planRun(
            [
                { ...gated, keepPasser: true },
                { name: 'w', config: null },
            ],
            20,
        );
        expect(plan[0].keepPasser).toBe(true);
    });

    it('rejects a non-boolean value', () => {
        const bad = () =>
            planRun(
                [
                    { ...gated, keepPasser: /** @type {any} */ ('yes') },
                    { name: 'w', config: null },
                ],
                20,
            );
        expect(bad).toThrow('"keepPasser" must be true or false');
    });
});
