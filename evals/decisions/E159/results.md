# E159 - E-EC-1 results: the eat-choice first pass

16 seeds x 400000 ticks, floor on, policy live. Grid `evals/screens/eat-choice.grid.json`; reference `bite` (G1 and G3).
`main-defaults.report.json` is the defaults on origin/main 4faea422, the same seeds and ticks. Means over seeds; lowest
population is the 8-agent floor on every arm, so floor episodes stand for crash depth.

| arm                     | lowest pop p50 | floor eps | floor birth share | food-contact bite | full-contact bite | fat speed ratio | bite idle | pop mean |
| ----------------------- | -------------- | --------- | ----------------- | ----------------- | ----------------- | --------------- | --------- | -------- |
| E159-main-defaults-400k | 8.00           | 5.19      | 0.03              | 0.48              | 0.50              | 1.33            | 0.73      | 198      |
| bite                    | 8.00           | 8.81      | 0.06              | 0.20              | 0.29              | 1.29            | 0.66      | 98       |
| bite-graze-5            | 8.00           | 5.69      | 0.05              | 0.15              | 0.19              | 1.21            | 0.70      | 136      |
| bite-graze-3            | 8.00           | 7.94      | 0.08              | 0.14              | 0.23              | 1.19            | 0.68      | 105      |
| bite-fat-3              | 8.00           | 9.31      | 0.08              | 0.11              | 0.18              | 1.18            | 0.63      | 87       |
| bite-fat-5              | 8.00           | 9.75      | 0.07              | 0.15              | 0.21              | 1.00            | 0.73      | 113      |
| bite-strike-2           | 8.00           | 4.69      | 0.03              | 0.18              | 0.27              | 1.28            | 0.65      | 208      |
| bite-strike-5           | 8.00           | 5.44      | 0.04              | 0.18              | 0.27              | 1.32            | 0.59      | 175      |
| bite-grazemiss-1        | 8.00           | 44        | 0.46              | 0.10              | 0.14              | 1.22            | 0.50      | 22       |

Keep-rule guards and screen columns (held = seeds with population above the minimum; alive = seeds with hunters alive):

| Arm              | held | alive | floor eps | ranked | note                                                                                                                                       |
| ---------------- | ---- | ----- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| main defaults    | 4/16 | 13/16 | 5.19      | -      | the parent of G1                                                                                                                           |
| bite             | 1/16 | 13/16 | 8.81      | ref    | vs main: no guard worse at 16 seeds (held 3 harmed, 0 recovered, p 0.25); population mean 198 to 98, median lifespan -10%, diversity worse |
| bite-strike-2    | 8/16 | 10/16 | 4.69      | 1      | held +7 vs bite (p 0.039); population mean 208; hunter catches 0.18 to 0.49 per 1k, hunter median life 3399 to 1294                        |
| bite-graze-5     | 3/16 | 15/16 | 5.69      | 2      | leading graze arm                                                                                                                          |
| bite-graze-3     | 3/16 | 12/16 | 7.94      | 3      | food_contact_bite_share 0.136 vs 0.204, interval excludes 0                                                                                |
| bite-fat-5       | 2/16 | 12/16 | 9.75      | 4      | leading fat arm; fat_speed_ratio 1.29 to 1.00                                                                                              |
| bite-fat-3       | 2/16 | 11/16 | 9.31      | 5      |                                                                                                                                            |
| bite-strike-5    | 8/16 | 0/16  | 5.44      | no     | hunters die out on every seed: keep rule WORSE on alive                                                                                    |
| bite-grazemiss-1 | 0/16 | 14/16 | 44        | no     | over twice the floor episodes; population mean 22, mating fails: G4b at 1 is falsified                                                     |

Reading:

- E-EC-1 holds in direction at 16 seeds: `eval.food_contact_bite_share` falls below `bite`'s on both graze arms (0.145 at
  0.5, 0.136 at 0.3; the 0.3 interval excludes 0), with no guard worse. The 64-seed pass decides it.
- G1 costs: on its own it halves the population and adds floor episodes. Every graze, fat and strike-2 arm lifts the mean
  back, strike-2 the most. A strike that costs moves hunters onto fewer, better attacks, which leaves more foragers.
- Second pass (E160, seeds 1 to 64): `bite` (sense-edible), `bite-graze-5`, `bite-fat-5`, `bite-graze-fat` (0.5 and
  0.5, the leading values), `bite-strike-2`, each read against main's defaults on the same seeds.
