### 2026-11-11 - Decision metrics against the power bar (metric-trust T28)

A re-read of `evals/power/defaults-floor-on-E150.json` (128 seeds, floor on), with no new runs. The decision set is
what decides a pass or a verdict today: the screen criteria and the hunter gate in `scripts/lib/screen-verdict.mjs`
(`armVerdict`, `hunterGate`), the screen `TARGETS`, the keep-rule guards in `docs/principles.md`, and the training
plateau `PLATEAU_SERIES` in `js/evo/learning-curve.js`. `WATCH_METRICS` carry no verdict and are left out. The
detectable change at 64 seeds comes from `eval:power --sizes 32,64 --include-watch --splits 500 --power-splits 200`.
The inert-gate and seed-flip rates come from 1000 and 300 random disjoint splits of the 128 seeds.

**Threshold tests are not comparisons.** `catchRate` (`eval.hunter_catches_per_1k` above 0 on every seed),
`matingShare` (`eval.mating_share` mean at least 0.2) and `bornShare` (`eval.born_share` mean at least 0.5) test one arm
against a fixed floor. The power bar measures a comparison, so it does not apply to them. On the defaults they hold with
room to spare: no seed has a catch rate of 0, the mating mean is 0.41 and the born mean is 0.98. A threshold test needs
a metric that passes the arithmetic, source and liveness checks. The rule in T31 that "gate criteria read only
`verified` metrics" would drop all three. It should require those three checks for a threshold criterion, and full
`verified` status only for a criterion that compares two arms.

**Decision metrics that miss the bar at 32 seeds, and what each needs:**

| Metric                           | Read by                              | MDE 32 / 64 | Why it misses                                      | Replacement or seeds                                                                                                |
| -------------------------------- | ------------------------------------ | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `eval.predators_at_end`          | `hunterGate` median, alive share     | 1.00 / 0.75 | Headcount; sd 31 on a mean of 27, 33 zero seeds    | None under 128 seeds. Delete the median test (below). Alive share moves to `keepRule` as a guard                    |
| `eval.hunter_ticks_last_quarter` | `hunterGate` median                  | 1.00 / 0.75 | Headcount; sd above the mean                       | None under 128 seeds. Delete the median test                                                                        |
| `eval.prey_summer_min`           | `summerSeeds` (seeds at 100 or more) | 1.00 / 0.75 | Headcount; 44 of 128 seeds at 100 or more          | A seed share, judged like the alive share (below); as a mean it needs more than 128 seeds                           |
| `eval.hunter_catches_per_1k`     | `catchRate`; a hunter-skill guard    | 0.30 / 0.15 | Noise                                              | Threshold use is sound. As a comparison it needs 64 seeds: write `minSeeds: 64`                                     |
| `eval.mating_share`              | `TARGETS`, `matingShare`             | 0.20 / 0.15 | Noise: 0.082 absolute at 32, the share bar is 0.05 | About 96 seeds. Let `eval.births_per_1k` (verified at 16, MDE32 0.10) carry the breeding Target; keep the threshold |
| `eval.born_share`                | `bornShare`                          | 0.10 / 0.10 | The `eval:compare` min-effect floor, not noise     | Threshold use is sound. See the min-effect finding below                                                            |
| `eval.hunter_zero_kill_share`    | `PLATEAU_SERIES`                     | 0.15 / 0.10 | Noise: 0.085 absolute at 32                        | About 96 seeds for a compare. The plateau does not compare two arms (below), so it stays                            |
| `eval.bite_on_prey_view`         | `PLATEAU_SERIES`                     | 0.10 / 0.10 | The min-effect floor, not noise                    | See the min-effect finding below                                                                                    |

The other comparison metrics pass at 32 seeds or fewer: `eval.lineages_alive` (32), `eval.births_per_1k`,
`eval.food_energy_per_1k` and `eval.fed_median_lifespan` (16). `eval.fed_median_lifespan` is still in `TARGETS`, even
though T26j keeps it off decision curves and gates. The screen table prints it as a delta, not as a pass, so it decides
nothing, but it should move to `WATCH_METRICS`.

**The hunter gate fails an inert arm 76% of the time.** Two disjoint halves of the same defaults, used as arm and
reference, fail `hunterGate` 0.74, 0.76, 0.76 and 0.79 of the time at 8, 16, 32 and 64 seeds per arm. "The arm's median
`eval.predators_at_end` is not below the reference's" fails 0.50 of the time, and so does the median of
`eval.hunter_ticks_last_quarter`. "No more seeds under 80 than the reference" fails 0.45, and "alive on at least 0.75 of
seeds" fails 0.45, because the defaults sit at 0.74. More seeds do not help, because none of these tests has an interval.
The full 128-seed defaults report fails the gate against itself (alive share 0.742). Replace it with `keepRule` (T30): paired intervals on
the alive share and the under-80 share, with the medians reported but not tested.

