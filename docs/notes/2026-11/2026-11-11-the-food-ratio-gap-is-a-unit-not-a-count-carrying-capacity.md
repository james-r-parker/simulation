### 2026-11-11 - The food-ratio gap is a unit, not a count (carrying-capacity T8, E152)

`eval.food_energy_per_1k` is stored energy from every meal, plant and carcass, per 1000 agent-ticks. 539 at a mean of 212
agents is 114 energy per tick; reading that as items at `foodEnergy` 100 gave the 1.14 per tick that disagreed with the
probe's 1.59. `npm run food:ratio` (`scripts/food-ratio.mjs`) counts exactly: `floraMeals[0]`, the sum of `floraIntake` and
the sum of `foodEatenBySpec`. On 8 seeds of 200000 ticks (`evals/decisions/E152/food-ratio-8x200000.json`): 1.587 meals
per tick, 62.3 stored per meal, 98.8 plant and 16.8 carcass energy per tick, 115.6 in all (548.9 per 1000). The eaten rate is
0.178 of the offered 8.92 items per tick, and the `foodRegrowPerArea` whose supply equals it is 0.0160. Use energy per
tick, never items times `foodEnergy`, to compare a food arm with the metric.
