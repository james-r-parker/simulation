// Pools per-seed food counts into the food ratio (carrying-capacity T8): plant meals per tick over the rate the food
// formula offers, and what a plant meal is worth once stored. Pure.

/**
 * @typedef {object} SeedFood
 * @property {number} ticks ticks the seed ran
 * @property {number} agentTicks the alive count summed over the ticks
 * @property {number} plantMeals plant items eaten (`floraMeals[0]`, exact: one count per eaten item)
 * @property {number} plantEnergy energy stored from plant meals (the sum of `floraIntake`)
 * @property {number} allEnergy energy stored from every meal, plant and carcass (the sum of `foodEatenBySpec`; what
 *   `eval.food_energy_per_1k` counts)
 */

/**
 * @typedef {object} FoodRatio
 * @property {number} seeds seeds pooled
 * @property {number} meanPopulation agent-ticks over ticks
 * @property {number} mealsPerTick plant meals per tick
 * @property {number} mealsPerAgentTick plant meals per agent-tick
 * @property {number} storedPerMeal energy stored per plant meal
 * @property {number} plantEnergyPerTick energy stored from plants per tick
 * @property {number} allEnergyPerTick energy stored from plants and carcasses per tick
 * @property {number} allEnergyPer1k `allEnergyPerTick` per 1000 agents, the `eval.food_energy_per_1k` reading
 * @property {number} offeredPerTick items per tick the formula offers (`offeredPerTick` of the config)
 * @property {number} ratio `mealsPerTick` over `offeredPerTick`
 * @property {number} regrowAtEaten `foodRegrowPerArea` whose offered rate equals `mealsPerTick`
 */

/**
 * The items per tick the food formula offers over a year, before `maxFood` clips it.
 * @param {{ foodRegrowPerArea: number, worldWidth: number, worldHeight: number, seasons: { foodScarcity: number }[] }} config the world config
 * @returns {number} `foodRegrowPerArea` x area per 1,000,000 px2 x the mean scarcity of the four seasons
 */
export function offeredPerTick(config) {
    const meanScarcity = config.seasons.reduce((sum, s) => sum + s.foodScarcity, 0) / config.seasons.length;
    return (config.foodRegrowPerArea * config.worldWidth * config.worldHeight * meanScarcity) / 1_000_000;
}

/**
 * @param {readonly SeedFood[]} seeds one record per seed
 * @param {Parameters<typeof offeredPerTick>[0]} config the config the seeds ran on
 * @returns {FoodRatio} the counts pooled over every tick of every seed
 * @throws {Error} when there are no seeds or no ticks
 */
export function foodRatio(seeds, config) {
    const sum = (/** @type {keyof SeedFood} */ key) => seeds.reduce((total, s) => total + s[key], 0);
    const ticks = sum('ticks');
    if (seeds.length === 0 || ticks === 0) {
        throw new Error('foodRatio: no ticks to pool');
    }
    const offered = offeredPerTick(config);
    const mealsPerTick = sum('plantMeals') / ticks;
    return {
        seeds: seeds.length,
        meanPopulation: sum('agentTicks') / ticks,
        mealsPerTick,
        mealsPerAgentTick: sum('plantMeals') / sum('agentTicks'),
        storedPerMeal: sum('plantEnergy') / sum('plantMeals'),
        plantEnergyPerTick: sum('plantEnergy') / ticks,
        allEnergyPerTick: sum('allEnergy') / ticks,
        allEnergyPer1k: (1000 * sum('allEnergy')) / sum('agentTicks'),
        offeredPerTick: offered,
        ratio: mealsPerTick / offered,
        regrowAtEaten: (config.foodRegrowPerArea * mealsPerTick) / offered,
    };
}
