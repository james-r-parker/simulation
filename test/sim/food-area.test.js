import { describe, expect, it } from 'vitest';
import { spawnFood } from '../../js/sim/food.js';
import { createConfig } from '../../js/sim/config.js';
import { smallWorld } from './helpers/small-world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const SEASON = { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 };
// 1000 x 1000 px is 1 unit of area, so foodRegrowPerArea is the expected spawns per tick.
const AREA = {
    maxFood: 400,
    foodRegrowPerArea: 3.5,
    foodPatchCount: 2,
    foodPatchRadius: 100,
    foodBackgroundShare: 0,
    fertileZoneSpawnChance: 0,
    seasons: [SEASON, { ...SEASON, foodScarcity: 0.5 }, SEASON, SEASON],
};

describe('area food', () => {
    it('defaults to a rate of 0.06', () => {
        expect(createConfig({ ...FEATURES_OFF }).foodRegrowPerArea).toBe(0.06);
    });

    it('spawns the area rate per tick whatever the population', () => {
        const w = smallWorld(AREA);
        for (let t = 0; t < 100; t++) {
            spawnFood(w);
        }
        expect(w.foodCount).toBeGreaterThanOrEqual(100 * 3);
        expect(w.foodCount).toBeLessThanOrEqual(100 * 4);
    });

    it('scales with the world area and the season scarcity', () => {
        const big = smallWorld({ ...AREA, worldWidth: 2000, maxFood: 1000 });
        const winter = smallWorld({ ...AREA, maxFood: 1000 });
        winter.season[0] = 1;
        spawnFood(big);
        spawnFood(winter);
        expect(big.foodCount).toBeGreaterThanOrEqual(7);
        expect(winter.foodCount).toBeLessThanOrEqual(2);
    });

    it('never exceeds maxFood', () => {
        const w = smallWorld({ ...AREA, maxFood: 20 });
        for (let t = 0; t < 50; t++) {
            spawnFood(w);
        }
        expect(w.foodCount).toBe(20);
    });

    it('places items through the patches by stock', () => {
        const w = smallWorld({ ...AREA, maxFood: 1000 });
        w.patchX.set([200, 800]);
        w.patchY.set([200, 800]);
        w.patchStock.set([1, 0.05]);
        for (let t = 0; t < 100; t++) {
            spawnFood(w);
        }
        let nearFirst = 0;
        for (let i = 0; i < w.foodAlive.length; i++) {
            if (w.foodAlive[i] === 1 && w.foodX[i] < 500) {
                nearFirst += 1;
            }
        }
        expect(nearFirst / w.foodCount).toBeGreaterThan(0.85);
    });

    it('spawns nothing at a rate of 0', () => {
        const w = smallWorld({ ...AREA, foodRegrowPerArea: 0 });
        spawnFood(w);
        expect(w.foodCount).toBe(0);
    });
});
