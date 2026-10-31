import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { checkFlora, FLORA_DEFAULTS, FLORA_NAMES } from '../../js/sim/config-flora.js';

const invalid = {
    share: -1,
    energy: 0,
    energySpread: -1,
    radius: 0,
    yield: -1,
    regrow: -1,
    life: 0,
    start: 1,
    span: 0,
    hue: 2,
    toxicity: 2,
    pollenChance: 2,
    range: -1,
};

describe('flora config', () => {
    it('uses the species table with toxic cap patches', () => {
        const c = createConfig();
        expect(Object.keys(c.flora)).toEqual(FLORA_NAMES);
        expect(c.flora.toxiccap.share).toBe(3);
        expect(c).not.toHaveProperty('highFoodChance');
        expect(Object.isFrozen(c.flora.grass)).toBe(true);
    });

    it('accepts the six starting rows with the feature enabled', () => {
        expect(createConfig().flora).toEqual(FLORA_DEFAULTS);
    });

    for (const [field, value] of Object.entries(invalid)) {
        it(`rejects invalid ${field} even on an unpopulated species`, () => {
            expect(() => createConfig({ flora: { toxiccap: { [field]: value } } })).toThrow(`flora.toxiccap.${field}`);
            expect(() => createConfig({ flora: { grass: { [field]: NaN } } })).toThrow(`flora.grass.${field}`);
        });
    }

    it('requires exactly the six rows and every field', () => {
        const table = structuredClone(FLORA_DEFAULTS);
        Reflect.deleteProperty(table.berry, 'life');
        expect(() => checkFlora(table)).toThrow('flora.berry');
        expect(() => checkFlora({ ...FLORA_DEFAULTS, extra: {} })).toThrow('flora');
        expect(() => checkFlora(null)).toThrow('flora');
    });

    it('requires a productive patch species and nonnegative item energy', () => {
        expect(() => createConfig({ flora: { grass: { yield: 0 } } })).toThrow('positive share');
        expect(() => createConfig({ flora: { grass: { regrow: 0 } } })).toThrow('positive share');
        expect(() => createConfig({ flora: { grass: { energySpread: 2 } } })).toThrow('energySpread');
    });

    for (const field of ['share', 'yield', 'regrow', 'range']) {
        it(`keeps fungus ${field} at zero`, () => {
            expect(() => createConfig({ flora: { fungus: { [field]: 1 } } })).toThrow('fungus');
        });
    }

    it('checks the largest species radius', () => {
        expect(() => createConfig({ flora: { grass: { radius: 100 } } })).toThrow('hashCellSize');
    });
});
