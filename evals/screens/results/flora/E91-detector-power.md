# Flora detector power at current defaults (E91)

E91 ran the live policy for 64 fixed seeds x 200,000 ticks with the current default configuration (`toxinDose: 1.2`, `herdCount: 6`). The raw report contains 177 metrics and is `E91-current-default.report.json`. `E91-detector-power.json` is the `eval:power` output for the 15 Flora metrics below, using 1,000 A/A splits and 200 planted-effect splits at 16-v-16 and 32-v-32. The report SHA256 is `bb4822f0778cb42c0b1229f227527c80e630b183e704e164857e8b7e4ce9e6cd`.

The detectable column is the smallest relative change in the metric mean detected in at least 80% of valid splits. The false-positive column is the share of A/A splits that returned a better or worse verdict. All rows had a 100% valid-split share.

| Metric                                 |     Mean | Seeds nonzero | 16-v-16 false positive / detectable | 32-v-32 false positive / detectable |
| -------------------------------------- | -------: | ------------: | ----------------------------------: | ----------------------------------: |
| `eval.seasonal_diet_shift`             |  0.41279 |         64/64 |                          8.1% / 20% |                          5.8% / 15% |
| `eval.food_species_share.grass`        |  0.66237 |         64/64 |                          8.3% / 15% |                          5.3% / 10% |
| `eval.food_species_share.berry`        |  0.09755 |         64/64 |                        11.7% / 100% |                          6.5% / 75% |
| `eval.food_species_share.nut`          |  0.02231 |         64/64 |                          6.1% / 75% |                          5.6% / 50% |
| `eval.food_species_share.flower`       |  0.17749 |         64/64 |                          8.3% / 75% |                          5.3% / 50% |
| `eval.food_species_share.fungus`       |  0.04017 |         64/64 |                          8.2% / 75% |                          5.2% / 50% |
| `eval.food_species_share.toxiccap`     | 0.000108 |         64/64 |                          8.8% / 75% |                          5.9% / 50% |
| `eval.toxic_death_share`               |  0.01163 |         64/64 |                        10.0% / 100% |                          6.0% / 50% |
| `eval.toxic_avoidance`                 |  0.97363 |         64/64 |                          0.0% / 10% |                          0.0% / 10% |
| `eval.sick_share`                      |  0.00349 |         64/64 |                        8.7% / >100% |                          8.4% / 75% |
| `eval.pollination_rate`                |  0.05551 |         43/64 |                         8.0% / 100% |                          6.0% / 50% |
| `eval.flora_hue_spread`                |  0.00752 |         43/64 |                         7.0% / 100% |                          5.9% / 75% |
| `eval.flora_patch_pool_full_share`     |  0.38602 |         41/64 |                         6.4% / 100% |                          5.8% / 75% |
| `eval.flora_patch_death_rate`          |  0.00617 |         11/64 |                       21.5% / >100% |                       19.7% / >100% |
| `eval.flora_seed_bank_occupancy_share` |  0.01609 |         11/64 |                       23.5% / >100% |                       21.4% / >100% |

The measurements show that seasonal diet shift, grass share, and toxic avoidance are comparatively sensitive; rarer species and pollination/hue signals need large effects to reach 80% power. Patch-death and seed-bank occupancy are sparse and produce elevated A/A false positives, so treat their screen verdicts cautiously. This analysis measures detector sensitivity; it does not turn the E72 pollination or hue thresholds into passes, and does not replace the recorded E72 outcomes. Global predator/family metrics remain balancing diagnostics.

The earlier E76 power analysis is retained separately as historical context only: that Megafauna report used `toxinDose: 0.45` and is not a Flora-default source.
