### 2026-11-11 - Heat levers and the food brake (low-density-edge T13, T13a, E156, E157)

First pass of the heat screen (`evals/screens/low-density-edge-heat.grid.json`: 16 seeds x 200000 ticks, policy live, floor on;
reports and table in `evals/decisions/E156/`, ranked by `scripts/heat-rank.mjs`; every arm passed the constant-thrust purpose guard,
`evals/decisions/E156/heat-guard.txt`; `mate-90` and `mate-95` match defaults exactly in the guard world, which never reaches
85 degrees while mating). `held` is the keep-rule flag (never under 100 after burn-in), `alive` hunters alive at the end:

| arm      | held | vs defaults | alive | heat stress | births/1k |
| -------- | ---- | ----------- | ----- | ----------- | --------- |
| eat-1    | 7    | +4/-3       | 14    | 0.274       | 0.210     |
| defaults | 6    | -           | 13    | 0.419       | 0.169     |
| reach    | 6    | +3/-3       | 13    | 0.424       | 0.187     |
| mate-95  | 4    | +3/-5       | 14    | 0.373       | 0.199     |
| flat     | 4    | +1/-3       | 12    | 0.426       | 0.175     |
| mate-90  | 4    | +1/-3       | 8     | 0.395       | 0.196     |
| cool-10  | 2    | +1/-5       | 16    | 0.002       | 0.280     |
| cool-5   | 1    | +1/-6       | 15    | 0.006       | 0.288     |
| cool-2   | 1    | +0/-5       | 14    | 0.022       | 0.268     |

- **Reading.** The cooling arms remove heat stress and lift births 59 to 70 percent, but hold fewer seeds: more births with no
  brake make bigger booms and deeper crashes, which agrees with the E155 diagnosis of no restoring force. `eat-1` is the leading
  heat arm under the plan's rule (held 7, alive 14, heat stress 0.274). The first-pass `held` counts are 16-seed reads with wide
  intervals, not verdicts.
- **Food brake (E157, `evals/screens/low-density-edge-heat-food.grid.json`, 16 seeds).** The four combined arms (`eat-1` and
  `cool-5`, each with `foodRegrowPerArea` 0.016 and 0.024) hold 0 or 1 seed against defaults' 6, so E-LD-2b is falsified on `held`.
- **`held` against crash depth.** `held` penalises a world that settles smaller; the food brake does that (population mean 234
  defaults, 194 `eat-1-food-24`, 135 `cool-5-food-16`, 114 `eat-1-food-16`, 156 `cool-5-food-24`). Depth reads differently:

| arm            | median lowest population after burn-in | seeds under 40 | `eval.floor_episodes` |
| -------------- | -------------------------------------- | -------------- | --------------------- |
| defaults       | 22                                     | 9              | 1.75                  |
| eat-1-food-24  | 42                                     | 8              | 1.13                  |
| cool-5-food-16 | 28                                     | 12             | 2.19                  |
| eat-1-food-16  | 9                                      | 13             | 2.31                  |
| cool-5-food-24 | 10                                     | 11             | 2.31                  |

`eat-1-food-24` is steadier but lower; the others crash as deep or deeper than defaults. The 64-seed pass reads crash depth
beside `held`.
