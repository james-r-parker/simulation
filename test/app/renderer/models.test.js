import { describe, expect, it } from 'vitest';
import { FX_SHAPES } from '../../../js/app/renderer/fx-curves.js';
import {
    AGENT_MODELS,
    MAX_PARTS,
    modelBounds,
    modelFor,
    MODELS,
    PARTICLE_BY_SHAPE,
    partExtent,
    validateModel,
} from '../../../js/app/renderer/models.js';
import { FOOD_MODELS, MOTE_MODELS } from '../../../js/app/renderer/models-world.js';
import { sdCircle } from '../../../js/app/renderer/sdf-math.js';
import { smallReady } from '../helpers/ready.js';

describe('the model catalogue', () => {
    it('has a well formed model for every rendered item', () => {
        for (const model of Object.values(MODELS)) {
            expect(validateModel(model), model.name).toEqual([]);
            expect(model.parts.length).toBeLessThanOrEqual(MAX_PARTS);
        }
    });

    it('covers every specialisation the worker sends', () => {
        const { info } = smallReady();
        for (const spec of info.specs) {
            expect(AGENT_MODELS[/** @type {keyof typeof AGENT_MODELS} */ (spec.name)], spec.name).toBeDefined();
        }
    });

    it('covers the six food species and the carcass, the four seasons and every particle shape', () => {
        expect(FOOD_MODELS.map((m) => m.name)).toEqual([
            'grass',
            'berry',
            'nut',
            'flower',
            'fungus',
            'toxiccap',
            'carcass',
        ]);
        expect(MOTE_MODELS).toHaveLength(4);
        expect(PARTICLE_BY_SHAPE).toHaveLength(FX_SHAPES.length);
        PARTICLE_BY_SHAPE.forEach((model, i) => expect(model?.name).toBe(FX_SHAPES[i]));
        for (const name of ['herd', 'rock', 'refuge', 'patch', 'fertile', 'dung', 'frostTick', 'crack', 'cloud']) {
            expect(MODELS[name], name).toBeDefined();
        }
    });

    it('falls back to the forager for an unknown spec and says so', () => {
        const missing = [];
        expect(modelFor('nope', (n) => missing.push(n))).toBe(AGENT_MODELS.forager);
        expect(modelFor('predator')).toBe(AGENT_MODELS.predator);
        expect(missing).toEqual(['nope']);
    });

    it('reports a malformed part', () => {
        const bad = { name: 'bad', parts: [{ name: 'x', shape: 'star', bind: 'tail', color: 'mauve' }] };
        expect(validateModel(bad)).toHaveLength(3);
    });
});

describe('modelBounds', () => {
    it('covers every part at the largest clip scale, so no part is cut by its quad', () => {
        for (const model of Object.values(MODELS)) {
            const bound = modelBounds(model);
            for (const part of model.parts) {
                expect(bound, `${model.name}.${part.name}`).toBeGreaterThanOrEqual(partExtent(part));
            }
        }
    });

    it('is exact for a plain disc', () => {
        const disc = { name: 'disc', parts: [{ name: 'd', shape: 'circle', r: 1 }] };
        expect(partExtent(disc.parts[0])).toBe(1);
        expect(sdCircle(partExtent(disc.parts[0]), 0, 1)).toBe(0);
    });
});
