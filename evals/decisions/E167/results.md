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

## Results

`eval:compare evals/decisions/E166/screen/defaults.report.json evals/decisions/E167/head.report.json --keep-rule
--allow-config-diff temperatureCoolingExcess,temperatureMatingMax,mateChanceScale,seasons`.

| Done criterion                                                         | Bar                                     | Read                                                     | Met |
| ---------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- | --- |
| `held` guard                                                           | `better`                                | no harm, 11 seeds harmed vs 9 recovered (p 0.82)         | no  |
| `alive` guard                                                          | not worse                               | no harm, 17 vs 14 (p 0.72)                               | yes |
| `eval.edge_birth_death_ratio`                                          | higher                                  | null in a seed (1.058 to 1.030 on the means); no verdict | no  |
| `eval.lineages_alive`, `eval.spec_effective`, `eval.chase_catch_share` | not worse                               | no-difference, no-difference, +2.5% (watch)              | yes |
| `eval.births_per_1k`                                                   | better, or not worse with `held` better | no-difference (-2.8%)                                    | no  |
| `eval.mating_share`                                                    | reported                                | 0.657 to 0.636 (-3.3%, interval crosses 0)               | -   |
| `bench.step_ms@500`                                                    | within `bench-check`                    | 1.875 to 1.892 ms (T20)                                  | yes |

`under80` and `eval.hunter_catches_per_1k` read no harm. `eval.toxic_avoidance` falls 3% (interval below 0);
`eval.diversity` and the population mean read no difference.

**E-LD-3 holds:** hunters are alive at the last tick on 13 of 13 held seeds (main: 15 of 15), and
`eval.chase_catch_share` is not worse.

**Verdict.** The switch does no harm on fresh seeds (prediction holds), and `held` does not read `better`, so by the
plan Phase 5 opens on top of the switch. Each of `flat` and `reach` leaned better alone (E166); together, with the mate
chance's random draw gone, the point estimates lean slightly worse and `eval.mating_share` does not rise.
