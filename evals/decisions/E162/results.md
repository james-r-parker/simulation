# E162 - the eat-choice switch, paired check on seeds 65 to 128 (eat-choice T16, T17)

Head of `feat/eat-choice-switch` (graze 0.5, fat 0.5, strike 1, G1, G3) against origin/main 4faea422, seeds 65 to 128
(`--seed-offset 64`), 400000 ticks, floor on, policy live.

| arm       | lowest pop p50 | floor eps | floor birth share | food-contact bite | full-contact bite | fat speed ratio | bite idle | pop mean |
| --------- | -------------- | --------- | ----------------- | ----------------- | ----------------- | --------------- | --------- | -------- |
| E162-main | 8.00           | 5.20      | 0.02              | 0.53              | 0.53              | 1.31            | 0.75      | 173      |
| E162-head | 8.00           | 4.42      | 0.03              | 0.13              | 0.19              | 0.97            | 0.70      | 189      |

Keep rule: **no harm** (alive 13 harmed vs 14 recovered, p 1; under80 8 vs 17, p 0.11; held 2 vs 2; hunter catches +86%).
The hunters-alive caveat from E161 does not replicate.

| Done criterion                 | Bar                 | Result                                                                                                          |
| ------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| alive, held, under80           | not worse           | met (above)                                                                                                     |
| `eval.full_contact_bite_share` | lower than G1 alone | met: 0.199 vs 0.260 on seeds 1 to 64 (E161 vs E160 `bite`), interval [-0.117, -0.009]; 0.19 vs main's 0.53 here |
| `eval.deliberate_food_share`   | not worse           | **missed**: 0.426 to 0.309 (worse)                                                                              |
| `eval.food_energy_per_1k`      | not worse           | **missed**: 530 to 378 (-29%, worse)                                                                            |
| `eval.median_lifespan`         | not worse           | met: no-difference (+3.6%); fed median life +9% (better)                                                        |
| `bench.step_ms@500`            | within budget       | met: 1.875 ms baseline, gate green                                                                              |

Experiments: E-EC-3 holds (`eval.heat_stress_share` 0.403 to 0.187, interval [-0.238, -0.193]). E-EC-4 is falsified at
this size (`eval.bite_idle` -6.4%, interval [-0.102, 0.006]); `eval.chase_catch_share` doubles (0.052 to 0.111).

Costs outside the guards: `eval.diversity` -18% and `eval.lineages_alive` -18% (worse), `eval.births_per_1k` -8% (worse).

Why the two missed bars do not stop the switch:

- `isDeliberate` (js/sim/merit-state.js) counts a meal deliberate only while the eater is closing on the food (6 closing
  ticks in the last 30). A forager that now stops on a patch and holds the bite stops closing, so its later bites count as
  chance. Deliberate energy falls 48% and chance energy 14%: the detector cannot see in-place grazing, which G1b creates.
- Less food eaten is the fat and satiety effect the plan asked for: full foragers stop biting (0.53 to 0.19), the fed
  median life rises 9% and the population mean rises 9%.
- The keep rule reads no harm on two independent 64-seed sets, and the mechanisms are realistic, so they stay
  (principles.md, "A realistic mechanism stays"). Phase 4 fixes the detector and re-reads the bar.
