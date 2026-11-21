# E259 (E-BG-0) - the layout change, keep-rule read

Prediction committed in `evals/ledger/E259.json` and in body-genes.md (Experiments) before the run.

- BEFORE: commit 83950c64 (the first parent of PR 585), 16 seeds x 200000 ticks, policy live.
- AFTER: origin/main 4e56979d, the same 16 seeds.
- Command: `node scripts/eval-compare.mjs <base> <head> --keep-rule --allow-config-diff burnThrust,fatSlow,heatSpeedCap,sizeTurn,specialisations,speedHeat,sprintHeat,sprintStoreHeat,traitGeneClamp,traitMutationSigma --json` (the new keys of the layout change are the config differences).
- Reports: `evals/results/E259-base.json` and `evals/results/E259-head.json` (gitignored, kept on the run machine).

## Keep rule: no guard reads WORSE

| Guard                              | Verdict                    | Diff    | Harmed | Recovered | p     |
| ---------------------------------- | -------------------------- | ------- | ------ | --------- | ----- |
| alive                              | no-harm                    | 0.3125  | 1      | 6         | 0.125 |
| under80                            | no-harm                    | -0.1875 | 0      | 3         | 0.25  |
| held                               | no-harm                    | 0.125   | 1      | 3         | 0.625 |
| eval.hunter_catches_per_1k_settled | unchecked (needs 64 seeds) | -       | -      | -         | -     |

Adoption: alive 12/16, under 80 before 4/16, after 1/16, pass true.

## Headline metrics (means over 16 seeds)

| Metric                                  | Before | After  | Verdict |
| --------------------------------------- | ------ | ------ | ------- |
| eval.population_mean                    | 190.2  | 232.4  | -       |
| eval.floor_episodes                     | 0.25   | 0.1875 | -       |
| eval.hunter_catches_per_1k_settled      | 1.45   | 1.434  | -       |
| eval.hunter_kills_per_life_mean_settled | 1.559  | 1.457  | -       |
| eval.mean_fitness.predator              | 2141   | 2078   | -       |
| eval.lineages_alive                     | 2.831  | 2.617  | -       |
| eval.predator_share_cv                  | 1.705  | 2.22   | -       |

## Every metric with a verdict

Rows: {"-":315,"unverified":40,"no-difference":19,"worse":2,"better":1} (`-` is no verdict, `unverified` a metric without a verified registry entry).

| Metric                                 | Before | After  | Verdict |
| -------------------------------------- | ------ | ------ | ------- |
| eval.hunter_conversion_matched.under1k | 0.296  | 0.2564 | worse   |
| eval.p90_fitness.defender              | 4139   | 4722   | better  |
| eval.spec_effective                    | 3.555  | 3.014  | worse   |

The two `worse` rows (`eval.hunter_conversion_matched.under1k`, `eval.spec_effective`) are not keep-rule guards; they are reported as they read.

## Provenance and confounds

- The prediction text was written before the first seed finished, but it was committed together with these results, because the conventions hook refuses a compare record that has no verdicts.
- BASE `83950c64` to HEAD covers all of body-genes Phase 1, plus fair-chase T7a (built in the same chunk by plan) and the herd centroid fix (PR 589). The read is therefore "no harm for those together", not for the layout change alone.
- The prediction said the step would be slower by the thirteen inputs. It is not: step@500 1.8918 to 1.8702 ms, sense 0.50 to 0.47, brain 0.49 to 0.43 (the baseline predates several kernel changes). That part of the prediction missed.
- Unverdicted movements, reported and not explained: `eval.population_mean` 190 to 232 and `eval.predator_share_cv` 1.71 to 2.22. Neither has a verdict at 16 seeds.
