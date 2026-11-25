### 2026-10-23 - E35 calibration baseline (fitness-and-selection T12)

E35 is the calibration run for the new metrics: the live policy `map-elites-v1q` at the current defaults, 64 seeds x 200000 ticks, main at 808d648 (report [E35-calibration.json](../../../evals/experiments/E35-calibration.json), entry E35 in `evals/experiments.json`). Every figure below is over the 64 seeds, except the power columns, which are `eval:power` at 16 seeds per arm (1000 A/A splits and 200 power splits per grid step, from the report's own seeds). "Detectable" is the smallest planted relative increase of the mean that the verdict finds in at least 80% of splits. A metric's power is computed as if its direction were `higher`, because `eval:power` skips `watch` metrics (the new metrics are `watch` until T13): the false-positive rate counts `better` or `worse` verdicts, so it does not depend on that choice. `-` means no verdict at 16 seeds (below the metric's seed minimum, or a constant or null series).

| Metric (`eval.` prefix) | Mean   | Per-seed sd | Non-null n | False positive (16 v 16) | Detectable at 80% (16 v 16) |
| ----------------------- | ------ | ----------- | ---------- | ------------------------ | --------------------------- |
| `skill_trend`           | -0.070 | 0.026       | 64         | 10.2%                    | 50%                         |
| `deliberate_food_trend` | -0.071 | 0.024       | 64         | 8.0%                     | 50%                         |
| `pursuit_trend`         | 0.250  | 0.000       | 1          | -                        | -                           |
| `evasion_trend`         | -0.071 | 0.101       | 2          | -                        | -                           |
| `spec_dominance`        | 0.687  | 0.172       | 64         | 5.7%                     | 30%                         |
| `spec_effective`        | 2.264  | 0.620       | 64         | 7.6%                     | 30%                         |
| `lineage_dominance`     | 0.482  | 0.158       | 64         | 9.8%                     | 50%                         |
| `lineage_effective`     | 8.233  | 17.353      | 64         | 24.9%                    | -                           |
| `trait_spread`          | 0.088  | 0.010       | 64         | 7.6%                     | 15%                         |
| `body_plan_coverage`    | 0.903  | 0.057       | 64         | 2.9%                     | 10%                         |
| `sex_balance`           | 0.033  | 0.011       | 64         | 8.3%                     | 50%                         |
| `cold_stress_share`     | 0.055  | 0.012       | 64         | 8.8%                     | 30%                         |
| `heat_stress_share`     | 0.442  | 0.068       | 64         | 11.6%                    | 20%                         |
| `terrain_death_share`   | 0.194  | 0.031       | 64         | 7.9%                     | 20%                         |
| `winter_pop_ratio`      | 1.145  | 0.333       | 64         | 11.8%                    | 30%                         |
| `child_survival`        | 0.944  | 0.009       | 64         | 0.0%                     | 10%                         |
| `lineage_lifespan_p50`  | 4879.6 | 424.7       | 64         | 5.4%                     | 10%                         |
| `migration_index`       | 0.068  | 0.010       | 64         | 8.1%                     | 20%                         |
| `predator_presence`     | 0.343  | 0.109       | 64         | 8.9%                     | 50%                         |
| `pred_prey_lag_corr`    | -      | -           | 0          | -                        | -                           |
| `deliberate_food_share` | 0.115  | 0.015       | 64         | 8.8%                     | 15%                         |
| `born_share`            | 0.953  | 0.020       | 64         | 0.0%                     | 10%                         |
| `mating_share`          | 0.211  | 0.057       | 64         | 8.7%                     | 30%                         |
| `catch_rate`            | 0.006  | 0.007       | 64         | 12.2%                    | >100%                       |
| `births_per_1k`         | 0.108  | 0.026       | 64         | 16.9%                    | 50%                         |
| `food_energy_per_1k`    | 480.5  | 57.7        | 64         | 8.9%                     | 15%                         |
| `fed_median_lifespan`   | 5758.2 | 956.5       | 64         | 8.4%                     | 20%                         |
| `lineages_alive`        | 18.622 | 1.981       | 64         | -                        | - (seed minimum 32)         |

What stands out:

- The live policy's shares are `deliberate_food_share` 0.115, `born_share` 0.953 and `mating_share` 0.211 (sd 0.057).
- Both trends are negative, not flat: `skill_trend` -0.070 and `deliberate_food_trend` -0.071, each non-null on all 64 seeds with a per-seed sd near 0.025. `pursuit_trend` is non-null on 1 seed and `evasion_trend` on 2.
- `lineage_effective` has a heavy tail (mean 8.2, sd 17.4) and a false-positive rate of 24.9% at 16 seeds, with no detectable change in the grid. `spec_dominance` (0.687) and `spec_effective` (2.26) both reach 80% power at a 30% change.
- `child_survival` (0.944, sd 0.009) has no false positives at 16 seeds. `pred_prey_lag_corr` is `null` on all 64 seeds, `pack_convergence` is non-null on 2 seeds (both 0, as no pack kill happens), and `champion_elo` and `champion_win_rate` are `null` on all 64 (E35 ran no league).
- Among the new metrics, `predator_presence` (0.343, sd 0.109) has a 50% detectable change at 16 seeds, the same as the trend, `sex_balance` and `lineage_dominance` rows.
