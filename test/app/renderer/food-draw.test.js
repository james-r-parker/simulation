import { describe, expect, it } from 'vitest';
import { createFoodDraw } from '../../../js/app/renderer/food-draw.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('createFoodDraw', () => {
    it('draws one mesh per food model and clears without a snapshot', () => {
        const layer = createFoodDraw({ info: { maxFood: 8 } });
        expect(layer.object.children).toHaveLength(7);
        const snapshot = makeSnapshot(1, [], { foods: [[0, 0, 5, 0, 2, 0]] });
        const frame = /** @type {any} */ ({ snapshot, camera: { zoom: 1 }, nowMs: 0, family: { palette: 'default' } });
        layer.update?.(frame);
        expect(layer.object.children[2].geometry.instanceCount).toBe(1);
        layer.update?.(/** @type {any} */ ({ snapshot: null }));
        expect(layer.object.children[2].geometry.instanceCount).toBe(0);
        layer.dispose();
    });
});
