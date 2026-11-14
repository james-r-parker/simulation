# E170 - the grazeThrust 0.75 switch on fresh seeds (eat-choice T26)

**Prediction (recorded while the head run starts, before any result).** On seeds 65 to 128 at 200000 ticks, the switch
(`grazeThrust` 0.75, season 9) against `main` (`evals/decisions/E167/head.report.json`: the season 8 defaults, the sim
unchanged since) reads no keep-rule guard `WORSE`, and `eval.deliberate_food_share` `better`. `held` is expected to lean
better, as in E169. Falsified when a guard reads `WORSE` or the deliberate share is not better.

**Run:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000 --policy live --out evals/decisions/E170/head.report.json`,
then `npm run eval:compare -- evals/decisions/E167/head.report.json evals/decisions/E170/head.report.json --keep-rule
--allow-config-diff grazeThrust`.

## Results (seeds 65 to 128, 200000 ticks)

| Reading                              | `main` (season 8) | Switch (`grazeThrust` 0.75) | Verdict                              |
| ------------------------------------ | ----------------- | --------------------------- | ------------------------------------ |
| `eval.deliberate_food_share`         | 0.355             | 0.418                       | better (+18%)                        |
| `eval.food_energy_per_1k`            | 382               | 422                         | better (+11%)                        |
| `eval.births_per_1k`                 | 0.169             | 0.181                       | better (+7%)                         |
| `eval.lineages_alive`                | 4.21              | 4.77                        | better (+13%)                        |
| `eval.escape_share`                  | 0.549             | 0.585                       | better (+6%)                         |
| `eval.patch_leave_depleted`          | 0.356             | 0.401                       | better                               |
| `eval.median_lifespan`               | 3817              | 3598                        | worse (-6%)                          |
| `eval.hunter_median_lifespan`        | 2205              | 2577                        | +17%                                 |
| keep rule `alive` (harmed/recovered) | -                 | 7 / 11                      | no harm                              |
| keep rule `held`                     | -                 | 9 / 14                      | no harm                              |
| keep rule `under80`                  | -                 | 8 / 12                      | no harm                              |
| `eval.hunter_catches_per_1k`         | 0.390             | 0.330                       | **worse** (-15.5%, [-0.092, -0.026]) |
| keep rule                            | -                 |                             | **WORSE**                            |

**Verdict: the prediction is falsified.** The forager gains replicate on fresh seeds (deliberate share +18%, food,
births and lineages better), but the verified guard `eval.hunter_catches_per_1k` reads `WORSE`: hunters make 15.5%
fewer kills per hunter-tick. Prey that keep more of their speed while grazing escape more often (`eval.escape_share`
+6%), so the gain to foragers is paid by hunters. On seeds 1 to 64 at 400000 ticks (E169) the same value read no harm
on catches (-2.5%), so the cost may shrink as hunters adapt, but the keep rule reads `WORSE` here and the switch does not
land. `grazeThrust` stays 0.5 and season 8 stays; the built switch (default, goldens, season 9) is kept on the branch
`feat/graze-thrust-075`. Next: a value between 0.5 and 0.75 that keeps part of the forager gain without the hunter cost
(a screen of 0.6 and 0.65), recorded as its own experiment before it runs.
