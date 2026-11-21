// Juvenile predator plant diet (honest-budgets Phase 6): a `canHunt` young below `juvenileTicks` takes
// `juvenilePlantShare` of plant food even when `plantFoodValue` is 0; at or above `juvenileTicks` it takes 0.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocBody, setSpec } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const PREDATOR = 1;

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {number} ageTicks
 * @returns {number} the cub slot
 */
function placeCub(w, ageTicks) {
    const slot = allocBody(w);
    w.x[slot] = 100;
    w.y[slot] = 100;
    setSpec(w, slot, PREDATOR);
    w.genomeId[slot] = slot + 1;
    w.ageTicks[slot] = ageTicks;
    addEnergy(w, slot, 20, ENERGY_SOURCE.INITIAL);
    w.ateTimer[slot] = 30;
    w.bittenTimer[slot] = 30;
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    return slot;
}

/**
 * @param {ReturnType<typeof smallWorld>} w
 * @param {number} value
 * @returns {number} the food slot
 */
function placePlant(w, value) {
    let slot = 0;
    while (w.foodAlive[slot] === 1) {
        slot++;
    }
    w.foodAlive[slot] = 1;
    w.foodX[slot] = 100;
    w.foodY[slot] = 100;
    w.foodRadius[slot] = 5;
    w.foodValue[slot] = value;
    w.foodCount++;
    return slot;
}

/** @param {ReturnType<typeof smallWorld>} w */
function stepFeed(w) {
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('juvenilePlantShare', () => {
    it('lets a juvenile predator eat juvenilePlantShare of plant food below juvenileTicks, and none at or above it', () => {
        const w = smallWorld({
            juvenileTicks: 3000,
            juvenilePlantShare: 0.4,
            specialisations: { predator: { plantFoodValue: 0 } },
        });
        const cub = placeCub(w, 2999);
        const f1 = placePlant(w, 10);
        stepFeed(w);
        expect(w.foodAlive[f1]).toBe(0);
        expect(w.energy[cub]).toBeCloseTo(24, 6);

        w.ageTicks[cub] = 3000;
        w.ateTimer[cub] = 30;
        const f2 = placePlant(w, 10);
        stepFeed(w);
        expect(w.foodAlive[f2]).toBe(1);
        expect(w.energy[cub]).toBeCloseTo(24, 6);
    });

    it('takes nothing below juvenileTicks when juvenilePlantShare is 0 (default)', () => {
        const w = smallWorld({
            juvenileTicks: 3000,
            juvenilePlantShare: 0,
            specialisations: { predator: { plantFoodValue: 0 } },
        });
        const cub = placeCub(w, 100);
        const f = placePlant(w, 10);
        stepFeed(w);
        expect(w.foodAlive[f]).toBe(1);
        expect(w.energy[cub]).toBe(20);
    });
});
