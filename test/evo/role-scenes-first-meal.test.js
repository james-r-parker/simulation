import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { firstMealConfig, playFirstMeal } from '../../js/evo/role-scenes-first-meal.js';

const world = createConfig({});

describe('firstMealConfig', () => {
    it('empties the world of agents, floor and herds, fills the food to its cap and makes every plant the same grass', () => {
        const c = firstMealConfig(world, { count: 8, seed: 5 });
        expect([c.initialAgents, c.minAgents, c.maxAgents, c.herdCount, c.initialFood, c.seed]).toEqual([
            0, 0, 16, 0, 3600, 5,
        ]);
        for (const [name, row] of Object.entries(c.flora)) {
            expect([row.energy, row.radius, row.span, row.energySpread]).toEqual([1, 1, 1, 0]);
            expect(row.share).toBe(name === 'grass' ? 1 : 0);
        }
    });

    it('keeps the patches of the default world', () => {
        const c = firstMealConfig(world, { count: 8, seed: 5 });
        expect([c.foodPatchCount, c.foodPatchRadius, c.worldWidth]).toEqual([16, 400, 14400]);
    });
});

describe('playFirstMeal', () => {
    it('a child born inside a patch eats at once', () => {
        const r = playFirstMeal(world, { spec: 'forager', rule: 'child', mode: 'find', count: 16, seed: 2 });
        expect(r.outcome.count).toBe(16);
        expect(r.outcome.share).toBeGreaterThan(0.8);
        expect(r.outcome.meanTicks).toBeLessThan(60);
    });

    it('an entrant that heads for the patch eats more often than one that walks straight, over the same seeded points', () => {
        const reach = playFirstMeal(world, { spec: 'forager', rule: 'entrant', mode: 'reach', count: 48, seed: 4 });
        const find = playFirstMeal(world, { spec: 'forager', rule: 'entrant', mode: 'find', count: 48, seed: 4 });
        expect(reach.outcome.share).toBeGreaterThan(find.outcome.share);
        expect(reach.outcome.eaten).toBe(Math.round(reach.outcome.share * 48));
    });

    it('replays bit for bit from the seed, and a different seed gives different points', () => {
        const a = playFirstMeal(world, { spec: 'forager', rule: 'entrant', mode: 'find', count: 24, seed: 9 });
        expect(playFirstMeal(world, { spec: 'forager', rule: 'entrant', mode: 'find', count: 24, seed: 9 })).toEqual(a);
        const b = playFirstMeal(world, { spec: 'forager', rule: 'entrant', mode: 'find', count: 24, seed: 10 });
        expect(b.outcome.meanTicks).not.toBe(a.outcome.meanTicks);
    });
});
