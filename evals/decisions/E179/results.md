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

## Keep rule (T36, 64 matched seeds)

`npm run eval:compare -- evals/decisions/E179/control.report.json evals/decisions/E179/gorge.report.json --keep-rule
--allow-config-diff killGorgeShare` (the table is `compare.txt`, the full result `compare.json`). Both arms ran on seeds
65 to 128 (`--seed-offset 64`), 400000 ticks, floor on, policy live, on main `cbfd5238`; the control is the defaults
(`killGorgeShare` 1) and the finalist is `killGorgeShare` 0.4 (`gorge.config.json`).

**Verdict: no harm detected at this size.**

| Guard                        | Result                                    | Smallest loss detected |
| ---------------------------- | ----------------------------------------- | ---------------------- |
| hunters alive at the end     | 13 seeds harmed, 14 recovered (exact p 1) | 28 seeds               |
| seeds under 80 agents        | 2 harmed, 4 recovered (p 0.69)            | 13 seeds               |
| held                         | 0 harmed, 3 recovered (p 0.25)            | 12 seeds               |
| `eval.hunter_catches_per_1k` | diff +0.071, interval [-0.019, 0.162]     | 0.091                  |

Read the smallest losses: the `alive` guard cannot see a loss of fewer than 28 of 64 seeds, so "no harm" there is weak
(the screen's 11 of 16 against 7 did not replicate: 41 of 64 against 40). The adoption bar is not met: hunters alive on
41 of 64 [33.2, 47.8] against the 0.75 bar (48), seeds under 80 2 of 64 against 4 of 64 for the control. The control
fails the bar too, so the miss is not caused by the switch.

Targets and detectors (control to `gorge`, per-seed means over 64 seeds, `compare.txt`):

| Metric                                            | `control` | `gorge` | Change                  | Verdict       |
| ------------------------------------------------- | --------- | ------- | ----------------------- | ------------- |
| `eval.hunter_catches_per_1k`                      | 1.320     | 1.391   | +5.4% [-0.019, 0.162]   | no-difference |
| `eval.hunter_juvenile_death_share`                | 0.863     | 0.855   | -0.9% [-0.025, 0.008]   | no-difference |
| `eval.hunter_income_share.carcass`                | 0.0054    | 0.152   | +0.146 [0.142, 0.150]   | -             |
| `eval.boom_bust_count`                            | 4.20      | 3.88    | -7.8% [-1.09, 0.42]     | unverified    |
| `eval.carcass_loss_share.eaten`                   | 0.159     | 0.572   | +0.413 [0.38, 0.44]     | -             |
| `eval.carcass_loss_share.faded`                   | 0.818     | 0.369   | -0.449 [-0.48, -0.41]   | -             |
| `eval.carcass_loss_share.lost`                    | 0.014     | 0.056   | +0.042 [0.030, 0.053]   | -             |
| `eval.recruit_matured_share`                      | 0.675     | 0.679   | +0.004 [-0.014, 0.019]  | -             |
| `eval.recruit_first_kill_share`                   | 0.695     | 0.712   | +0.017 [-0.003, 0.036]  | -             |
| `eval.recruit_lineage_share`                      | 0.346     | 0.332   | -0.015 [-0.034, -0.002] | -             |
| `eval.recruit_replaced_share.split-hunter-parent` | 0.622     | 0.605   | -0.017 [-0.040, 0.0001] | -             |
| `eval.recruit_replaced_share.spec-flip`           | 0.773     | 0.728   | -0.045 [-0.077, -0.013] | -             |
| `eval.hunter_global_extinctions` (per seed)       | 22.6      | 25.2    | +2.6 [0.30, 5.09]       | -             |

The prediction (a finalist that lowers `eval.hunter_juvenile_death_share` below 0.55 while keeping catches and carcass
income alive, with no guard WORSE) is **half met**: no guard is WORSE and carcass income is alive (`gorge` is 28 times the
control), but the juvenile death share does not move (0.863 to 0.855) and the 16-seed catches gain (+27%) shrinks to +5%
with no verdict. The matured share does not move; the lineage share and the spec-flip replaced share fall by 4% and 6%
with intervals that exclude 0, and the hunters' world empties 12% more often (22.6 to 25.2 `LastHunterDied` per seed, interval
excludes 0). Those are small costs the guards do not cover.

## Recommendation (awaiting the user's review; nothing is switched here)

**Adopt `killGorgeShare` 0.4 as a narrow change (a T37 for this lever only), and keep Phase 6 open.** This is the
sub-agent's recommendation, not a decision.

- For: the keep rule reads no harm on 64 matched seeds, and the lever does what its scene needs. A killer no longer
  swallows the whole body, so carcasses are real food: carcass income 0.005 to 0.152 of hunter energy, carcass energy
  eaten 0.16 to 0.57, and faded 0.82 to 0.37. That is the scavenge scene in [principles.md](../../../docs/principles.md),
  and a gorge cap is what nature does (a predator cannot eat a whole body at once). "A realistic mechanism stays" says a
  mechanism with no harm on 64 seeds is kept even when its own scene does not yet move a target.
- Against: it does not do Phase 6's job. The Done-when row (`eval.hunter_juvenile_death_share` below 0.55, hunters alive on
  48 of 64) is missed by a wide margin (0.855, 41 of 64), the catches gain did not replicate, and the hunters' world empties
  12% more often. The alive guard could see only a loss of 28 seeds.
- If the user reads the Done-when row as binding, park instead: record `gorge` as a kept option under its switch (it is a
  config key already) and leave the defaults alone. Either way the juvenile, territory and split-energy levers need a new
  screen without `specFlipNoHunt`, which empties the hunters' world on every seed (E179 screen); that screen and T36a (no-rescue,
  held-out confirmation) were not run here.
- A default change moves `rulesHash`: a breaking commit on the open season with re-pinned goldens, which is the T37 work
  and was not started.
