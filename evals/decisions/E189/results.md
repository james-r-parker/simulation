# E189 - recruitment levers without `specFlipNoHunt` (honest-budgets Phase 6, T39)

**Detector check (step 0).** The metrics are the E179 set, read as E179 read them: `eval.hunter_juvenile_death_share`
(a share of hunter-born juveniles that die before maturity), `eval.hunter_catches_per_1k` (a speed, so it rises with prey
density, never read alone), `eval.hunter_income_share.carcass`, and the recruit and carcass-loss detectors, which are
context at 16 seeds except the matured and lineage shares. The shared baseline is `evals/power/defaults-floor-on-E188.json`
(128 seeds, 200000 ticks, `baseline:status` current at 390acd9a, `rulesHash` 38be2908ad820c86).

**Baseline (E188, floor on, 128 seeds, 200000 ticks; the screen runs 400000 ticks, so these are context, the control arm is
the bar).** `eval.hunter_juvenile_death_share` 0.857; `eval.hunter_catches_per_1k` 1.29;
`eval.hunter_income_share.carcass` 0.150; `eval.boom_bust_count` 2.02; `eval.recruit_matured_share` 0.671;
`eval.recruit_lineage_share` 0.321; `eval.hunter_global_extinctions` 12.3 (`npm run baseline:table -- --plan
docs/designs/honest-budgets.md`).

