### 2026-10-24 - E36 predator fix verdict (fitness-and-selection T15e)

- **Prediction (written before the run):** the T15d package (main `de7c9ef`) against the same code with the pre-T15d
  values (`evals/experiments/E36-ref-config.json`), live policy, seeds 1-32, 200000 ticks. Presence rises from about 0.34
  to about 1.0 (rescue floor); catch rate from about 0.005 to 0.05-0.08; predator births rise but the bar of at least 30
  on 12 of 16 seeds is likely missed; idle signals fall from about 11.6 to about 9; population falls (about 436 to about
  360).
- **Verdicts (`eval:compare`, reference to fix; the 32-seed column is the ledger's):**

| Metric                      | Seeds 1-16                  | Seeds 17-32                 | 32 seeds      |
| --------------------------- | --------------------------- | --------------------------- | ------------- |
| `eval.predator_presence`    | 0.338 to 0.999, better      | 0.351 to 1.000, better      | better        |
| `eval.catch_rate`           | 0.006 to 0.107, better      | 0.005 to 0.087, better      | better        |
| `eval.pursuit_kill_share`   | 0.045 to 0.143, -           | 0.016 to 0.153, -           | -             |
| `eval.predator_births` mean | 3.6 to 75.1, better         | 5.2 to 72.8, better         | better        |
| births at least 30 per seed | 10 of 16 (bar of 12 missed) | 11 of 16 (bar of 12 missed) | 21 of 32      |
| `eval.idle_signals_per_1k`  | 11.6 to 9.0, better         | 11.9 to 8.7, better         | better        |
| `eval.hunt_call_precision`  | no-difference               | no-difference               | no-difference |
| `eval.alarm_precision`      | -                           | -                           | -             |
| `eval.food_energy_per_1k`   | 491 to 468, no-difference   | 474 to 456, no-difference   | no-difference |
| `eval.fed_median_lifespan`  | 5802 to 5706, no-difference | 6180 to 5598, worse (-9.4%) | no-difference |
| `eval.lineages_alive`       | 19.0 to 20.1, -             | 18.3 to 19.4, -             | better        |
| `eval.floor_episodes`       | needs 32 seeds              | needs 32 seeds              | no-difference |
| `eval.births_per_1k`        | no-difference               | better (+15.8%)             | no-difference |
| `eval.population_mean`      | 379 to 373, -               | 422 to 368, -               | -             |
| `eval.mating_share`         | 0.203 to 0.218, -           | 0.217 to 0.216, -           | -             |

- Predators are present on every seed (presence at least 0.995 on all 32), hunt deliberately (`eval.pursuit_kill_share`
  0.14 and 0.15, from 0.05 and 0.02), and breed: predator births average 74 per seed against 4 to 5, with a
  per-seed range of 8 to 284.
- The births bar is missed: at least 30 predator births on 10 of 16 seeds (seeds 1-16) and 11 of 16 (seeds 17-32), against
  12 of 16 in the criterion. The births are skewed: the per-seed median is 66.5 (seeds 1-16) and 47.5 (seeds 17-32), below the means of 75 and 73.
- The fix cuts calls: `eval.idle_signals_per_1k` falls 22% and 27% (better on both sets). Hunt-call precision is not worse;
  alarm precision has no verdict at 16 seeds.
- The world holds except one seed set: `eval.fed_median_lifespan` is worse on seeds 17-32 (-9.4%) and no-difference on
  seeds 1-16 and on 32 seeds (-5.7%). Food is no-difference on both sets. Population falls 2% on seeds 1-16 and 13% on
  seeds 17-32 (no verdict), so the prediction's drop was real but larger on the second set.
