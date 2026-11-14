# E171 - grazeThrust 0.6 and 0.65 on the seeds where 0.75 cost hunters (eat-choice T28)

**Prediction (recorded before the run).** A smaller easing of the graze slowdown keeps part of E170's forager gain at a
smaller hunter cost. On seeds 65 to 128 at 200000 ticks, against `main` (`evals/decisions/E167/head.report.json`,
`grazeThrust` 0.5), at least one of `grazeThrust` 0.6 and 0.65 reads `eval.deliberate_food_share` `better` and
`npm run eval:compare -- --keep-rule` reads no guard `WORSE`, `eval.hunter_catches_per_1k` included. Falsified when
every arm that lifts the share reads a guard `WORSE`. The arm that passes is then run on seeds 1 to 64 against the
defaults before any switch.

**Runs:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000 --policy live --config
evals/decisions/E171/graze-<value>.json --out evals/decisions/E171/graze-<value>.report.json` for 0.6 and 0.65, each
compared with `--keep-rule --allow-config-diff grazeThrust`.

## Results (seeds 65 to 128, 200000 ticks, against `main`)

| Reading                             | `main` (0.5) | `graze-0.6`         | `graze-0.65`        | `graze-0.75` (E170)  |
| ----------------------------------- | ------------ | ------------------- | ------------------- | -------------------- |
| `eval.deliberate_food_share`        | 0.355        | 0.391 better (+10%) | 0.396 better (+12%) | 0.418 better (+18%)  |
| `eval.food_energy_per_1k`           | 382          | 398                 | 410 better          | 422 better           |
| `eval.escape_share`                 | 0.549        | 0.583 better        | 0.605 better        | 0.585 better         |
| `eval.hunter_catches_per_1k`        | 0.390        | 0.367 (-5.9%)       | 0.365 (-6.4%)       | 0.330 worse (-15.5%) |
| keep rule `held` (harmed/recovered) | -            | 6 / 15 (p 0.078)    | 8 / 10              | 9 / 14               |
| keep rule `alive`                   | -            | 6 / 9               | 9 / 12              | 7 / 11               |
| keep rule `under80`                 | -            | 10 / 11             | 12 / 14             | 8 / 12               |
| keep rule                           | -            | no harm             | no harm             | WORSE                |

**Verdict: the prediction holds.** Both values lift `eval.deliberate_food_share` with no guard `WORSE`; the hunter
catch loss is a third of 0.75's and its interval includes 0 (smallest loss detected 0.032). Ranked by `held`, then
`alive`: `graze-0.6` leads (15 seeds recovered against 6 lost) and costs hunters least. **Next:** `graze-0.6` against
the defaults on seeds 1 to 64 at 200000 ticks (E172) before any switch.
