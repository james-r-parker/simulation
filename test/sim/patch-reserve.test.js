import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { PATCH_FLOOR_SHARE } from '../../js/sim/food-patches.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { ageFood, spawnFood } from '../../js/sim/food.js';
import { grazeHerds } from '../../js/sim/herd-graze.js';
import { FOOD_KIND } from '../../js/sim/carcass.js';
import { releaseItem, reserveItem, spendItem } from '../../js/sim/patch-reserve.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { removeFood } from '../../js/sim/world.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const CAPACITY = 100;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof smallWorld>} a world with one live patch at (200, 200) holding 50 of 100
 */
function energyWorld(over = {}) {
    const w = smallWorld({
        patchStockEnergy: true,
        foodPatchCount: 1,
        floraPatchMax: 1,
        foodPatchRadius: 100,
        foodPatchCapacity: CAPACITY,
        ...over,
    });
    w.patchX[0] = 200;
    w.patchY[0] = 200;
    w.patchStock[0] = 50;
    return w;
}

/**
 * Hand-places a plant item of the patch, reserving its energy as a spawn does.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} slot food slot
 * @param {number} value item energy
 * @param {number} patch source patch, or -1
 * @returns {number} the slot
 */
function put(w, slot, value, patch = 0) {
    w.foodAlive[slot] = 1;
    w.foodKind[slot] = FOOD_KIND.PLANT;
    w.foodX[slot] = 200;
    w.foodY[slot] = 200;
    w.foodRadius[slot] = 5;
    w.foodValue[slot] = value;
    w.foodLife[slot] = 10;
    w.foodPatch[slot] = patch;
    w.foodPatchSerial[slot] = patch >= 0 ? w.patchSerial[patch] : 0;
    w.foodCount += 1;
    reserveItem(w, slot);
    return slot;
}

/** @param {ReturnType<typeof smallWorld>} w the world @returns {void} one forager at the patch eats */
function forage(w) {
    const slot = allocBody(w);
    w.x[slot] = 200;
    w.y[slot] = 200;
    addEnergy(w, slot, 20, ENERGY_SOURCE.INITIAL);
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('patch reservation bookkeeping', () => {
    it('reserves a placed item and returns it when the item is removed, leaving the stock', () => {
        const w = energyWorld();
        put(w, 0, 7);
        put(w, 1, 5);
        expect(w.patchReserved[0]).toBe(12);
        removeFood(w, 0);
        expect(w.patchReserved[0]).toBe(5);
        expect(w.patchStock[0]).toBe(50);
    });

    it('ignores background items and items of a replaced patch', () => {
        const w = energyWorld();
        put(w, 0, 7, -1);
        expect(w.patchReserved[0]).toBe(0);
        put(w, 1, 5);
        w.patchSerial[0]++;
        releaseItem(w, 1);
        spendItem(w, 1);
        expect(w.patchReserved[0]).toBe(5);
        expect(w.patchStock[0]).toBe(50);
    });

    it('takes a blob meal from the patch stock and reservation by the item energy', () => {
        const w = energyWorld();
        put(w, 0, 7);
        put(w, 1, 5);
        w.foodX[1] = 700;
        forage(w);
        expect(w.foodAlive[0]).toBe(0);
        expect(w.patchStock[0]).toBe(43);
        expect(w.patchReserved[0]).toBe(5);
    });

    it('never takes a meal below the floor', () => {
        const w = energyWorld();
        w.patchStock[0] = PATCH_FLOOR_SHARE * CAPACITY + 2;
        put(w, 0, 7);
        forage(w);
        expect(w.patchStock[0]).toBe(PATCH_FLOOR_SHARE * CAPACITY);
        expect(w.patchReserved[0]).toBe(0);
    });

    it('gives a rotted item back to the reservation only', () => {
        const w = energyWorld();
        put(w, 0, 7);
        for (let i = 0; i < 11; i++) {
            ageFood(w);
        }
        expect(w.foodAlive[0]).toBe(0);
        expect(w.patchReserved[0]).toBe(0);
        expect(w.patchStock[0]).toBe(50);
    });

    it('takes a herd meal from the patch stock and reservation', () => {
        const w = energyWorld({ herdCount: 1, herdSize: 1, maxFood: 4 });
        w.herdX[0] = 200;
        w.herdY[0] = 200;
        put(w, 0, 9);
        grazeHerds(w);
        expect(w.foodAlive[0]).toBe(0);
        expect(w.patchStock[0]).toBe(41);
        expect(w.patchReserved[0]).toBe(0);
    });

    it('keeps the weight model with patchStockEnergy false: a meal takes foodPatchDepletion and no reservation moves', () => {
        const w = energyWorld({ patchStockEnergy: false, foodPatchDepletion: 3 });
        put(w, 0, 7);
        w.patchReserved[0] = 4;
        forage(w);
        expect(w.patchStock[0]).toBe(47);
        expect(w.patchReserved[0]).toBe(4);
    });
});

describe('areaExpected in the energy model', () => {
    const seasons = [
        { foodScarcity: 1, energyDrain: 1, temperatureModifier: 0 },
        { foodScarcity: 0.5, energyDrain: 1, temperatureModifier: 0 },
        { foodScarcity: 1, energyDrain: 1, temperatureModifier: 0 },
        { foodScarcity: 1, energyDrain: 1, temperatureModifier: 0 },
    ];
    const base = { maxFood: 40, foodRegrowPerArea: 4, foodPatchCount: 0, seasons };

    it('ignores foodScarcity', () => {
        const w = smallWorld({ ...base, patchStockEnergy: true });
        w.season[0] = 1;
        spawnFood(w);
        expect(w.foodCount).toBe(4);
    });

    it('keeps foodScarcity in the weight model', () => {
        const w = smallWorld(base);
        w.season[0] = 1;
        spawnFood(w);
        expect(w.foodCount).toBe(2);
    });
});
