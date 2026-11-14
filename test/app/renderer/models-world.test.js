import { describe, expect, it } from 'vitest';
import { FLORA_NAMES } from '../../../js/sim/config-flora.js';
import {
    FOOD_MODELS,
    HERD_MODEL,
    MARK_MODELS,
    MOTE_MODELS,
    PATCH_MODEL,
    REFUGE_MODEL,
    ROCK_MODEL,
    ZONE_MODELS,
} from '../../../js/app/renderer/models-world.js';
import { validateModel } from '../../../js/app/renderer/models.js';

describe('world models', () => {
    it('orders the food models by FLORA_NAMES, then the carcass', () => {
        expect(FOOD_MODELS.map((m) => m.name)).toEqual([...FLORA_NAMES, 'carcass']);
    });

    it('are all well formed', () => {
        const all = [
            HERD_MODEL,
            ...FOOD_MODELS,
            ROCK_MODEL,
            REFUGE_MODEL,
            PATCH_MODEL,
            ...ZONE_MODELS,
            ...MARK_MODELS,
            ...MOTE_MODELS,
        ];
        for (const model of all) {
            expect(validateModel(model), model.name).toEqual([]);
        }
    });

    it('binds the herd legs in two alternating pairs and the head to the head channel', () => {
        const binds = HERD_MODEL.parts.map((p) => /** @type {any} */ (p).bind).filter(Boolean);
        expect(binds.filter((b) => b === 'limbA')).toHaveLength(2);
        expect(binds.filter((b) => b === 'limbB')).toHaveLength(2);
        expect(binds).toContain('head');
    });
});
