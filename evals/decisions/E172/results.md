# E172 - grazeThrust 0.6 on seeds 1 to 64 (eat-choice T28)

**Prediction (recorded before the run).** On seeds 1 to 64 at 200000 ticks, `grazeThrust` 0.6 against the defaults
(0.5) reads `eval.deliberate_food_share` `better` and no keep-rule guard `WORSE`, `eval.hunter_catches_per_1k` included,
as on seeds 65 to 128 (E171). Falsified when the share is not better or a guard reads `WORSE`. When it holds, 0.6
becomes the default (season 9).

**Run:** `npm run screen -- --grid evals/decisions/E172/screen.grid.json --out evals/decisions/E172/screen`, then
`graze-0.6` against `graze-0.5` with `--keep-rule --allow-config-diff grazeThrust`.

## Results (seeds 1 to 64, 200000 ticks)

| Reading                             | `graze-0.5` | `graze-0.6`            |
| ----------------------------------- | ----------- | ---------------------- |
| `eval.deliberate_food_share`        | 0.342       | 0.371 better (+8.4%)   |
| `eval.food_energy_per_1k`           | 396         | 428 better (+8%)       |
| `eval.births_per_1k`                | 0.169       | 0.181 better (+7%)     |
| `eval.escape_share`                 | 0.566       | 0.597 (+5%)            |
| `eval.lineages_alive`               | 4.29        | 4.30                   |
| `eval.median_lifespan`              | 3844        | 3588 worse (-7%)       |
| `eval.hunter_catches_per_1k`        | 0.406       | 0.388 (-4.4%), no harm |
| keep rule `held` (harmed/recovered) | -           | 5 / 10                 |
| keep rule `alive`                   | -           | 6 / 9                  |
| keep rule `under80`                 | -           | 16 / 14                |
| keep rule                           | -           | no harm                |

**Verdict: the prediction holds.** On both seed halves `grazeThrust` 0.6 lifts `eval.deliberate_food_share` (+10% on
seeds 65 to 128, +8% on seeds 1 to 64) with no keep-rule guard `WORSE`, and the hunter catch loss stays inside the
interval of no change (-5.9% and -4.4%). Lives are about 7% shorter, the cost of foragers spending food faster.
`grazeThrust` 0.6 becomes the default (season 9).
