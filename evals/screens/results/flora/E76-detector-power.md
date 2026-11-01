# Historical Flora detector power diagnostic (E76)

`E76-detector-power.json` is the output of `npm run eval:power` on the existing 64-seed report
`evals/screens/results/herds/E76-power-64.report.json` (200,000 ticks, live policy, 1,000 A/A splits and 200 power splits).
It is diagnostic only: the report is a Megafauna world (`herdCount: 6`) with the pre-promotion `toxinDose: 0.45`, not the current Flora default. Do not cite it as current Flora-default power validation.

The report supports the T7, T16 and hue-spread metrics at 16-v-16 and 32-v-32. The values below give the smallest planted relative change detected in at least 80% of valid splits; false-positive rates are on A/A splits.

| Metric                             | 16 seeds per arm: false positive / detectable | 32 seeds per arm: false positive / detectable |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `eval.seasonal_diet_shift`         | 8.7% / 20%                                    | 5.7% / 15%                                    |
| `eval.food_species_share.grass`    | 7.1% / 20%                                    | 5.5% / 15%                                    |
| `eval.food_species_share.berry`    | 11.8% / 100%                                  | 7.3% / 75%                                    |
| `eval.food_species_share.nut`      | 7.8% / 75%                                    | 4.9% / 50%                                    |
| `eval.food_species_share.flower`   | 7.5% / 75%                                    | 4.7% / 75%                                    |
| `eval.food_species_share.fungus`   | 7.0% / 75%                                    | 5.8% / 50%                                    |
| `eval.food_species_share.toxiccap` | 12.5% / 100%                                  | 9.6% / 75%                                    |
| `eval.toxic_death_share`           | mean is zero; no detectable change            | mean is zero; no detectable change            |
| `eval.toxic_avoidance`             | 10.1% / 15%                                   | 2.5% / 10%                                    |
| `eval.sick_share`                  | 12.9% / >100% (not reached)                   | 11.4% / 75%                                   |
| `eval.flora_hue_spread`            | 7.4% / 100%                                   | 5.2% / 75%                                    |

This source report does not contain `eval.pollination_rate`, `eval.flora_patch_pool_full_share`, `eval.flora_patch_death_rate` or `eval.flora_seed_bank_occupancy_share`. The E72 reports have only eight seeds; the E73/E74 Flora reports have sixteen. Those reports cannot satisfy the power tool's minimum 32-v-32 split. A separate current-default 64-seed Flora report is needed for T24's remaining metrics and for Flora-default power conclusions.
