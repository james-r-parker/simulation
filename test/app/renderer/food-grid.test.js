import { describe, expect, it } from 'vitest';
import { createPrng } from '../../../js/app/prng.js';
import { buildFoodGrid, createFoodGrid, FOOD_KIND, nearestFood } from '../../../js/app/renderer/food-grid.js';
import { makeSnapshot } from '../helpers/snapshots.js';

const INFO = { maxFood: 400, worldWidth: 2000, worldHeight: 1000 };

/**
 * @param {number[][]} foods food rows: x, y, radius, age01, species, hue
 * @param {number} [tick] snapshot tick
 * @returns {any} a snapshot holding the food
 */
function snap(foods, tick = 1) {
    return makeSnapshot(tick, [], { foods });
}

describe('nearestFood', () => {
    it('matches a brute-force scan on random layouts and radii', () => {
        const prng = createPrng(7);
        const foods = Array.from({ length: 300 }, () => [prng.next() * 2000, prng.next() * 1000, 5, 0, 0, 0]);
        const grid = createFoodGrid(INFO);
        buildFoodGrid(grid, snap(foods));
        for (let q = 0; q < 200; q++) {
            const x = prng.next() * 2200 - 100;
            const y = prng.next() * 1200 - 100;
            const r = 20 + prng.next() * 300;
            let best = -1;
            let bestD = r * r;
            foods.forEach(([fx, fy], i) => {
                const d = (fx - x) ** 2 + (fy - y) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            });
            expect(nearestFood(grid, x, y, r)).toBe(best);
        }
    });

    it('names meat by a negative radius, fungus and toxic caps by species, the rest plant, and keeps the hue', () => {
        const grid = createFoodGrid(INFO);
        buildFoodGrid(
            grid,
            snap([
                [10, 10, -6, 0, 0, 0],
                [100, 10, 5, 0, 4, 0.25],
                [200, 10, 5, 0, 5, 0],
                [300, 10, 5, 0, 1, -0.5],
            ]),
        );
        expect(Array.from(grid.kind.subarray(0, 4))).toEqual([
            FOOD_KIND.MEAT,
            FOOD_KIND.FUNGUS,
            FOOD_KIND.TOXIC,
            FOOD_KIND.PLANT,
        ]);
        expect(grid.hue[3]).toBe(-0.5);
        expect(grid.count).toBe(4);
        expect(nearestFood(grid, 500, 500, 50)).toBe(-1);
    });

    it('rebuilds into the same arrays and remembers the snapshot tick', () => {
        const grid = createFoodGrid(INFO);
        const order = grid.order;
        buildFoodGrid(grid, snap([[10, 10, 5, 0, 0, 0]], 4));
        buildFoodGrid(grid, snap([], 5));
        expect(grid.order).toBe(order);
        expect(grid.count).toBe(0);
        expect(grid.tick).toBe(5);
        expect(nearestFood(grid, 10, 10, 100)).toBe(-1);
    });
});
