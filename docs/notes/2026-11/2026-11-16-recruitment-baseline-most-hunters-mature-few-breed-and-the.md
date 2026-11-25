### 2026-11-16 - Recruitment baseline: most hunters mature, few breed, and the hunters' world empties several times a run (honest-budgets T33a, T33b)

The new diagnostics (`scene-recruit.js`, `scene-recruit-budget.js`, `scene-carcass-loss.js`) on the season 10 defaults plus
the hunter's eyes of senses-and-motor T20, `npm run eval -- --seeds 16 --ticks 100000 --policy live` (seeds from
`evals/seeds.json`, floor on). Per-seed mean, median and range:

| Metric                                               | Mean  | Median | Range        |
| ---------------------------------------------------- | ----- | ------ | ------------ |
| `eval.recruit_cohort` (hunters born after burn-in)   | 505   | 454    | 15 to 1216   |
| `eval.recruit_censored_share`                        | 0.001 | 0      | 0 to 0.01    |
| `eval.recruit_matured_share`                         | 0.74  | 0.73   | 0.67 to 0.88 |
| `eval.recruit_first_kill_share` (of the matured)     | 0.63  | 0.64   | 0.40 to 0.77 |
| `eval.recruit_lineage_share` (a child that bred)     | 0.30  | 0.30   | 0.20 to 0.39 |
| `eval.recruit_replaced_share.split-hunter-parent`    | 0.57  | 0.57   | 0.45 to 0.67 |
| `eval.recruit_replaced_share.spec-flip`              | 0.76  | 0.83   | 0 to 1       |
| `eval.recruit_replaced_share.mate-hunter-parent`     | 0.15  | 0      | 0 to 0.5     |
| `eval.hunter_starve_age_median`                      | 1574  | 1262   | 849 to 3447  |
| `eval.hunter_lineage_extinctions`                    | 5.3   | 4      | 0 to 23      |
| `eval.hunter_global_extinctions`                     | 3.7   | 4      | 0 to 7       |
| `eval.hunter_territory_blocked_share`                | 0.34  | 0.35   | 0 to 0.73    |
| `eval.chase_net_energy` (per chase)                  | 121   | 124    | 47 to 175    |
| `eval.chase_failed_energy` (per escaped or given up) | -75   | -75    | -117 to -44  |
| `eval.carcass_loss_share.lost`                       | 0.040 | 0.001  | 0 to 0.38    |
| `eval.carcass_loss_share.eaten`                      | 0.23  | 0.15   | 0 to 0.62    |
| `eval.carcass_loss_share.faded`                      | 0.71  | 0.80   | 0.24 to 0.92 |
| `eval.hunter_juvenile_death_share` (for reference)   | 0.80  | 0.82   | 0.55 to 0.90 |

- **A hunter dies young, but most live past `maturityTicks`.** 74% of the cohort matured while 80% of hunter deaths are
  under `juvenileTicks`: the windows differ, so the juvenile death share is not a maturity failure. Of the matured, 63%
  made a deliberate kill, 57% of those born by a split bred, and only 30% have a child that itself bred.
- **Mating-born hunters rarely breed (0.15); spec-flip and split-born do (0.76, 0.57).** The cause is not measured here:
  0.34 of the breeding-ready hunters are refused by `territoryAllows` at a checkpoint, which T35's `recruit` arm tests.
- **The hunters' world empties 3.7 times a run (`LastHunterDied`) and 5.3 lineages end while others live.** The floor and
  spec flips restart them, so the existing headcount reads hide it. A failed chase costs 75 energy against a net 121 per
  chase overall, so the chase is a loss only where it fails often.
- **A full food pool is not where the carcass energy goes.** 4% is lost to it (2 of 16 seeds above 10%), 23% is eaten and
  71% fades; `carcassFadeTicks` and eater reach, not pool capacity, are the leak (T33b decision in honest-budgets.md).
- **Detector power** (`npm run eval:power` on 32 seeds, seeds 1 to 32, 100000 ticks, 16 against 16, 200 splits; the
  false-positive rate of an arm pair drawn from the same report, and the smallest change detected at 80%, absolute for a
  share and a fraction of the mean otherwise):

    | Metric                                  | False positive | Detectable at 80% |
    | --------------------------------------- | -------------- | ----------------- |
    | `eval.recruit_matured_share`            | 8.0%           | 0.10              |
    | `eval.recruit_first_kill_share`         | 9.5%           | 0.15              |
    | `eval.recruit_lineage_share`            | 13.0%          | 0.10              |
    | `eval.recruit_censored_share`           | 0.0%           | 0.03              |
    | `eval.recruit_replaced_share.spec-flip` | 14.0%          | above 0.20        |
    | `eval.chase_net_energy`                 | 8.5%           | 50%               |
    | `eval.chase_failed_energy`              | 15.5%          | 75%               |
    | `eval.hunter_global_extinctions`        | 6.5%           | 75%               |
    | `eval.hunter_lineage_extinctions`       | 9.0%           | 100%              |
    | `eval.recruit_cohort`                   | 6.0%           | 100%              |
    | `eval.carcass_lost_per_1k`              | 13.0%          | above 100%        |

    `eval.recruit_replaced_share.split-hunter-parent`, `eval.hunter_starve_age_median`, `eval.hunter_territory_blocked_share`,
    `eval.carcass_loss_share.lost` and `.eaten` get no verdict at 16 seeds (the tool prints none). So at 16 seeds the screen
    can read only the matured, first-kill and lineage shares for a change of 0.10 to 0.15; the chase energy, extinction counts
    and the carcass loss need a larger effect than the arms are likely to make, and are context for the 64-seed keep-rule pass,
    not screen verdicts. The registry entries carry no `power` read yet; `evals/power` is another lane's file.
