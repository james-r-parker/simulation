# E169 - G1b reopened with the graze hold on (eat-choice T26)

**Prediction (recorded before the run).** With the graze hold on (season 8 defaults), a lighter graze slowdown lets a
forager keep closing on the next item while it holds `BITE`, so meals that were taken in place become approaches. An arm
with `grazeThrust` 0.75 or 1 reads `eval.deliberate_food_share` `better` than the defaults (`grazeThrust` 0.5) on seeds
1 to 64 at 400000 ticks, and `npm run eval:compare -- --keep-rule` reads no guard `WORSE`. Falsified when neither arm
lifts `eval.deliberate_food_share`, or the arm that does reads a guard `WORSE`. Watched beside it:
`eval.graze_speed_ratio` (should rise toward 1 with the value), `eval.food_energy_per_1k` and `eval.lineages_alive`.
Risk: the slowdown is what prices holding the bite (G1b), so at 1 foragers may hold `BITE` all the time and eating on
contact returns; `eval.graze_time_share` shows it.

**Run:** `npm run screen -- --grid evals/screens/eat-choice-graze-rescreen.grid.json --out evals/decisions/E169/screen`,
then each arm against `graze-0.5` with `--keep-rule --allow-config-diff grazeThrust`. A value is adopted (a season 9
switch) only on a keep-rule no-harm read that lifts `eval.deliberate_food_share`.

## Results (seeds 1 to 64, 400000 ticks)

Each arm against `graze-0.5` (the defaults) with `npm run eval:compare -- --keep-rule --allow-config-diff grazeThrust`;
crash depth from `node scripts/capacity-traces.mjs`.

| Reading                              | `graze-0.5` | `graze-0.75`             | `graze-1`                |
| ------------------------------------ | ----------- | ------------------------ | ------------------------ |
| `eval.deliberate_food_share`         | 0.336       | 0.399 better (+19%)      | 0.467 better (+39%)      |
| `eval.graze_speed_ratio`             | 0.77        | 0.96                     | 1.08                     |
| `eval.graze_time_share`              | 0.73        | 0.73                     | 0.68                     |
| `eval.food_energy_per_1k`            | 400         | 454 better               | 474 better               |
| `eval.births_per_1k`                 | 0.165       | 0.180 better             | 0.191 better             |
| `eval.lineages_alive`                | 3.42        | 3.12 worse (-8.7%)       | 3.69 no-difference       |
| `eval.spec_effective`                | 3.20        | 3.64 better              | 3.84 better              |
| `eval.median_lifespan`               | 3878        | 3559 worse (-8%)         | 3394 worse (-12%)        |
| keep rule `alive` (harmed/recovered) | -           | 10 / 11, no harm         | 24 / 10, worse (p 0.024) |
| keep rule `held`                     | -           | 2 / 14, better (p 0.004) | 2 / 3                    |
| keep rule `under80`                  | -           | 9 / 13                   | 13 / 6                   |
| `eval.hunter_catches_per_1k`         | 0.390       | 0.381, no harm           | 0.315 worse (-19%)       |
| keep rule                            | -           | no harm                  | WORSE                    |
| Median pop / seeds under 40          | 291 / 53    | 394 / 42                 | 169 / 55                 |
| Hunters alive at end                 | 46/64       | 47/64                    | 32/64                    |

Smallest loss detected by `alive`: 24 seeds (`graze-0.75`), above a quarter of 64.

**Verdict: the prediction holds for `graze-0.75`.** It lifts `eval.deliberate_food_share` from 0.34 to 0.40 with no
keep-rule guard worse, and it is the first arm since the low-density-edge work began to read `held` `better` (14 seeds
recovered against 2 lost): a forager slowed less while it holds the bite moves on to the next item, eats more, breeds
more and the population holds. The costs are shorter lives (food is spent faster) and 9% fewer lineages alive.
`graze-1` removes the price of holding the bite and hunters lose: catches fall 19% and hunters die out on 24 seeds
against 10, so G1b keeps a slowdown. **Next:** the switch to `grazeThrust` 0.75 (season 9), with the paired check on
seeds 65 to 128 against `main`, because the `alive` guard cannot yet see a loss of a quarter of the seeds.
