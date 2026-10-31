import { smallWorld } from './small-world.js';
import { addBlob } from './life-world.js';
import { spawnFoodItem } from '../../../js/sim/spawn.js';

/** @param {Record<string, any>} [over] config overrides @returns {any} a clear two-flower garden and one carrier */
export function floraGarden(over = {}) {
    const w = smallWorld({
        worldWidth: 2000,
        foodPatchCount: 2,
        floraPatchMax: 4,
        foodPatchRadius: 100,
        foodBackgroundShare: 0,
        floraMutation: 0,
        flora: {
            grass: { share: 0 },
            berry: { share: 0 },
            nut: { share: 0 },
            flower: { share: 1, start: 0, span: 1 },
            toxiccap: { share: 0 },
        },
        ...over,
    });
    w.obsX.fill(1e6);
    w.obsY.fill(1e6);
    w.patchX.set([300, 500]);
    w.patchY.set([500, 500]);
    addBlob(w, { x: 500, y: 500, energy: 100 });
    return w;
}

/** @param {any} w the garden @param {number} patch source patch @returns {number} a plant meal at the carrier */
export function patchMeal(w, patch) {
    const food = spawnFoodItem(w);
    w.foodPatch[food] = patch;
    w.foodPatchSerial[food] = w.patchSerial[patch];
    w.foodSpecies[food] = w.patchSpecies[patch];
    w.foodX[food] = w.x[0];
    w.foodY[food] = w.y[0];
    w.foodValue[food] = 10;
    return food;
}
