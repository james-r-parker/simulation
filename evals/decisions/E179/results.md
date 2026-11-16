# E179 - predator recruitment and juvenile survival (honest-budgets Phase 6, T34 to T36)

**Prediction (recorded before the run).** Capping the immediate kill gorge (`killGorgeShare` 0.4) leaves real carcasses
for juveniles and scavengers; relaxing `territoryMax`/`territoryRadius`, raising `predator.splitMinEnergyMultiplier`
to 0.85, and blocking `canHunt`-crossing `specMutationRate` flips (`specFlipNoHunt`) lets surviving hunters breed
together and fund viable cubs; and adding either `juvenilePlantShare` (0.25) or higher `huntSizeRatio` (0.9) lets
juveniles survive to adulthood. On the 16-seed screen (`evals/screens/honest-recruit.grid.json`, seeds 1 to 16,
400000 ticks, floor on, policy live), the finalist (`cub-plant`, `cub-size`, or `recruit`) lowers
`eval.hunter_juvenile_death_share` below 0.55 while keeping `eval.hunter_catches_per_1k` and
`eval.hunter_income_share.carcass` alive, and on 64 matched seeds `keepRule` reads no guard `WORSE`. Falsified when
every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`.

**Arms.** `control` is `killGorgeShare` 1 (today's rules; its worlds are the season's exactly). `gorge` is
`killGorgeShare` 0.4. `recruit` adds `territoryMax` 4, `territoryRadius` 250, `predator.splitMinEnergyMultiplier` 0.85,
and `specFlipNoHunt` true. `cub-plant` adds `juvenilePlantShare` 0.25. `cub-size` adds `huntSizeRatio` 0.9.

**Run:** `npm run screen -- --grid evals/screens/honest-recruit.grid.json` on branch `feat/honest-budgets-t34-recruit`
(T35), then the finalist and the control on seeds 1 to 64 with `--keep-rule` (T36).

## Screen result (T35, 16 seeds, 400000 ticks, on main cbfd5238)

`table.md` is `screen-table.md`, the verdicts are `screen-verdicts.json`, the reports stay in
`evals/screens/results/honest-recruit/`. Means over seeds 1 to 16 (the count of seeds that define the metric in brackets
where fewer than 16):

| Metric                                               | `control`          | `gorge`            | `recruit`                           | `cub-plant`        | `cub-size`         |
| ---------------------------------------------------- | ------------------ | ------------------ | ----------------------------------- | ------------------ | ------------------ |
| screen verdict                                       | PASS               | PASS               | FAIL                                | FAIL               | FAIL               |
| hunters alive at the end (seeds of 16)               | 7                  | 11                 | 0                                   | 0                  | 0                  |
| keep rule against `control`                          | -                  | no harm            | alive WORSE (7 harmed, 0 recovered) | alive WORSE        | alive WORSE        |
| `eval.hunter_juvenile_death_share`                   | 0.831              | 0.864              | 0.841                               | 0.770              | 0.822              |
| `eval.hunter_catches_per_1k`                         | 1.107              | 1.410              | 0.295                               | 0.465              | 0.175              |
| `eval.hunter_income_share.carcass`                   | 0.004              | 0.156              | 0.167                               | 0.145              | 0.198              |
| `eval.boom_bust_count`                               | 4.69               | 4.19               | 0.38                                | 0.56               | 0.25               |
| `eval.recruit_matured_share`                         | 0.715              | 0.690              | none (0)                            | 0.768 (6)          | none (0)           |
| `eval.recruit_lineage_share`                         | 0.322              | 0.344              | none (0)                            | 0.236 (6)          | none (0)           |
| `eval.recruit_replaced_share.split-hunter-parent`    | 0.579              | 0.609              | none (0)                            | 0.465 (6)          | none (0)           |
| `eval.recruit_replaced_share.mate-hunter-parent`     | 0.200              | 0.351 (15)         | none (0)                            | 0.202 (4)          | none (0)           |
| `eval.hunter_global_extinctions` (per seed)          | 21.6               | 21.5               | 0.5                                 | 0.75               | 0.31               |
| `eval.carcass_loss_share.lost` / `.eaten` / `.faded` | 0.03 / 0.22 / 0.75 | 0.06 / 0.65 / 0.30 | 0.01 / 0.09 / 0.90                  | 0.01 / 0.13 / 0.86 | 0.01 / 0.09 / 0.90 |

**Verdict against the prediction: falsified for the named finalists, and no arm reaches the Done-when row.** The
prediction named `recruit`, `cub-plant` or `cub-size` as the finalist lowering `eval.hunter_juvenile_death_share` below
0.55. None does (0.84, 0.77, 0.82; the lowest, `cub-plant`, rests on the 6 seeds where hunters live). All three arms
share `specFlipNoHunt`, and with it no hunter is alive at the end on any of 16 seeds (the control has 7): the keep rule's
`alive` guard reads WORSE (7 harmed, 0 recovered, smallest loss detected 6 seeds), `eval.hunter_catches_per_1k` falls
by 73 to 84 percent and `eval.boom_bust_count` to under 0.6. The cause is not measured here (the hypothesis: with no
spec flips the floor and the mating and split lines of a dwindling few hunters cannot refill a hunter population
the prey no longer sustains); it is the reason the three arms fail, and `specFlipNoHunt` is dropped from the
finalist.

**Finalist: `gorge` (`killGorgeShare` 0.4 alone).** It is the only arm with no guard WORSE (alive 2 harmed and 6 recovered,
under 80 0 and 3, held 0 and 0, `eval.hunter_catches_per_1k` up 27 percent), the only one that keeps hunters alive on
more seeds than the control (11 of 16 against 7), and the one that moves the carcass work: `eval.hunter_income_share.carcass`
0.004 to 0.156 and the share of carcass energy eaten 0.22 to 0.65 (faded 0.75 to 0.30). The Stop-when row (every arm
reads catches or held WORSE) is not met, so T36 runs. It does not meet the Done-when row: its juvenile death share
rises (0.83 to 0.86), so a Phase 6 adopted as `gorge` would not by itself fix juvenile survival; T37 is judged on the keep
rule and the "A realistic mechanism stays" rule of [principles.md](../../../docs/principles.md), and the juvenile and
territory levers need another screen without `specFlipNoHunt` (a later task).

New detectors, as predicted before the run: the matured and lineage shares (screen verdicts at 16 seeds) do not move
on `gorge` (0.715 to 0.690, 0.322 to 0.344, inside their 0.10 detectable change); the replaced shares and the
carcass-loss shares are context only. A full pool still loses little (0.03 to 0.06), so the T33b "not material" finding
holds under `gorge`.

**Next (T36).** `gorge` (`evals/decisions/E179/gorge.config.json`) and the defaults on seeds 65 to 128
(`--seed-offset 64`), 400000 ticks, policy live, floor on, then `npm run eval:compare -- <control> <gorge> --keep-rule
--allow-config-diff killGorgeShare`.
