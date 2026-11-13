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

Results follow when the runs end.
