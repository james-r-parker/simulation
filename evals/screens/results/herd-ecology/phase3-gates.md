# E78 Phase 3 ecology results

Registered grid: `evals/screens/herd-ecology.grid.json`; 11 arms, 16 seeds, 200,000 ticks, live policy. Reports and the screen's generic table/verdicts are in this directory. All arms used the same seed set.

| Arm                        | Dung food share mean (≥0.03 seeds) | Seeded patches/1k mean (positive seeds) | Follow share mean | Grazed share mean | Herd animals mean | Predators at end | Prey types at end | Family effective ≥3 | Food energy/1k |
| -------------------------- | ---------------------------------: | --------------------------------------: | ----------------: | ----------------: | ----------------: | ---------------: | ----------------: | ------------------: | -------------: |
| `phase3-defaults`          |                     0.1231 (16/16) |                          0.0118 (12/16) |             2.098 |            0.4485 |              44.8 |             2/16 |             16/16 |                5/16 |          371.5 |
| `herdDungTicks-450`        |                     0.1121 (16/16) |                          0.0178 (11/16) |             2.830 |            0.4811 |              44.5 |             3/16 |             16/16 |                2/16 |          366.9 |
| `herdDungTicks-1800`       |                     0.1304 (16/16) |                           0.0135 (9/16) |             4.193 |            0.4326 |              44.8 |             0/16 |             16/16 |                2/16 |          381.0 |
| `herdDungSize-40`          |                     0.1231 (16/16) |                          0.0118 (12/16) |             2.098 |            0.4485 |              44.8 |             2/16 |             16/16 |                5/16 |          371.5 |
| `herdDungSize-100`         |                     0.1227 (16/16) |                          0.0148 (11/16) |             2.048 |            0.4450 |              44.9 |             2/16 |             16/16 |                2/16 |          374.5 |
| `herdDungZoneMax-15`       |                     0.1162 (16/16) |                          0.0151 (11/16) |             2.128 |            0.4637 |              44.6 |             0/16 |             16/16 |                5/16 |          370.2 |
| `herdDungZoneMax-45`       |                     0.1241 (16/16) |                          0.0135 (10/16) |             2.568 |            0.4412 |              44.6 |             1/16 |             16/16 |                3/16 |          358.9 |
| `herdSeedChance-0p25`      |                     0.1228 (16/16) |                          0.0095 (10/16) |             2.137 |            0.4474 |              44.7 |             4/16 |             16/16 |                4/16 |          375.7 |
| `herdSeedChance-1`         |                     0.1283 (16/16) |                          0.0141 (11/16) |             2.115 |            0.4594 |              44.5 |             1/16 |             16/16 |                2/16 |          368.2 |
| `herdSeedMinDistance-400`  |                     0.1236 (16/16) |                          0.0099 (12/16) |             3.844 |            0.4329 |              44.9 |             3/16 |             16/16 |                1/16 |          387.8 |
| `herdSeedMinDistance-1600` |                     0.1211 (16/16) |                          0.0099 (10/16) |             1.990 |            0.4530 |              44.7 |             2/16 |             16/16 |                6/16 |          364.9 |

## Gate reading

- `eval.dung_food_share` clears its 0.03 threshold in all arms, with every seed positive.
- `eval.herd_seeded_patches` misses the 0.1-per-1000 rate in every seed of every arm. The highest mean is `herdDungTicks-450` at 0.0178; positive-seed counts range from 9/16 to 12/16, but none reaches the rate threshold.
- `eval.herd_grazed_share` exceeds its 0.25 ceiling in all arms (means 0.4326 to 0.4811).
- `eval.herd_follow_share` is a watch metric; means range 1.990 to 4.193. `herdDungTicks-1800` has the highest mean, but its population/family diagnostics are lower than the reference.
- The generic population gate fails in all 11 arms (0/16). Prey are present on 16/16 seeds; predators are present on 0–4/16 and `eval.basin_lineage_effective >= 3` on 1–6/16. Those are balancing diagnostics, not adoption blockers under user direction and are not claimed as passes.

At this sample size, `eval:power` cannot run: its smallest valid comparison needs 32 seeds for a 16-v-16 split. Before running an extension, a matched 32-seed grid was preregistered at `evals/screens/herd-ecology-power.grid.json` to confirm `herdDungTicks: 1800` against the reference and measure power for all three new metrics on the reference report. No E78 arm is adopted in these results.
