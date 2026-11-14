import { describe, expect, it } from 'vitest';
import { FX_SHAPES } from '../../../js/app/renderer/fx-curves.js';
import { PARTICLE_MODELS } from '../../../js/app/renderer/models-particles.js';
import { validateModel } from '../../../js/app/renderer/models.js';

describe('particle models', () => {
    it('has one well formed model per effect shape, in FX_SHAPES order', () => {
        expect(PARTICLE_MODELS.map((m) => m.name)).toEqual([...FX_SHAPES]);
        for (const model of PARTICLE_MODELS) {
            expect(validateModel(model), model.name).toEqual([]);
        }
    });
});
