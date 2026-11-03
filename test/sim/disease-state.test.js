import { describe, expect, it } from 'vitest';
import { DISEASE_MAX_STRAINS } from '../../js/sim/config-disease.js';
import {
    allocDiseaseState,
    DISEASE_AGENT_ARRAYS,
    DISEASE_STRAIN_ARRAYS,
    diseaseSpecs,
} from '../../js/sim/disease-state.js';
import { SIMILARITY_DIMS } from '../../js/sim/genetics.js';

describe('disease state', () => {
    it('names one per-agent row per agent array', () => {
        expect(diseaseSpecs().map(([, name, stride]) => [name, stride])).toEqual(
            DISEASE_AGENT_ARRAYS.map((name) => [name, 1]),
        );
    });

    it('allocates the strain pool zeroed, one entry per strain slot', () => {
        /** @type {Record<string, any>} */
        const world = {};
        allocDiseaseState(world);
        for (const name of DISEASE_STRAIN_ARRAYS) {
            const per = name === 'strainGenotype' ? SIMILARITY_DIMS : 1;
            expect(world[name].length, name).toBe(DISEASE_MAX_STRAINS * per);
            expect(world[name].every((/** @type {number} */ v) => v === 0)).toBe(true);
        }
    });
});