**What the keep rule's seed-share guards can see.** Starting from defaults with hunters alive on 0.74 of seeds and 0.40
of seeds under 80, k seeds are flipped to the harmful outcome in one arm, and the `eval:compare` interval is checked.

| Guard         | Seeds per arm | worse verdict at k flipped (k: rate)         | Inert false positive |
| ------------- | ------------- | -------------------------------------------- | -------------------- |
| Hunters alive | 32            | 2: 0.08, 4: 0.23, 6: 0.38, 8: 0.65, 10: 0.79 | 0.04 worse           |
| Hunters alive | 64            | 4: 0.16, 6: 0.24, 8: 0.35, 10: 0.51          | 0.03 worse           |
| Under 80      | 32            | 4: 0.09, 6: 0.20, 8: 0.36, 10: 0.56          | 0.02 worse           |
| Under 80      | 64            | 4: 0.06, 6: 0.16, 8: 0.24, 10: 0.31          | 0.02 worse           |

At 32 seeds, the alive guard catches a loss of about 10 seeds (0.31 of the share) at 80%, and the under-80 guard needs
more than 10. These are guards against a large harm, not a fine test. The planned T30 test, "a planted loss of 4 alive
seeds in 32 is worse", can be true only for one hand-built pair: on a random pair, a 4-seed loss is caught 0.23 of the
time. The test should plant a loss of 10 or more seeds, or check the interval width instead.

**Pairing barely helps a headcount.** `eval:power` compares disjoint seed halves, but `eval:compare` judges seeds as
pairs. On the same seeds, floor on against floor off correlate 0.84 to 0.98 per seed. That figure is inflated, because
the two worlds are identical until the floor first fires. A change that acts from tick 0 decorrelates within the run.
`mateRoamTicks` 0 against 6000 (`evals/screens/results/roam-harm/`, 32 seeds) gives 0.31 on `eval.predators_at_end`,
0.19 on `eval.hunter_ticks_last_quarter`, 0.29 on `eval.prey_summer_min`, 0.27 on the under-80 share, and 0.59 on
`eval.mating_share`. `herdDungTicks` 900 against 1800 (`evals/screens/results/herd-ecology-power/`) gives about 0 on
headcounts and 0.47 on `eval.mating_share`. The unpaired power read is fair for headcounts and slightly conservative for
breeding and population means. Do not use the floor-on and floor-off pair to estimate a pairing gain.

**The min-effect floor caps the share bar.** `eval:compare` refuses a verdict below `--min-effect` 0.05 of the before
mean. For a share near 1, that is about 0.048 absolute, right at the share bar of 0.05 absolute. Planted shifts at 32
seeds show the floor, not noise: `eval.born_share` is detected 0.52 of the time at 0.05 relative and 0.89 at 0.06;
`eval.bite_on_prey_view` 0.49 and 0.83; `eval.child_survival` 0.57 and 0.99. These shares are precise, but no seed count
can make them `verified`. Fix the tools: for a metric of unit `share`, `compareReports` should use an absolute min-effect
(0.02, under the share bar), and `eval:power` should plant absolute steps for shares (0.01 to 0.20). Measure again after
that. The same cap applies to any other share above about 0.5, such as `eval.hunter_independent_kill_share` and
`eval.bite_wish_with_prey_in_jaws`.

**The plateau is not a two-arm compare.** `flatAfter` calls a series flat when it moves less than `PLATEAU_RISE` (0.05)
of its value over `PLATEAU_WINDOW` (3) checkpoints. Noise alone moves a 32-seed mean by 5% or more 0.12 of the time for
`eval.food_energy_per_1k` and 0.26 for `eval.hunter_zero_kill_share`, but 0 for `eval.bite_on_prey_view`. A noisy series
looks like progress and delays the plateau, so the rule fails on the safe side for a false plateau. A true 5% gain reads
as flat about half the time. That is the cost of a 5% rise with no smoothing, and it applies to the curve only if the
training episodes vary across seeds the way the defaults do. The `flatAfter` comment still names
`eval.bite_wish_with_prey_in_jaws`, but the series is `eval.bite_on_prey_view` (T26c).

**The screen's per-seed criteria fail the defaults.** On the 128 floor-on seeds, `lineages` (at least 5 at the last
tick, from the trace) fails 117 seeds, `popAboveMin` 49 and `specShare` 40. "Every seed passes every criterion" cannot
pass on the defaults, so `armVerdict.pass` is false for the reference arm and for any arm near the defaults. These are
trace criteria, outside the registry, and they need the same interval treatment as the hunter gate.
