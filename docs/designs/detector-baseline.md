# Detector baseline

**Status:** In progress - Phase 1 chunks A and B are built except the wave's `bench.observe_ms@500` price (T4: deferred while an eval screen holds the CPU lock; command under Wave check); the wave itself is not complete, since body-genes has no detector merged; T7 ran on the season 10 defaults (`E187`, re-recorded as `E188` on the gorge defaults, 2026-11-17; the plans whose detectors landed after `E188` get a top-up run later, on the same defaults), and T8 and T8a are built on `E188`; the measure-first plans share one chase-outcome taxonomy, one detector wave and one 128-seed baseline of the defaults, in place of seven separate 16-seed runs.
**Validated:** 04e3b340 (2026-11-17)
**Priority:** 34 - it schedules no work of its own ahead of the queue: its tasks run when the Phase 1 detector tasks of the plans it serves are built, and those change no behaviour
**Depends on:** [metric-trust.md](metric-trust.md)

Seven plans open with the same step: add detectors, then run 16 seeds of the defaults and read `npm run eval:power`. Run apart, that is seven baselines of one world on different days and seasons, each too small to give a new metric its power (the registry's power comes from 128 seeds, `evals/power/defaults-floor-on-E150.json`). Three of the plans also classify how a chase ends, each in its own module. This doc makes the baseline one run and the chase outcome one taxonomy. It changes no sim behaviour and adds no reward.

## The plans served

| Plan                                     | Detector task | Baseline task and record | New `eval.*` names |
| ---------------------------------------- | ------------- | ------------------------ | ------------------ |
| [training-stages.md](training-stages.md) | T1, T2, T3    | T5, `E-TS-0`             | 11                 |
| [sprint-burst.md](sprint-burst.md)       | T2a, T2b      | T3, shared top-up        | 5                  |
| [stillness.md](stillness.md)             | T2a, T2b      | T3, shared top-up        | 3                  |
| [chase-physics.md](chase-physics.md)     | T1            | T2, `E-CP-1`             | 3                  |
| [scent-trails.md](scent-trails.md)       | T1            | T3, shared top-up        | 2                  |
| [prey-guilds.md](prey-guilds.md)         | T1            | T2, `E-PG-1`             | 12                 |
| [body-genes.md](body-genes.md)           | T1, T1a       | T2, `E-BG-1`             | 4                  |

The signal census of [senses-and-motor.md](senses-and-motor.md) (T10) samples the same worlds and reads the shared run's saved champions.

## One chase taxonomy

`trackApproaches` in `js/evo/scene-approach.js` resolves a chase as caught, escaped or lapsed. Three plans split or extend that outcome:

| Plan                                     | Adds                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [training-stages.md](training-stages.md) | A lapse is quit, lost or outrun; chase ticks                                                                                     |
| [chase-physics.md](chase-physics.md)     | Overshoot (the range re-opens after its minimum); a chase that crossed cover                                                     |
| [scent-trails.md](scent-trails.md)       | Renewed prey sighting during an open chase, after a gap of at most `REACQUIRE_WINDOW`; ray summaries do not expose prey identity |

Built apart, a chase whose prey sighting resumes is counted as two chases by one module and one by another, and the shares stop summing. `js/evo/chase-outcome.js` owns one record per chase: its opening tick, its end class and its flags. There are three end classes (caught, escaped, gave up); a lapse is split by the `LAPSE_LOST` and `LAPSE_OUTRUN` flags, and a gave-up chase with neither is a quit. The other flags are overshot, crossed cover, re-acquired, sprinted and prey still at first sight. `REACQUIRED` means a prey ray sighting returned during the same open chase; ray summaries do not expose prey identity. `PREY_AT_FIRST_SIGHT` remains unset. The record keeps counts, not a resolving tick (the length of a chase is fed to `noteChaseLength` apart). Every chase metric of the three plans, and the sprint and stillness chase reads, is a count over those records. The end classes partition the chases; the flags do not. A chase with a renewed prey sighting is one chase.

## One wave, one run

| Step        | Rule                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave        | The detector tasks of the table land as code before the run, in any order, each with its registry entries, arithmetic test and source test. They may be built ahead of their plan's rank: none changes `worldHash`                  |
| Predictions | Each plan's baseline prediction is in its doc, or in `evals/experiments.json`, before the run starts. A plan with no written prediction is left out of the read and runs its own baseline later                                     |
| Run         | 128 floor-on seeds and 128 floor-off seeds of the default config, 200000 ticks, `--save-champions 2`, the live policy: the form of `E150`                                                                                           |
| Reports     | `evals/power/defaults-floor-on-<id>.json` and `defaults-floor-off-<id>.json`, and under `evals/decisions/<id>/`, each stamped with its `rulesHash`                                                                                  |
| Power       | `npm run eval:power -- <report> --include-watch` and `npm run metric:liveness` once, for every new metric; the registry's `power.js` and `liveness.js` take the readings, so a metric that passes is `verified` with its seed count |
| Plan tables | `npm run baseline:table -- --plan <doc>` (`scripts/baseline-table.mjs`) prints a plan's metrics from the shared report as its Baseline table, with mean, range, power and the seeds a verdict needs                                 |
| Cost        | `bench.observe_ms@500` is read before the wave and after it, on a base-ref run and a head run under the CPU lock. The wave may add at most 0.05 ms (0.13 ms today); a tally over that moves onto an existing pass or is sampled     |

## Wave check

Read on 2026-11-17 against `main` at `3ca2b1fd` (T3). The wave's first merged detector PR is #445 (prey-guilds T1, 7e1aacaa), so the base ref of the price is `7e1aacaa^`. PRs #445, #449 and #458 added 23 new metrics; #485 added four prey-selectivity metrics; #489 added five sprint metrics. The renamed `eval.herd_dodge_share` and changed `eval.hunter_zero_kill_share` are not counted as new metrics.

| Plan                                     | Detector task | Merged           | Metrics in the registry                                                                                                                                                                                   | Missing                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [training-stages.md](training-stages.md) | T1, T2, T3    | Yes (#458)       | 11 of 11: `chase_{quit,lost,outrun,shaken}_share`, `chase_ticks_p{50,90}`, `pack_lift`, `pack_prey_size_ratio`, `style_lineage_share`, the renamed `herd_dodge_share`, `hunter_zero_kill_share` (changed) | `E-TS-0` predicts `chase_lost_share`, `chase_quit_share` and `pack_lift`; no prediction is claimed for `chase_outrun_share`, `chase_shaken_share`, `chase_ticks_p{50,90}`, `pack_prey_size_ratio`, `style_lineage_share`, `herd_dodge_share` or `hunter_zero_kill_share` |
| [chase-physics.md](chase-physics.md)     | T1            | Yes (#449)       | 3 of 3                                                                                                                                                                                                    | The premise predicts `chase_turn_jitter`; no prediction is claimed for `chase_overshoot_share` or `chase_cover_use_share`                                                                                                                                                |
| [prey-guilds.md](prey-guilds.md)         | T1, T1b       | Yes (#445, #485) | 15 of 15                                                                                                                                                                                                  | `E-PG-1` predicts all four `prey_selectivity.<spec>` and `guild_survival.<spec>` values; no prediction is claimed for the four `guild_share.<spec>` values or `reproducer_recovery_rate`                                                                                 |
| [sprint-burst.md](sprint-burst.md)       | T2a, T2b      | Yes (#489)       | 5 of 5: `eval.sprint_share.hunter`, `eval.sprint_share.prey`, `eval.chase_sprint_lift`, `eval.flee_sprint_lift`, `eval.sprint_cost_share`                                                                 | Registered after E188; values and power/liveness wait for the shared top-up                                                                                                                                                                                              |
| [stillness.md](stillness.md)             | T2a, T2b      | Yes (#490)       | 3 of 3: `eval.freeze_under_threat`, `eval.freeze_survival_gain`, `eval.ambush_kill_share`                                                                                                                 | Registered after E188; values and power/liveness wait for the shared top-up                                                                                                                                                                                              |
| [scent-trails.md](scent-trails.md)       | T1            | Yes (#491)       | 2 of 2                                                                                                                                                                                                    | Registered after E188; prediction written (`E-ST2-1`); power/liveness read waits for the shared top-up                                                                                                                                                                   |
| [body-genes.md](body-genes.md)           | T1, T1a       | No               | 0 of 4                                                                                                                                                                                                    | `js/evo/scene-traits.js` and `js/evo/transplant-probe.js` not built. `E-BG-1` predicts the template mapping and transplant gap; the plan accepts no prediction for `eval.trait_spread.*`, `eval.trait_bimodality.carnivory` or `eval.trait_brain_alignment`              |

What the table shows:

- Every merged metric has its entry, its arithmetic test and its source test: `test/evo/metric-registry.test.js` fails an entry without them, and it passes. No registry gap needed a fix in this chunk.
- At T3, none of the 23 metrics from #445 had a `liveness` or `power` read; T8/T8a later wrote those reads from E188. Four prey-selectivity metrics from #485 and five sprint metrics from #489 were added after E188 and remain absent until the detector top-up. Three stillness metrics from #490 and two scent-trail metrics from #491 were also added after E188 and wait the same way. Of the 32 registered metrics added after the first detector wave, 29 are `watch`, each with an `intended` direction (`eval:power --include-watch` needs it).
- Left out of the read: body-genes has no detector merged, while the sprint, stillness and scent-trail metrics were registered after E188; those plans' new metrics wait for the shared top-up. Per metric, the metrics named above without a written prediction are also left out. Those existing descriptive metrics read power and liveness only; their owner plans either record the lack of a prediction or list the metric as unpredicted before a later baseline. The body-gene detectors wait for their own T1/T1a.
- Running the shared run before the four detectors land would leave those plans on their own 16-seed baselines. The coordinator accepted that on 2026-11-16 (Decisions): T7 runs now, and the plans whose detectors land later get a top-up run.

### The price of the wave (T4)

Not measured: `/tmp/claude-1000/cpu.lock` was held by an eval screen for the whole of this chunk, and a timing run under load proves nothing. Run it on a quiet machine, base ref `7e1aacaa^` (the parent of the first detector PR) against head, five alternating runs each:

```
git worktree add ../bench-base 7e1aacaa^ && (cd ../bench-base && npm ci --ignore-scripts)
for i in 1 2 3 4 5; do
  flock /tmp/claude-1000/cpu.lock sh -c 'cd ../bench-base && npm run bench -- --policy map-elites-v6 --sizes=500 --json > /tmp/observe-base-'$i'.json'
  flock /tmp/claude-1000/cpu.lock npm run bench -- --policy map-elites-v6 --sizes=500 --json > /tmp/observe-head-$i.json
done
```

Compare the median `bench.observe_ms@500` of the two sets: the budget is a rise of at most 0.05 ms (0.13 ms today). Over it, a tally moves onto an existing pass or is sampled. Phase 1 is `(built)` once that reads inside the budget.

## Baseline tables (E188)

The shared run (`evals/power/defaults-floor-on-E188.json`, 128 seeds x 200000 ticks, the gorge defaults, rulesHash `38be2908ad820c86`) reads as each served plan's Baseline table through `npm run baseline:table -- --plan <doc>`. A metric marked "not registered" has no registry entry yet; a registered metric marked "not in the report" was added after E188 and waits for the detector top-up run.

### [training-stages.md](training-stages.md)

| Metric                             | Mean     | Range              | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | -------- | ------------------ | -------- | ------ | ------ | ------ | --------------------- |
| `eval.bite_on_prey_view`           | 0.9892   | 0.9542 to 0.9999   | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.patch_leave_depleted`        | 0.3945   | 0.2353 to 0.5921   | 0        | 0.075  | 0.05   | 0.05   | 32                    |
| `eval.pack_kills_per_eaten_death`  | 0.1076   | 0 to 0.1875        | 0        | 0.05   | 0.03   | 0.03   | 16                    |
| `eval.pack_lift`                   | 1.628    | 1 to 4.062         | 0.125    | 0.15   | -      | -      | more than 64          |
| `eval.chase_catch_share`           | 0.2657   | 0.155 to 0.3871    | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_shaken_share`          | 0.6328   | 0.4839 to 0.7275   | 0.007813 | 0.05   | 0.03   | -      | 16                    |
| `eval.chase_ticks_p50`             | 46.31    | 36 to 63           | 0.007813 | 0.1    | 0.1    | -      | 16                    |
| `eval.hunter_juvenile_death_share` | 0.8565   | 0.4689 to 0.9888   | 0        | 0.1    | 0.05   | 0.05   | 32                    |
| `eval.predator_presence`           | 0.5149   | 0.03141 to 0.9686  | 0        | -      | 0.2    | 0.15   | more than 64          |
| `eval.predators_at_end`            | 10.64    | 0 to 61            | 0        | -      | -      | 0.75   | more than 64          |
| `eval.chase_quit_share`            | 0.1014   | 0 to 0.2137        | 0.007813 | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_lost_share`            | 0.1481   | 0.08989 to 0.2353  | 0.007813 | 0.05   | 0.03   | -      | 16                    |
| `eval.chase_outrun_share`          | 0.1483   | 0.04286 to 0.3333  | 0.007813 | 0.05   | 0.03   | -      | 16                    |
| `eval.chase_escape_share`          | 0.3364   | 0.1679 to 0.4571   | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.pack_prey_size_ratio`        | 0.9996   | 0.9782 to 1.009    | 0.0625   | 0.1    | 0.1    | -      | 16                    |
| `eval.style_lineage_share`         | 0.009314 | 0.00004315 to 0.13 | 0.1172   | 0.03   | -      | -      | 16                    |
| `eval.hunter_zero_kill_share`      | 0.4953   | 0.4016 to 0.8889   | 0        | 0.1    | 0.075  | 0.05   | 64                    |
| `eval.escape_share`                | 0.3233   | 0.1 to 0.6596      | 0        | 0.1    | 0.075  | 0.05   | 64                    |
| `eval.herd_dodge_share`            | 0.9737   | 0.7347 to 1        | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_giveup_share`          | 0.3979   | 0.3143 to 0.5954   | 0.007813 | 0.05   | 0.03   | -      | 16                    |
| `eval.hunt_abort_rate`             | 0.3921   | 0.309 to 0.5954    | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.champion_elo`                | -        | -                  | 1        | -      | -      | -      | more than 64          |

Not registered (detector not merged): `bench.reflex_vs_drill`, `eval.dodge_skill`, `bench.step_ms`, `bench.observe_ms@500`.

### [sprint-burst.md](sprint-burst.md)

Baseline: `evals/power/defaults-floor-on-E188.json` (128 seeds, 200000 ticks)

| Metric                     | Mean | Range | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| -------------------------- | ---- | ----- | ---- | ------ | ------ | ------ | --------------------- |
| `eval.sprint_share.hunter` | -    | -     | -    | -      | -      | -      | more than 64          |
| `eval.sprint_share.prey`   | -    | -     | -    | -      | -      | -      | more than 64          |
| `eval.chase_sprint_lift`   | -    | -     | -    | -      | -      | -      | more than 64          |
| `eval.flee_sprint_lift`    | -    | -     | -    | -      | -      | -      | more than 64          |
| `eval.sprint_cost_share`   | -    | -     | -    | -      | -      | -      | more than 64          |

Not registered (detector not merged): `eval.chase_spent_share`. Registered after E188, not in the report: `eval.sprint_share.hunter`, `eval.sprint_share.prey`, `eval.chase_sprint_lift`, `eval.flee_sprint_lift`, `eval.sprint_cost_share`.

### [stillness.md](stillness.md)

| Metric | Mean | Range | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ------ | ---- | ----- | ---- | ------ | ------ | ------ | --------------------- |

Not registered (detector not merged): `eval.freeze_under_threat`, `eval.freeze_survival_gain`, `eval.ambush_kill_share`, `eval.first_sight_range.still`, `eval.first_sight_range.moving`, `eval.first_sight_range`.

### [chase-physics.md](chase-physics.md)

| Metric                              | Mean      | Range               | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ----------------------------------- | --------- | ------------------- | -------- | ------ | ------ | ------ | --------------------- |
| `eval.chase_overshoot_share`        | 0.303     | 0.1755 to 0.5151    | 0.007813 | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_cover_use_share`        | 0.00244   | 0 to 0.02           | 0.007813 | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_turn_jitter`            | 0.2151    | 0.1243 to 0.3011    | 0.007813 | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_catch_share`            | 0.2657    | 0.155 to 0.3871     | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_escape_share`           | 0.3364    | 0.1679 to 0.4571    | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.hunt_abort_rate`              | 0.3921    | 0.309 to 0.5954     | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_ticks_p50`              | 46.31     | 36 to 63            | 0.007813 | 0.1    | 0.1    | -      | 16                    |
| `eval.hunter_catches_per_1k`        | 1.29      | 0.2009 to 2.363     | 0        | 0.5    | 0.3    | 0.2    | 64                    |
| `eval.refuge_prey_use_under_threat` | -0.002745 | -0.02585 to 0.02003 | 0.007813 | 0.03   | 0.03   | -      | 16                    |

Not registered (detector not merged): `bench.step_ms@500`.

### [scent-trails.md](scent-trails.md)

| Metric                             | Mean   | Range            | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | ------ | ---------------- | -------- | ------ | ------ | ------ | --------------------- |
| `eval.chase_catch_share`           | 0.2657 | 0.155 to 0.3871  | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.hunter_income_share.carcass` | 0.1503 | 0.0872 to 0.1926 | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.hunter_juvenile_death_share` | 0.8565 | 0.4689 to 0.9888 | 0        | 0.1    | 0.05   | 0.05   | 32                    |
| `eval.chase_reacquire_share`       | -      | -                | -        | -      | -      | -      | more than 64          |
| `eval.scavenge_approach_share`     | -      | -                | -        | -      | -      | -      | more than 64          |

Registered after E188, not in the report: `eval.chase_reacquire_share`, `eval.scavenge_approach_share`. Not registered: `bench.step_ms@500`.

### [prey-guilds.md](prey-guilds.md)

| Metric                                | Mean        | Range              | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ------------------------------------- | ----------- | ------------------ | -------- | ------ | ------ | ------ | --------------------- |
| `eval.spec_effective`                 | 3.536       | 1.929 to 4.752     | 0        | 0.2    | 0.15   | 0.1    | 16                    |
| `eval.spec_dominance`                 | 0.4752      | 0.2624 to 0.8346   | 0        | 0.15   | 0.1    | 0.075  | more than 64          |
| `eval.alarm_rate`                     | 0.00002176  | 0 to 0.001621      | 0        | -      | -      | -      | more than 64          |
| `eval.defender_repel_per_1k`          | 0           | 0 to 0             | 0        | -      | -      | -      | more than 64          |
| `eval.scout_alarm_lead_share`         | 0           | 0 to 0             | 0.9922   | -      | -      | -      | more than 64          |
| `eval.reproducer_recovery_rate`       | 0.2031      | 0 to 0.8239        | 0.01563  | 0.2    | 0.15   | -      | more than 64          |
| `eval.hunt_abort_rate`                | 0.3921      | 0.309 to 0.5954    | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.pack_lift`                      | 1.628       | 1 to 4.062         | 0.125    | 0.15   | -      | -      | more than 64          |
| `eval.hunter_catches_per_1k`          | 1.29        | 0.2009 to 2.363    | 0        | 0.5    | 0.3    | 0.2    | 64                    |
| `eval.alarm_lift`                     | 0.1075      | -0.175 to 0.9584   | 0.9063   | -      | -      | -      | more than 64          |
| `eval.guild_survival.scout`           | 0.06988     | 0.03522 to 0.514   | 0        | 0.03   | 0.075  | 0.05   | 16                    |
| `eval.alarm_calls_with_threat_per_1k` | 0.000001416 | 0 to 0.0001075     | 0        | -      | -      | -      | more than 64          |
| `eval.boom_bust_count`                | 2.016       | 0 to 6             | 0        | 0.75   | 0.5    | 0.5    | more than 64          |
| `eval.pack_kills_per_eaten_death`     | 0.1076      | 0 to 0.1875        | 0        | 0.05   | 0.03   | 0.03   | 16                    |
| `eval.guild_share.forager`            | 0.23        | 0.001513 to 0.6532 | 0        | 0.2    | 0.15   | 0.1    | more than 64          |
| `eval.guild_share.reproducer`         | 0.2214      | 0.009463 to 0.8024 | 0        | 0.2    | 0.15   | 0.1    | more than 64          |
| `eval.guild_share.scout`              | 0.2732      | 0.007769 to 0.8161 | 0        | 0.2    | 0.15   | 0.1    | more than 64          |
| `eval.guild_share.defender`           | 0.2382      | 0.01898 to 0.7223  | 0        | 0.2    | 0.15   | 0.075  | more than 64          |
| `eval.guild_survival.forager`         | 0.06933     | 0.02862 to 0.1274  | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.guild_survival.reproducer`      | 0.06756     | 0.0286 to 0.1294   | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.guild_survival.defender`        | 0.06846     | 0.03588 to 0.1125  | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.prey_selectivity.forager`       | -           | -                  | -        | -      | -      | -      | more than 64          |
| `eval.prey_selectivity.reproducer`    | -           | -                  | -        | -      | -      | -      | more than 64          |
| `eval.prey_selectivity.scout`         | -           | -                  | -        | -      | -      | -      | more than 64          |
| `eval.prey_selectivity.defender`      | -           | -                  | -        | -      | -      | -      | more than 64          |

Not registered: `bench.step_ms@500`.
Not in E188: `eval.prey_selectivity.forager`, `eval.prey_selectivity.reproducer`, `eval.prey_selectivity.scout`, `eval.prey_selectivity.defender`.

### [body-genes.md](body-genes.md)

| Metric                             | Mean    | Range               | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | ------- | ------------------- | -------- | ------ | ------ | ------ | --------------------- |
| `eval.trait_spread`                | 0.01026 | 0.003587 to 0.02119 | 0        | 0.5    | 0.3    | 0.2    | 64                    |
| `eval.chase_catch_share`           | 0.2657  | 0.155 to 0.3871     | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_escape_share`          | 0.3364  | 0.1679 to 0.4571    | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.predator_presence`           | 0.5149  | 0.03141 to 0.9686   | 0        | -      | 0.2    | 0.15   | more than 64          |
| `eval.predators_at_end`            | 10.64   | 0 to 61             | 0        | -      | -      | 0.75   | more than 64          |
| `eval.hunter_catches_per_1k`       | 1.29    | 0.2009 to 2.363     | 0        | 0.5    | 0.3    | 0.2    | 64                    |
| `eval.hunter_juvenile_death_share` | 0.8565  | 0.4689 to 0.9888    | 0        | 0.1    | 0.05   | 0.05   | 32                    |
| `eval.bite_on_prey_view`           | 0.9892  | 0.9542 to 0.9999    | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.spec_effective`              | 3.536   | 1.929 to 4.752      | 0        | 0.2    | 0.15   | 0.1    | 16                    |

Not registered (detector not merged): `eval.trait_spread.carnivory`, `eval.trait_spread.bulk`, `eval.trait_bimodality.carnivory`, `eval.trait_brain_alignment`, `bench.step_ms@500`.

## Keeping it current

A baseline describes one set of rules. `npm run baseline:status` (`scripts/baseline-status.mjs`) prints the newest shared report's `rulesHash` beside the default config's. A plan cites the shared baseline only while the two match. A screen's own control arm is always run fresh on matched seeds, so a stale baseline never decides a verdict; it only dates a prediction. The run is repeated when a season that changes `rulesHash` is released, not on every change.

## Phases

### Phase 1 - The taxonomy and the wave

**Targets:** none - detectors only; `worldHash` and the golden cases are unchanged

`js/evo/chase-outcome.js`, the move of the existing chase metrics onto it with their values unchanged on the committed reports, and the detector tasks of the seven plans.

#### Chunks

| Chunk | Tasks  | Holds                                                    |
| ----- | ------ | -------------------------------------------------------- |
| A     | T1, T2 | The chase record and the existing metrics on it (Sonnet) |
| B     | T3, T4 | The wave's check, the observer price and the review      |

Chunk B (2026-11-16): T3 and the conformance review are done; the T4 benchmark is deferred, so Phase 1 is not marked built.

### Phase 2 - The shared run

**Targets:** none - a baseline of the defaults; no arm is compared

The run, the power and liveness read, and each plan's Baseline table.

#### Chunks

| Chunk | Tasks    | Holds                                                        |
| ----- | -------- | ------------------------------------------------------------ |
| C     | T5, T6   | `baseline:table`, `baseline:status` and their tests (Sonnet) |
| D     | T7 to T9 | The run, the readings, the plan tables and the review (runs) |

## Decisions

| Decision                                                        | Why                                                                                                                                                                                                                                                                                      | Who                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| One 128-seed baseline serves seven plans                        | Seven 16-seed runs cost about as many ticks, land on different seasons, and cannot give a new metric its power                                                                                                                                                                           | Delegated (planning, 2026-11-15)             |
| One module owns the chase record                                | Three plans classify one event; shares from three modules do not sum                                                                                                                                                                                                                     | Delegated (planning, 2026-11-15)             |
| Detector tasks may be built ahead of their plan's rank          | They change no behaviour, and a detector is checked before the sim is blamed (`run-evolution-loop`)                                                                                                                                                                                      | Delegated (planning, 2026-11-15)             |
| A plan with no written prediction is left out of the read       | A prediction written after the numbers is not one                                                                                                                                                                                                                                        | Planner, from run-evolution-loop             |
| A stale baseline dates a prediction and never decides a verdict | Every screen runs its own control on matched seeds                                                                                                                                                                                                                                       | Delegated (planning, 2026-11-15)             |
| The wave has an observer budget                                 | About 40 new metrics arrive together; `bench.observe_ms` is paid by every eval, screen and training episode                                                                                                                                                                              | Delegated (planning, 2026-11-15)             |
| T7 runs on the season 10 defaults before the four unbuilt plans | The hunter-vision defaults are final (PR 464), so the baseline reads the defaults that season 10 ships. Waiting for four detector plans would leave the 128-seed reference unmade; the four plans take a top-up run on the same defaults, and their metrics read `unverified` until then | Coordinator (2026-11-16), recorded by lane C |
| Do not invent predictions after E188 for descriptive metrics    | E188 is complete; each owning plan records which metrics have no baseline prediction, and reads their power and liveness without treating a post-hoc guess as evidence                                                                                                                   | Coordinator (2026-11-17)                     |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/chase-outcome.js` (the record and its end classes), read by `js/evo/scene-approach.js` and the chase modules of the served plans; `scripts/baseline-table.mjs`, `scripts/baseline-status.mjs`. No sim-core, worker, renderer or UI change     |
| Unit tests              | `test/evo/chase-outcome.test.js` (each end class and flag on a hand-built chase; a lost then re-acquired chase is one record; the end classes sum to the chases); `test/baseline-table.test.js` and `test/baseline-status.test.js` on fixture reports |
| Headless e2e            | The golden hashes and `eval-smoke` are unchanged. `eval.chase_catch_share`, `eval.chase_escape_share`, `eval.chase_giveup_share` and `eval.hunt_abort_rate` read the same values on a committed report's seeds before and after the move              |
| Performance budget      | `bench.observe_ms@500` rises by at most 0.05 ms over the wave, read on a base-ref and a head run of `npm run bench -- --policy map-elites-v6` under the CPU lock                                                                                      |
| Evolution metrics       | N/A - a baseline, not a comparison; the output is the power and liveness of each new metric in the registry                                                                                                                                           |
| Determinism             | No RNG stream. The run uses `evals/seeds.json` entries 1 to 128, as `E150` did                                                                                                                                                                        |
| Config and persistence  | No `createConfig` key. New files: the two reports under `evals/power/` and `evals/decisions/<id>/`, with the saved champions                                                                                                                          |
| Logging and diagnostics | `baseline:status` exits 1 and names both hashes when they differ. A chase record that fits no end class throws in the observer's tests, not in a run                                                                                                  |
| Browser compatibility   | N/A - Node tools and observer code; the lean observer of the app worker ([lean-observer.md](lean-observer.md)) does not load the scene modules                                                                                                        |
| Docs                    | `AGENTS.md` rows for `baseline:table` and `baseline:status`; `node scripts/metrics-doc.mjs --write`; each served plan's Baseline table; one [sim-notes.md](sim-notes.md) entry for the run                                                            |
| Verification            | `scripts/check.sh` green per chunk PR, and the steps under Verification                                                                                                                                                                               |

## Task breakdown

### Phase 1 - The taxonomy and the wave

| #   | Task                                                                                                                                                                                                                                                                                               | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/chase-outcome.js` and its tests; move the four existing chase metrics onto it with their values unchanged on a committed report's seeds. Built: `scene-approach.js` tallies each chase on the record; the four metrics read the same on a 4-seed replay                                | [judgement]  | -          |
| T2  | Point the chase tasks of [training-stages.md](training-stages.md) T1, [chase-physics.md](chase-physics.md) T1 and [scent-trails.md](scent-trails.md) T1 at the record: one line in each task row, no new module. Built, with `scene-kinematics.js` (built ahead of this doc) moved onto the record | [mechanical] | T1         |
| T3  | (built) When the seven plans' detector tasks are merged, check each new metric has its registry entry, tests and a written baseline prediction; list any plan left out of the read. Result under Wave check; it re-runs when body-genes' detectors land                                            | [mechanical] | T2         |
| T4  | Price the wave (`bench.observe_ms@500`, base ref against head) - benchmark deferred, see Wave check; the conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`, is done                                                                                              | [judgement]  | T3         |

### Phase 2 - The shared run

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T5  | (built) Add `scripts/baseline-table.mjs` and `npm run baseline:table`, with a test on a fixture report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [mechanical] | -          |
| T6  | (built) Add `scripts/baseline-status.mjs` and `npm run baseline:status`, with a test of a matching and a differing `rulesHash`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [mechanical] | -          |
| T7  | (done 2026-11-16 on the season 10 defaults, `E187`, and re-recorded 2026-11-17 on the gorge defaults as `E188` (PR 481; PR 478 fixed `eval.pack_prey_size_ratio`, now non-null on 120 of 128 floor-on seeds), reports in evals/power/ and evals/decisions/E187/ and E188/; the tables, power and liveness below read `E188`; the four plans with no detector merged get a top-up run later; `npm run baseline:status` names the hash) Run the baseline: 128 floor-on and 128 floor-off seeds x 200000 ticks, `--save-champions 2`; commit the reports; record the experiment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | [mechanical] | T4         |
| T8  | Run `eval:power --include-watch` and `metric:liveness` for every new metric; write the readings to the registry; regenerate [metrics.md](metrics.md); fill each served plan's Baseline table. Power and liveness from `E188` (`evals/power/defaults-floor-on-E188.json`) are written by T8a (the 12 liveness misses are triaged there)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [mechanical] | T5, T7     |
| T8a | (built) Triage the 12 liveness misses of `E188` and write power and liveness from it. Liveness (`metric-liveness --write` on the floor-on report): every miss gets `expectedFlat` with its event count; none is a detector bug. The two flora metrics (`eval.flora_patch_death_rate`, `eval.flora_seed_bank_occupancy_share`) are 0 on all 128 seeds, the intended value (no PatchDied); `eval.scout_alarm_lead_share` is live on 1 seed (alarm calls with a threat on 3); `eval.hunter_kill_rate_by_age.adult` and `eval.hunter_kill_rate_by_source.mate-hunter-parent` are live on 100, `eval.recruit_replaced_share.mate-hunter-parent` on 84, `eval.recruit_replaced_share.floor` on 25, `eval.bite_wish_with_other_in_jaws` on 106, `eval.pack_lift` on 112, `eval.style_lineage_share` on 113, `eval.refuge_crowding` on 107 and `eval.leak_flee_corr` on 109 (each a sample threshold or a rare birth source the defaults seldom reach). `eval.pack_prey_size_ratio` is live on 120 (the PR 478 fix). Power: `eval:power --include-watch --sizes 16,32,64` (the default sizes are 16 and 32, which is why E187 had no 64-seed power for any metric, `eval.hunter_catches_per_1k` included; it now reads MDE 0.5, 0.3 and 0.2 at 16, 32 and 64 seeds, false-positive rate 0.072 at 64), written with `metric-power-write --report`; the pinned tests were re-pinned only where the shift is the new data | [judgement]  | T8         |
| T9  | Read each plan's prediction against the table and write its verdict in that plan; conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T6, T8     |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: the four existing chase metrics read the same on a committed report's seeds, and `npm run bench -- --policy map-elites-v6` shows the observer inside its budget.
3. Phase 2: `npm run baseline:status` exits 0, `npm run baseline:table -- --plan sprint-burst` prints that plan's metrics with their power, and [metrics.md](metrics.md) lists the new metrics with a status.
