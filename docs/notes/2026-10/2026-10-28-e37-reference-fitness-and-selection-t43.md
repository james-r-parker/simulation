### 2026-10-28 - E37 reference (fitness-and-selection T43)

`E37` is `map-elites-v1q` on seeds 1-32, 200000 ticks, main 8036aba, merit off, run with `node scripts/eval.mjs --seeds 32 --ticks 200000 --policy map-elites-v1q --workers 30 --out evals/experiments/E37-ref.json` (30 workers shared the machine with a screen, so about 15 minutes per seed and 35 minutes in all). It is the reference every Phase 4 finalist is compared with. The Phase 3 plan said its metrics would equal `E35`'s on seeds 1-32; they do not, because the defaults moved after `E35` (config hash `700f1d6f0ec3ee94` against `55954e27356e22ed`: the T15d predator package, bite 8 from `E47`, call costs). `eval:compare` refuses that pair, so these are plain means over the same 32 seeds:

| Metric                       | E35 mean (seeds 1-32) | E37 mean (seeds 1-32) | Change |
| ---------------------------- | --------------------- | --------------------- | ------ |
| `eval.deliberate_food_share` | 0.1151                | 0.1144                | -1%    |
| `eval.skill_trend`           | -0.0644               | -0.03317              | +48%   |
| `eval.deliberate_food_trend` | -0.06781              | -0.07237              | -7%    |
| `eval.spec_dominance`        | 0.6921                | 0.7077                | +2%    |
| `eval.spec_effective`        | 2.201                 | 2.187                 | -1%    |
| `eval.mating_share`          | 0.2098                | 0.2075                | -1%    |
| `eval.child_survival`        | 0.9466                | 0.9422                | -0%    |
| `eval.born_share`            | 0.956                 | 0.9466                | -1%    |
| `eval.lineage_lifespan_p50`  | 4922                  | 4933                  | +0%    |
| `eval.lineages_alive`        | 18.67                 | 20.42                 | +9%    |
| `eval.births_per_1k`         | 0.1038                | 0.1079                | +4%    |
| `eval.food_energy_per_1k`    | 482.7                 | 478.6                 | -1%    |
| `eval.fed_median_lifespan`   | 5991                  | 5751                  | -4%    |
| `eval.median_lifespan`       | 5247                  | 4994                  | -5%    |
| `eval.population_mean`       | 400.4                 | 384.3                 | -4%    |
| `eval.floor_episodes`        | 13.34                 | 20.75                 | +56%   |
| `eval.predator_presence`     | 0.3442                | 0.9998                | +190%  |
| `eval.catch_rate`            | 0.00558               | 0.05554               | +895%  |
| `eval.pursuit_kill_share`    | 0.03214               | 0.1048                | +226%  |
| `eval.idle_signals_per_1k`   | 11.76                 | 8.524                 | -28%   |
| `eval.hunt_call_precision`   | 0.003189              | 0.01136               | +256%  |
| `eval.mean_fitness.predator` | 241.7                 | 1055                  | +337%  |
| `eval.mean_fitness.forager`  | 7134                  | 5912                  | -17%   |
| `eval.heat_stress_share`     | 0.4517                | 0.4468                | -1%    |
| `eval.terrain_death_share`   | 0.1905                | 0.196                 | +3%    |
| `eval.predator_births`       | not in E35            | 83.44                 | -      |

- **What did not move** (within about 2%): the skill share, mating, child survival, lineage lifespan, food energy, births, heat and terrain deaths, specialisation. The world's economy is the one `E35` measured.
- **What the predator package moved:** predators are present nearly always (1.00 against 0.34), catch rate is ten times higher, and they breed (83 predator births per seed on average; 14 of 32 seeds reach 30, the bar the Done table sets at 12 of 16 per set).
- **Costs of the package:** `fed_median_lifespan` -4%, `mean_fitness.forager` -17%, and `floor_episodes` +56% (13.3 to 20.8). The last was not predicted; Phase 4's "the world holds" criterion reads it against `E37`, so it is already in the reference.
- **Skill still declines:** `deliberate_food_trend` is -0.072 and `skill_trend` -0.033 (half of E35's -0.064, not predicted). That is the gap Phase 4 has to close.
- **Per-seed predator births are skewed** (mean 83, 14 of 32 seeds at 30 or more); read the done criterion on `seedChecks`, not the mean.
