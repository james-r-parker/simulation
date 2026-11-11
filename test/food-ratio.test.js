import { describe, expect, it } from 'vitest';
import { parseArgs, runFoodRatio } from '../scripts/food-ratio.mjs';
import { runSeed } from '../scripts/food-ratio-worker.mjs';
import { foodRatio, offeredPerTick } from '../scripts/lib/food-ratio.mjs';

const CONFIG = {
    foodRegrowPerArea: 0.1,
    worldWidth: 1000,
    worldHeight: 2000,
    seasons: [{ foodScarcity: 1.0 }, { foodScarcity: 0.5 }],
};

describe('offeredPerTick', () => {
    it('is the rate per 1,000,000 px2 over the area at the mean scarcity', () => {
        expect(offeredPerTick(CONFIG)).toBeCloseTo(0.1 * 2 * 0.75, 12);
    });
});

describe('foodRatio', () => {
    const seeds = [
        { ticks: 100, agentTicks: 1000, plantMeals: 10, plantEnergy: 600, allEnergy: 800 },
        { ticks: 100, agentTicks: 3000, plantMeals: 20, plantEnergy: 1400, allEnergy: 2200 },
    ];

    it('pools the counts over every tick, not seed by seed', () => {
        const r = foodRatio(seeds, CONFIG);
        expect(r.meanPopulation).toBe(20);
        expect(r.mealsPerTick).toBeCloseTo(0.15, 12);
        expect(r.mealsPerAgentTick).toBeCloseTo(30 / 4000, 12);
        expect(r.storedPerMeal).toBeCloseTo(2000 / 30, 12);
        expect(r.plantEnergyPerTick).toBeCloseTo(10, 12);
        expect(r.allEnergyPerTick).toBeCloseTo(15, 12);
        expect(r.allEnergyPer1k).toBeCloseTo(750, 12);
    });

    it('gives the regrow rate whose offered supply equals the eaten rate', () => {
        const r = foodRatio(seeds, CONFIG);
        expect(r.ratio).toBeCloseTo(0.15 / 0.15, 12);
        expect(r.regrowAtEaten).toBeCloseTo(0.1, 12);
        const half = foodRatio(seeds, { ...CONFIG, foodRegrowPerArea: 0.2 });
        expect(half.ratio).toBeCloseTo(0.5, 12);
        expect(half.regrowAtEaten).toBeCloseTo(0.1, 12);
    });

    it('refuses an empty pool', () => {
        expect(() => foodRatio([], CONFIG)).toThrow('no ticks');
    });
});

describe('food-ratio script', () => {
    it('parses its flags and rejects an unknown one', () => {
        expect(parseArgs(['--seeds', '2', '--ticks', '50', '--json'])).toMatchObject({
            seeds: 2,
            ticks: 50,
            json: true,
        });
        expect(() => parseArgs(['--nope'])).toThrow('unknown argument');
    });

    it('counts exact meals on a short run and prints the pooled ratio', async () => {
        const one = runSeed({ seed: 313056, ticks: 300, policy: 'map-elites-v6', overrides: {} });
        expect(one.agentTicks).toBeGreaterThan(0);
        expect(one.plantEnergy).toBeLessThanOrEqual(one.allEnergy);
        /** @type {string[]} */
        const lines = [];
        const ratio = await runFoodRatio(['--seeds', '1', '--ticks', '300', '--workers', '1'], (l) => lines.push(l));
        expect(ratio.mealsPerTick).toBeCloseTo(one.plantMeals / 300, 12);
        expect(lines.join('\n')).toContain('regrowAtEaten');
    }, 60000);
});
