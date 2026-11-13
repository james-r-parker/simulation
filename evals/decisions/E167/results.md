# E167 - the low-density-edge switch on seeds 65 to 128 (low-density-edge T21, T22)

**Prediction (recorded before the run).** The switch (L1 `reach`, L4 `flat`, the unused heat keys deleted; no lever
finalist), seeds 65 to 128 at 200000 ticks, floor on, policy live, against `origin/main` (`evals/decisions/E166/screen/defaults.report.json`,
the same seeds and config; the sim on `main` is unchanged since): no keep-rule guard reads worse; `held` is not expected to
read `better` (no arm did in E165 or E166), in which case the plan opens Phase 5 on top of the switch. `E-LD-3`: hunters are
alive at the last tick on 0.9 or more of held seeds, with `eval.chase_catch_share` not worse. `eval.births_per_1k`,
`eval.mating_share` and `eval.edge_birth_death_ratio` are read; `eval.lineages_alive`, `eval.spec_effective` and
`eval.chase_catch_share` must not read worse. Falsified when a guard reads worse, or E-LD-3's falsifier holds.

**Run:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000 --policy live --out evals/decisions/E167/head.report.json`
at `feat/low-density-edge-switch` (season 8, rulesHash `ca640c7579b94d0d`).
