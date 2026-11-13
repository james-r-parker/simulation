# E165 - low-density-edge second pass on the eat-choice world (T14)

**Prediction (recorded before the run).** `E-LD-2`: on the eat-choice world (season 7 defaults), seeds 1 to 64 at 200000
ticks, floor on, policy live, a heat arm alone (`eat-1`, `temperatureGainEat` 1.0) or with the food brake
(`eat-1-food-24`, also `foodRegrowPerArea` 0.024) reads `held` `better` against `defaults` with the `alive` guard not
worse, and raises `eval.edge_birth_death_ratio`. `E-LD-2b`: `eat-1-food-24` reads `held` `better` than `eat-1`. Falsified
when no arm reads `held` `better` with `alive` not worse (E-LD-2), or the combined arm's `held` is not better than the heat
arm's (E-LD-2b). `flat` and `reach` (T11b replayed onto main) are read for no guard worse. Expected risk: the eat choice
already halved heat stress (E162, 0.40 to 0.19), so the heat lever has less to remove than in E156.

**Readings beside the guards:** the median lowest population after burn-in and `eval.floor_episodes` (sim-notes
2026-11-11), and `eval.diversity`, `eval.lineages_alive` and `eval.toxic_avoidance` (eat-choice.md T25).

**Purpose guard** (`node scripts/heat-guard.mjs --grid evals/screens/low-density-edge-t14.grid.json`): `eat-1` passes
(seed 1: `thrust0` 0, `thrust100` 53, `thrust20` 164 of 100). `eat-1-food-24` is guarded on its heat key alone: the
guard runs on a scarce-food world (`foodRegrowPerArea` 0.003) and the arm's food key overrides it eightfold, so the
rusher survives there (447); the food brake is not a heat lever, and the heat key is `eat-1`'s.

**Runs:** `npm run screen -- --grid evals/screens/low-density-edge-t14.grid.json` (`defaults`, `eat-1`, `eat-1-food-24`,
`flat`) and `npm run eval -- --seeds 64 --ticks 200000 --policy live` at the `reach` commit (`exp/ld-reach-t14`).

## Results

Seeds 1 to 64, 200000 ticks, floor on, policy live. Keep rule against `defaults` (`eval:compare --keep-rule
--allow-config-diff <the arm's keys>`); crash depth from `node scripts/capacity-traces.mjs`.

| Arm             | `held` (harmed vs recovered) | `alive`         | `under80`       | Smallest loss seen (alive / held) | Median lowest pop | Pop mean | `heat_stress_share` | `lineages_alive` |
| --------------- | ---------------------------- | --------------- | --------------- | --------------------------------- | ----------------- | -------- | ------------------- | ---------------- |
| `defaults`      | -                            | -               | -               | -                                 | 9                 | 234      | 0.165               | 4.56             |
| `eat-1`         | no harm (7 vs 12)            | no harm (14/14) | no harm (12/15) | 28 / 25 seeds                     | 43                | 272      | 0.086 (-48%)        | 4.41             |
| `eat-1-food-24` | no harm (10 vs 5)            | no harm (10/12) | no harm (17/13) | 25 / 15 seeds                     | 8.5               | 184      | 0.073 (-56%)        | 3.99 (worse)     |
| `flat`          | no harm (5 vs 6)             | no harm (7/10)  | no harm (11/8)  | 23 / 17 seeds                     | 22.5              | 259      | 0.169               | 4.32             |
| `reach`         | no harm (5 vs 6)             | no harm (12/14) | no harm (11/10) | 28 / 17 seeds                     | 44.5              | 273      | 0.178               | 4.19 (worse)     |

`eat-1-food-24` against `eat-1`: `held` worse (15 harmed vs 5 recovered, exact p 0.041), population mean -32%,
`lineages_alive` worse. `eval.diversity` is no-difference on every arm; `eval.toxic_avoidance` rises under `eat-1`
(+4.7%, interval above 0). `eval.edge_birth_death_ratio` is null in a seed on every arm and gives no verdict.

**Verdict.** `E-LD-2` is falsified: no arm reads `held` `better`. `E-LD-2b` is falsified: the food brake reads `held`
worse than `eat-1` alone. There is no lever finalist. `flat` and `reach` read no guard worse, but at 64 seeds their
guards see a loss only of 17 to 28 seeds, more than a quarter, so no harm is not yet shown; they are re-read on seeds 65
to 128 before Phase 4 lands them. `eat-1` and `reach` each lift the median lowest population from 9 to 43 and 44.5
without moving `held`: the crashes get shallower, not rarer.
