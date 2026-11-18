// The food: one instanced mesh per food model (six flora species and the carcass), each drawn by its catalogue model
// from `packFood`'s bucket. Plants sway; a carcass darkens and shrinks as it rots.

import { createFoodPack, packFood, swayFood } from './food-pack.js';
import { createModelMeshes } from './model-meshes.js';
import { FOOD_MODELS } from './models-world.js';

/**
 * @param {{info: Record<string, any>}} context `ready.info` (`maxFood`)
 * @returns {import('./stage.js').Layer} the food layer
 */
export function createFoodDraw({ info }) {
    const capacity = Math.max(info.maxFood, 1);
    const pack = createFoodPack(capacity);
    const meshes = createModelMeshes(FOOD_MODELS, { capacity, buckets: pack.buckets });
    const view = { zoom: 1, timeSec: 0 };
    // what the last full pack read: food only moves when a snapshot lands or the zoom changes the smallest size
    const packed = { snapshot: /** @type {any} */ (null), zoom: 0 };
    return {
        object: meshes.object,
        update(frame) {
            if (frame.snapshot === null) {
                meshes.clear();
                packed.snapshot = null;
                return;
            }
            view.zoom = frame.camera.zoom;
            view.timeSec = frame.nowMs / 1000;
            meshes.setPalette(frame.family?.palette);
            if (frame.snapshot !== packed.snapshot || view.zoom !== packed.zoom) {
                packFood(frame.snapshot, pack, view);
                packed.snapshot = frame.snapshot;
                packed.zoom = view.zoom;
            } else {
                swayFood(pack, view.timeSec);
            }
            meshes.upload();
        },
        dispose: () => meshes.dispose(),
    };
}