**Prediction (recorded before the run).** E179 falsified `recruit`, `cub-plant` and `cub-size` because all three carried
`specFlipNoHunt`, which left no hunter alive on any of 16 seeds. Without it, one lever per arm on today's defaults
(`killGorgeShare` 0.4) reads alone, and at least one arm, or `recruit-all`, is the finalist: it lowers
`eval.hunter_juvenile_death_share` below 0.55 (the control sits near 0.86), keeps hunters alive at the end on at least 48
of 64 seeds (the control reads 41 of 64) when T36a runs it, and on 64 matched seeds `keepRule` reads no guard `WORSE`.
Theory: a juvenile hunter dies because it cannot yet kill (zero kills, 0.86 of juveniles die) and its parents are too
poor or too crowded out to feed it; relaxing the territory (`territoryMax` 4, `territoryRadius` 250), a larger split
reserve (`splitMinEnergyMultiplier` 0.85), a plant income while young (`juvenilePlantShare` 0.25) and a lower size
barrier (`huntSizeRatio` 0.9) each give a cub more time to learn. The most likely mover is `cub-plant` (it pays the
cub directly); `territory` is expected to raise `eval.recruit_lineage_share`; `split` is expected to cost catches
(fewer, richer splits). **Falsified (Stop-when)** when every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`
against the control. Screen verdicts at 16 seeds are only the metrics whose detectable change is 0.10 or less
(`eval.recruit_matured_share`, `eval.recruit_lineage_share`, `eval.hunter_juvenile_death_share` is judged by its mean and
the 0.55 bar, not a verdict); everything else is context.

**Principle check.** The levers change the world a run happens in (a config), not who breeds; no reward term pays for an
act; the hunt chain stays fail-closed (a cub still has to bite); no input is added.

**Arms** (`evals/screens/honest-recruit-2.grid.json`, 16 seeds, seed offset 0, 400000 ticks, policy live, floor on,
`specFlipNoHunt` unset everywhere): `control` is today's defaults. `territory` is `territoryMax` 4 and `territoryRadius` 250. `split` is `specialisations.predator.splitMinEnergyMultiplier` 0.85. `cub-plant` is `juvenilePlantShare` 0.25.
`cub-size` is `huntSizeRatio` 0.9. `recruit-all` is the four levers together.

**Run:** `scripts/run-detached.sh T39-screen --frozen -- npm run screen -- --grid
evals/screens/honest-recruit-2.grid.json` on branch `feat/honest-budgets-t39` (reports in
`evals/screens/results/honest-recruit-2/`). A finalist then runs T36a (the control and the finalist on seeds 65 to 128,
`--keep-rule`), which waits for the user's go-ahead.

## Screen result (T39, 16 seeds, 400000 ticks, on main 390acd9a)

`screen-table.md` is the screen's `table.md`, the verdicts are `screen-verdicts.json`, the reports stay in the run's frozen
copy. All six arms pass the screen's collapse criteria. Means over seeds 1 to 16 (the count of seeds that define the
metric in brackets where fewer than 16), extracted by script from the arm reports and verdicts:

| Metric                                            | `control`  | `territory`                           | `split`                               | `cub-plant`                           | `cub-size`                            | `recruit-all`                         |
| ------------------------------------------------- | ---------- | ------------------------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------- |
| hunters alive at the end (seeds of 16)            | 11         | 10                                    | 12                                    | 9                                     | 7                                     | 6                                     |
| keep rule against `control`                       | -          | no harm (alive 3 harmed, 2 recovered) | no harm (alive 4 harmed, 5 recovered) | no harm (alive 6 harmed, 4 recovered) | no harm (alive 6 harmed, 2 recovered) | no harm (alive 6 harmed, 1 recovered) |
| `eval.hunter_juvenile_death_share`                | 0.864      | 0.847                                 | 0.82                                  | 0.776                                 | 0.862                                 | 0.821                                 |
| `eval.hunter_catches_per_1k`                      | 1.41       | 1.231                                 | 1.248                                 | 1.194                                 | 1.376                                 | 1.341                                 |
| `eval.hunter_income_share.carcass`                | 0.156      | 0.151                                 | 0.155                                 | 0.152                                 | 0.164                                 | 0.162                                 |
| `eval.boom_bust_count`                            | 4.188      | 5                                     | 3.875                                 | 2.75                                  | 3                                     | 2.25                                  |
| `eval.recruit_matured_share`                      | 0.69       | 0.696                                 | 0.73                                  | 0.733                                 | 0.691                                 | 0.705                                 |
| `eval.recruit_lineage_share`                      | 0.344      | 0.328                                 | 0.324                                 | 0.312                                 | 0.306                                 | 0.315                                 |
| `eval.recruit_replaced_share.split-hunter-parent` | 0.609      | 0.6                                   | 0.577                                 | 0.557                                 | 0.55                                  | 0.582                                 |
| `eval.recruit_replaced_share.mate-hunter-parent`  | 0.351 (15) | 0.302                                 | 0.308 (13)                            | 0.293 (15)                            | 0.251 (13)                            | 0.271 (15)                            |
| `eval.recruit_replaced_share.spec-flip`           | 0.737      | 0.723                                 | 0.718                                 | 0.632                                 | 0.583                                 | 0.5                                   |
| `eval.recruit_replaced_share.floor`               | 0 (4)      | 0.033 (9)                             | 0 (5)                                 | 0.01 (3)                              | 0.009 (5)                             | 0 (1)                                 |
| `eval.hunter_global_extinctions`                  | 21.5       | 22.063                                | 23.313                                | 15                                    | 31.875                                | 31.688                                |
| `eval.carcass_loss_share.lost`                    | 0.056      | 0.067                                 | 0.051                                 | 0.027                                 | 0.056                                 | 0.01                                  |
| `eval.carcass_loss_share.eaten`                   | 0.645      | 0.618                                 | 0.623                                 | 0.647                                 | 0.511                                 | 0.472                                 |
| `eval.carcass_loss_share.faded`                   | 0.297      | 0.312                                 | 0.324                                 | 0.324                                 | 0.43                                  | 0.516                                 |

**Verdict against the prediction: falsified for every arm; no finalist.** The Done-when row asked for
`eval.hunter_juvenile_death_share` below 0.55 with hunters alive on at least 48 of 64 seeds (0.75). No arm is near it: the
juvenile death share is 0.864 on the control and 0.776 to 0.862 on the five arms (the lowest, `cub-plant` 0.776, is a fall
of 0.088, inside the 0.10 detectable change at 16 seeds, and far above 0.55). Hunters alive at the end are 11 of 16 on the
control, 12 on `split`, 10 on `territory`, 9 on `cub-plant`, 7 on `cub-size` and 6 on `recruit-all`: the arms that move
the juvenile death share most (`cub-plant`, `recruit-all`) hold fewer hunters, and only `split` holds one seed more than the
control. The keep rule reads no harm on any arm, but its `alive` guard sees a loss of only 8 to 10 seeds at this size, and
the direction is down for `territory`, `cub-plant`, `cub-size` and `recruit-all`. The Stop-when row (every arm reads
`eval.hunter_catches_per_1k` or `held` WORSE) is not met either: catches are 1.19 to 1.38 against 1.41 with no verdict at
16 seeds, and `held` reads no harm everywhere. So no arm is falsified outright, and none reaches the bar.

What the arms did move, as context (no verdict at 16 seeds): `cub-plant` is the best lead, with the lowest juvenile death
share, `eval.hunter_global_extinctions` 21.5 to 15, `eval.boom_bust_count` 4.19 to 2.75 and the matured share 0.690 to
0.733 (inside its 0.10 detectable change), but it has 3 seeds under 80 agents against 0 and hunters alive on 9 against 11.
`cub-size` and `recruit-all` raise the hunters' world extinctions (21.5 to 31.9 and 31.7) and leave more carcass to fade
(0.30 to 0.43 and 0.52). The lineage share, the matured share and the carcass income do not move beyond their detectable
change on any arm.

**Finalist: none.** No arm lowers the juvenile death share below 0.55, and the arm that lowers it most (`cub-plant`) keeps
hunters alive on fewer seeds than the control. T36a has nothing to confirm.

**Next (recommendation for the user).** Park the Phase 6 recruitment levers. A juvenile death share of 0.86 that moves by
0.00 to 0.09 under four levers and their sum is not a budget the config buys off. The cheapest informative follow-up is a
diagnostic, not another screen: replay a few `cub-plant` and control seeds with `--level debug` and read how juveniles die
(age at death, cause, whether a parent is in range) before adding any lever. `cub-plant` (`juvenilePlantShare` 0.25) stays
a lead, to be read at 64 seeds only if that diagnostic names juvenile diet as the cause.
