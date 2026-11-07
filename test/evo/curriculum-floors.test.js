import { describe, expect, it } from 'vitest';
import { endsInTargetWorld, validateStageFloors } from '../../js/evo/curriculum.js';

describe('validateStageFloors', () => {
    const overrides = /** @type {Record<string, Record<string, any>>} */ ({
        'floor20.json': { minAgents: 20 },
        'floor60.json': { minAgents: 60 },
        'none.json': { minAgents: 0 },
    });
    const world = { overridesOf: (/** @type {string} */ file) => overrides[file], targetMinAgents: 40 };
    const last = { name: 'world', config: null };

    it('allows a floor below the target in a non-final stage that runs no hunters', () => {
        expect(() =>
            validateStageFloors(
                [
                    { name: 'nursery', config: 'floor20.json', generations: 5 },
                    { name: 'hunt', config: 'none.json', generations: 5 },
                    last,
                ],
                world,
            ),
        ).not.toThrow();
    });

    it("refuses a stage's minAgents above the target world's", () => {
        expect(() =>
            validateStageFloors([{ name: 'nursery', config: 'floor60.json', generations: 5 }, last], world),
        ).toThrow(/minAgents 60, above the target world's 40/);
    });

    it('refuses a hunter stage with a floor', () => {
        expect(() =>
            validateStageFloors([{ name: 'hunt-slow', config: 'floor20.json', generations: 5 }, last], world),
        ).toThrow(/hunter stage "hunt-slow"/);
    });

    it('refuses a final stage that is not the target world', () => {
        expect(() => validateStageFloors([{ name: 'hunt', config: 'none.json' }], world)).toThrow(/final stage "hunt"/);
        expect(() => validateStageFloors([last], world)).not.toThrow();
    });
});

describe('endsInTargetWorld', () => {
    it('is true only when the last recorded stage has the target rules hash', () => {
        const stages = [
            { name: 'hunt', rulesHash: 'h' },
            { name: 'world', rulesHash: 't' },
        ];
        expect(endsInTargetWorld(stages, 't')).toBe(true);
        expect(endsInTargetWorld(stages.slice(0, 1), 't')).toBe(false);
        expect(endsInTargetWorld([], 't')).toBe(false);
        expect(endsInTargetWorld(undefined, 't')).toBe(false);
    });
});
