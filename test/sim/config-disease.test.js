import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import {
    DISEASE_DEFAULTS,
    DISEASE_MAX_STRAINS,
    DISEASE_RULES,
    diseaseEventDemand,
} from '../../js/sim/config-disease.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

describe('disease config', () => {
    it('ships the contagion on, with a rule for every default', () => {
        expect(DISEASE_DEFAULTS.diseaseSeedRate).toBe(0.001);
        expect(Object.keys(DISEASE_RULES).sort()).toEqual(Object.keys(DISEASE_DEFAULTS).sort());
        expect(createConfig(SIMPLE_WORLD).diseaseSeedRate).toBe(0.001);
    });

    it('needs no event room while off and an infection per agent plus two per strain while on', () => {
        expect(diseaseEventDemand({ diseaseSeedRate: 0, maxAgents: 100 })).toBe(0);
        expect(diseaseEventDemand({ diseaseSeedRate: 0.001, maxAgents: 100 })).toBe(100 + 2 * DISEASE_MAX_STRAINS);
    });

    it('accepts a minimum host count above maxAgents: such a world never sees a strain', () => {
        expect(() =>
            createConfig({ ...SIMPLE_WORLD, maxAgents: 10, initialAgents: 5, minAgents: 5, diseaseMinHosts: 50 }),
        ).not.toThrow();
    });

    it('rejects out-of-range values through createConfig', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseTransmission: 1.5 })).toThrow(/diseaseTransmission/);
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseTicks: 0 })).toThrow(/diseaseTicks/);
        expect(() => createConfig({ ...SIMPLE_WORLD, diseaseSpecificity: 0 })).toThrow(/diseaseSpecificity/);
    });
});
