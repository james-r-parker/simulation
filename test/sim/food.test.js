import { describe, expect, it } from 'vitest';
import { ageFood, spawnFood } from '../../js/sim/food.js';
import { nextFloat } from '../../js/sim/rng.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { smallWorld } from './helpers/small-world.js';

// expected = foodRegrowPerArea * area / 1,000,000 * scarcity; the 1000 x 1000 world is 1 unit, so 4 per tick here.
const BASE = {
    maxFood: 40,
    foodRegrowPerArea: 4,
    seasons: [
        { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 },
        { foodScarcity: 0.5, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 },
        { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 },
        { foodScarcity: 1, energyDrain: 1, reproductionBonus: 1, temperatureModifier: 0 },
    ],
};

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} n items to spawn
 * @returns {void}
 */
function fill(w, n) {
    for (let i = 0; i < n; i++) {
        spawnFoodItem(w);
    }
}

describe('spawnFood', () => {
    it('spawns the whole part of the expected count', () => {
        const w = smallWorld(BASE);
        spawnFood(w);
        expect(w.foodCount).toBe(4);
    });

    it('draws the fraction exactly once even when expected is whole', () => {
        const w = smallWorld(BASE);
        const probe = smallWorld(BASE);
        spawnFood(w);
        nextFloat(probe.rng.food);
        for (let i = 0; i < 4; i++) {
            spawnFoodItem(probe);
        }
        expect(w.rng.food).toEqual(probe.rng.food);
    });

    it('adds one more item when the draw falls under the fraction', () => {
        // expected 2.5
        let low = 0;
        let high = 0;
        for (let seed = 0; seed < 20; seed++) {
            const w = smallWorld({ ...BASE, foodRegrowPerArea: 2.5, seed });
            spawnFood(w);
            if (w.foodCount === 2) {
                low++;
            } else if (w.foodCount === 3) {
                high++;
            }
        }
        expect(low + high).toBe(20);
        expect(low).toBeGreaterThan(0);
        expect(high).toBeGreaterThan(0);
    });

    it('never exceeds maxFood', () => {
        const w = smallWorld({ ...BASE, maxFood: 5 });
        for (let i = 0; i < 10; i++) {
            spawnFood(w);
        }
        expect(w.foodCount).toBe(5);
    });

    it('spawns fewer items in a scarce season', () => {
        const spring = smallWorld(BASE);
        const winter = smallWorld(BASE);
        winter.season[0] = 1;
        spawnFood(spring);
        spawnFood(winter);
        expect(winter.foodCount).toBe(2);
        expect(winter.foodCount).toBeLessThan(spring.foodCount);
    });

    it('is deterministic for a seed', () => {
        const run = () => {
            const w = smallWorld({ ...BASE, foodRegrowPerArea: 0.13 });
            for (let i = 0; i < 100; i++) {
                spawnFood(w);
                ageFood(w);
            }
            return [w.foodCount, Array.from(w.foodX), Array.from(w.foodAge)];
        };
        expect(run()).toEqual(run());
    });
});

describe('ageFood', () => {
    it('removes only food older than the species lifetime and keeps the count', () => {
        const w = smallWorld({ ...BASE, flora: { grass: { life: 3 } } });
        fill(w, 3);
        w.foodAge[0] = 3;
        w.foodAge[1] = 1;
        ageFood(w);
        expect(w.foodAlive[0]).toBe(0);
        expect(w.foodAlive[1]).toBe(1);
        expect(w.foodAlive[2]).toBe(1);
        expect(w.foodAge[1]).toBe(2);
        expect(w.foodAge[2]).toBe(1);
        expect(w.foodCount).toBe(2);
    });

    it('keeps food that reaches exactly the species lifetime', () => {
        const w = smallWorld({ ...BASE, flora: { grass: { life: 3 } } });
        fill(w, 1);
        w.foodAge[0] = 2;
        ageFood(w);
        expect(w.foodAlive[0]).toBe(1);
        expect(w.foodAge[0]).toBe(3);
    });
});

describe('spawnFood exact rules', () => {
    it('does not add an extra item when the draw equals the fraction', () => {
        const probe = smallWorld(BASE);
        const draw = nextFloat(probe.rng.food);
        // expected = draw, so whole is 0 and the fraction is the draw itself
        const w = smallWorld({ ...BASE, foodRegrowPerArea: draw });
        spawnFood(w);
        expect(w.foodCount).toBe(0);
    });

    it('adds an extra item when the draw is just under the fraction', () => {
        const probe = smallWorld(BASE);
        const draw = nextFloat(probe.rng.food);
        const w = smallWorld({ ...BASE, foodRegrowPerArea: draw * 1.01 });
        spawnFood(w);
        expect(w.foodCount).toBe(1);
    });
});

describe('ageFood on dead slots', () => {
    it('does not age or remove food slots that are not alive', () => {
        const w = smallWorld({ ...BASE, flora: { grass: { life: 3 } } });
        fill(w, 2);
        w.foodAlive[0] = 0;
        w.foodAge[0] = 9;
        w.foodCount = 1;
        ageFood(w);
        expect(w.foodAge[0]).toBe(9);
        expect(w.foodCount).toBe(1);
        expect(w.foodAlive[1]).toBe(1);
    });
});
