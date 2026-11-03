import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    checkDisease,
    DISEASE_DEFAULTS,
    DISEASE_MAX_STRAINS,
    DISEASE_RULES,
    diseaseEventDemand,
} from '../../js/sim/config-disease.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('disease config', () => {
    it('ships the contagion off, with a rule for every default', () => {
        expect(DISEASE_DEFAULTS.diseaseSeedRate).toBe(0);
        expect(Object.keys(DISEASE_RULES).sort()).toEqual(Object.keys(DISEASE_DEFAULTS).sort());
        expect(createConfig(SIMPLE_WORLD).diseaseSeedRate).toBe(0);
    });

    it('needs no event room while off and an infection per agent plus two per strain while on', () => {
        expect(diseaseEventDemand({ diseaseSeedRate: 0, maxAgents: 100 })).toBe(0);
        expect(diseaseEventDemand({ diseaseSeedRate: 0.001, maxAgents: 100 })).toBe(100 + 2 * DISEASE_MAX_STRAINS);
    });

    it('refuses a minimum host count above maxAgents only while the contagion is on', () => {
        expect(() => checkDisease({ diseaseSeedRate: 0, diseaseMinHosts: 50, maxAgents: 10 })).not.toThrow();
        expect(() => checkDisease({ diseaseSeedRate: 0.1, diseaseMinHosts: 50, maxAgents: 10 })).toThrow(
            /diseaseMinHosts 50 must be at most maxAgents 10/,
        );
    });

    it('rejects out-of-range values through createConfig', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseTransmission: 1.5 })).toThrow(/diseaseTransmission/);
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseTicks: 0 })).toThrow(/diseaseTicks/);
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseSpecificity: 0 })).toThrow(/diseaseSpecificity/);
    });
});
