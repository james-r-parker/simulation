### 2026-11-11 - Metric power read (metric-trust T27, E150)

The corrected E150 reports use the same 128 fixed seeds and 200000 ticks as E149, with the original configurations:
floor on `ff8d890a5a70c14d`, floor off `51c7a6e80234a2b5`. Each report contains all 284 current registry metrics.
Power was measured at 16 and 32 seeds with 1000 false-positive splits and 200 planted-change splits. The floor-on
reference in `evals/power/defaults-floor-on-E150.json` gives 61 metrics `minSeeds: 16`, 34 `minSeeds: 32` and 189
`minSeeds: null`. The floor-off comparison in `evals/power/defaults-floor-off-E150.json` gives 52, 30 and 202,
respectively. Only the floor-on readings are written to `js/evo/metric-registry/power.js`.

For the largest-MDE summary, the decision set is the screen `TARGETS` and `WATCH_METRICS`, `PLATEAU_SERIES` metrics,
and the current hunter-gate inputs `eval.hunter_catches_per_1k`, `eval.predators_at_end` and
`eval.hunter_ticks_last_quarter`. The ten largest floor-on MDEs at 32 seeds are:

| Metric                              | MDE32 |
| ----------------------------------- | ----- |
| `eval.predators_at_end`             | 1.00  |
| `eval.prey_summer_min`              | 1.00  |
| `eval.hunter_chases_by_age.over2k`  | 0.75  |
| `eval.hunter_ticks_last_quarter`    | 0.75  |
| `eval.lineage_effective`            | 0.75  |
| `eval.prey_extinctions`             | 0.75  |
| `eval.hunter_chases_by_age.1k-2k`   | 0.50  |
| `eval.hunter_chases_by_age.under1k` | 0.50  |
| `eval.predator_births`              | 0.50  |
| `eval.predator_share_cv`            | 0.50  |

MDE32 is the relative planted change in `eval:power`, not an observed verdict. Structural-zero metrics remain unverified
when the power bar cannot be measured; they do not become failed metrics or verdicts. `eval.hunter_kills_per_life_p50`
remains outside gates.
