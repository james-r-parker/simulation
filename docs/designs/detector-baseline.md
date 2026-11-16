# Detector baseline

**Status:** In progress - Phase 1 chunks A and B are built except the wave's `bench.observe_ms@500` price (T4: deferred while an eval screen holds the CPU lock; command under Wave check); the wave itself is not complete, since four of the seven plans have no detector merged; T7 runs now on the season 10 defaults (`E187`, the coordinator's decision of 2026-11-16: the four unbuilt detector plans get a top-up run later, on the same defaults); the measure-first plans share one chase-outcome taxonomy, one detector wave and one 128-seed baseline of the defaults, in place of seven separate 16-seed runs.
**Validated:** ed662529 (2026-11-15)
**Priority:** 34 - it schedules no work of its own ahead of the queue: its tasks run when the Phase 1 detector tasks of the plans it serves are built, and those change no behaviour
**Depends on:** [metric-trust.md](metric-trust.md)

Seven plans open with the same step: add detectors, then run 16 seeds of the defaults and read `npm run eval:power`. Run apart, that is seven baselines of one world on different days and seasons, each too small to give a new metric its power (the registry's power comes from 128 seeds, `evals/power/defaults-floor-on-E150.json`). Three of the plans also classify how a chase ends, each in its own module. This doc makes the baseline one run and the chase outcome one taxonomy. It changes no sim behaviour and adds no reward.

## The plans served

| Plan                                     | Detector task | Baseline task and record | New `eval.*` names |
| ---------------------------------------- | ------------- | ------------------------ | ------------------ |
| [training-stages.md](training-stages.md) | T1, T2, T3    | T5, `E-TS-0`             | 11                 |
| [sprint-burst.md](sprint-burst.md)       | T2            | T3, `E-SB-1`             | 5                  |
| [stillness.md](stillness.md)             | T1            | T2, `E-ST-1`             | 3                  |
| [chase-physics.md](chase-physics.md)     | T1            | T2, `E-CP-1`             | 3                  |
| [scent-trails.md](scent-trails.md)       | T1            | T2, `E-ST2-1`            | 2                  |
| [prey-guilds.md](prey-guilds.md)         | T1            | T2, `E-PG-1`             | 12                 |
| [body-genes.md](body-genes.md)           | T1, T1a       | T2, `E-BG-1`             | 4                  |

The signal census of [senses-and-motor.md](senses-and-motor.md) (T10) samples the same worlds and reads the shared run's saved champions.

## One chase taxonomy

`trackApproaches` in `js/evo/scene-approach.js` resolves a chase as caught, escaped or lapsed. Three plans split or extend that outcome:

| Plan                                     | Adds                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| [training-stages.md](training-stages.md) | A lapse is quit, lost or outrun; chase ticks                                  |
| [chase-physics.md](chase-physics.md)     | Overshoot (the range re-opens after its minimum); a chase that crossed cover  |
| [scent-trails.md](scent-trails.md)       | Re-acquired (sight lost, the same prey found again inside `REACQUIRE_WINDOW`) |

Built apart, a chase that is lost and then re-acquired is counted as two chases by one module and one by another, and the shares stop summing. `js/evo/chase-outcome.js` (new) owns one record per chase: its opening tick, its end class and its flags. As built (chunk A) there are three end classes (caught, escaped, gave up); a lapse is split by the `LAPSE_LOST` and `LAPSE_OUTRUN` flags, and a gave-up chase with neither is a quit. The other flags are overshot, crossed cover, re-acquired, sprinted and prey still at first sight; `REACQUIRED`, `SPRINTED` and `PREY_AT_FIRST_SIGHT` are defined and tested but set by no code yet, reserved for the unbuilt scent-trails and sprint-burst detectors. The record keeps counts, not a resolving tick (the length of a chase is fed to `noteChaseLength` apart). Every chase metric of the three plans, and the sprint and stillness chase reads, is a count over those records. The end classes partition the chases; the flags do not. A re-acquired chase is one chase.

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

Read on 2026-11-16 against `main` at 0819058e (T3). The wave's first merged detector PR is #445 (prey-guilds T1, 7e1aacaa), so the base ref of the price is `7e1aacaa^`. It added 23 new metrics (`eval.herd_dodge_share` is a rename of the verified `eval.dodge_skill`, so it is not counted).

| Plan                                     | Detector task | Merged        | Metrics in the registry                                                                                                                                                                                   | Missing                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [training-stages.md](training-stages.md) | T1, T2, T3    | Yes (#458)    | 11 of 11: `chase_{quit,lost,outrun,shaken}_share`, `chase_ticks_p{50,90}`, `pack_lift`, `pack_prey_size_ratio`, `style_lineage_share`, the renamed `herd_dodge_share`, `hunter_zero_kill_share` (changed) | `E-TS-0` predicts `chase_lost_share`, `chase_quit_share` and `pack_lift` only: no prediction for `chase_outrun_share`, `chase_shaken_share`, `chase_ticks_p50`, `chase_ticks_p90`, `pack_prey_size_ratio`, `style_lineage_share` |
| [chase-physics.md](chase-physics.md)     | T1            | Yes (#449)    | 3 of 3                                                                                                                                                                                                    | The prediction (premise section) covers `chase_turn_jitter` only: none for `chase_overshoot_share`, `chase_cover_use_share`                                                                                                      |
| [prey-guilds.md](prey-guilds.md)         | T1            | Partly (#445) | 11 of 15 (the four `prey_selectivity.*` are missing; the plans-served count of 12 is stale)                                                                                                               | `eval.prey_selectivity.<spec>` is not built, though the T1 row says built; `E-PG-1` predicts it. No prediction for `guild_share.*`, `reproducer_recovery_rate`. Row T1b added in that plan                                       |
| [sprint-burst.md](sprint-burst.md)       | T2            | No            | 0 of 5                                                                                                                                                                                                    | `js/evo/scene-sprint.js` not built. Prediction written (`E-SB-1`)                                                                                                                                                                |
| [stillness.md](stillness.md)             | T1            | No            | 0 of 3                                                                                                                                                                                                    | `js/evo/scene-stillness.js` not built. Prediction written (`E-ST-1`)                                                                                                                                                             |
| [scent-trails.md](scent-trails.md)       | T1            | No            | 0 of 2                                                                                                                                                                                                    | `js/evo/scene-scent.js` not built. Prediction written (`E-ST2-1`)                                                                                                                                                                |
| [body-genes.md](body-genes.md)           | T1, T1a       | No            | 0 of 3                                                                                                                                                                                                    | `js/evo/scene-traits.js` and `js/evo/transplant-probe.js` not built. `E-BG-1` predicts the transplant gap only, not the three `eval.trait_*` metrics                                                                             |

What the table shows:

- Every merged metric has its entry, its arithmetic test and its source test: `test/evo/metric-registry.test.js` fails an entry without them, and it passes. No registry gap needed a fix in this chunk.
- None of the 23 new metrics has a `liveness` or `power` read yet, as expected: those are T8, after the shared run. Eighteen are `watch`, each with an `intended` direction (`eval:power --include-watch` needs it).
- Left out of the read: the four plans with no detector merged (sprint-burst, stillness, scent-trails, body-genes), and, per metric, the metrics named above without a written prediction. A prediction-less metric is read for its power and liveness only, and the plan that owns it writes the prediction before T7 starts or accepts that it has none. Writing them is the owning plan's task, not built here.
- Running the shared run before the four detectors land would leave those plans on their own 16-seed baselines. The coordinator accepted that on 2026-11-16 (Decisions): T7 runs now, and the four plans get a top-up run.

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

## Baseline tables (E187)

The shared run (`evals/power/defaults-floor-on-E187.json`, 128 seeds x 200000 ticks, the season 10 defaults) read as each served plan's Baseline table by `npm run baseline:table -- --plan <doc>`. The tables sit here rather than in the plan docs, so this PR does not edit the plans. A metric marked "not registered" is named in its plan but has no registry entry yet: its detector is not merged, and its top-up run is later.

### [training-stages.md](training-stages.md)

| Metric                             | Mean     | Range                 | Null    | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | -------- | --------------------- | ------- | ------ | ------ | ------ | --------------------- |
| `eval.bite_on_prey_view`           | 0.9878   | 0.8949 to 0.9995      | 0       | 0.03   | 0.03   | -      | 16                    |
| `eval.patch_leave_depleted`        | 0.4069   | 0.2624 to 0.6618      | 0       | 0.1    | 0.075  | -      | more than 64          |
| `eval.pack_kills_per_eaten_death`  | 0.1104   | 0 to 0.175            | 0       | 0.03   | 0.03   | -      | 16                    |
| `eval.pack_lift`                   | 1.779    | 1 to 3.689            | 0.1563  | 0.05   | -      | -      | 16                    |
| `eval.chase_catch_share`           | 0.2647   | 0 to 0.3941           | 0       | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_shaken_share`          | 0.6381   | 0.5 to 1              | 0       | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_ticks_p50`             | 45.95    | 39 to 55              | 0       | 0.1    | 0.1    | -      | 16                    |
| `eval.hunter_juvenile_death_share` | 0.8587   | 0.5203 to 0.956       | 0       | 0.075  | 0.05   | -      | 32                    |
| `eval.predator_presence`           | 0.5191   | 0.02618 to 1          | 0       | -      | 0.2    | -      | more than 64          |
| `eval.predators_at_end`            | 10.75    | 0 to 69               | 0       | -      | -      | -      | more than 64          |
| `eval.chase_quit_share`            | 0.09722  | 0 to 0.1722           | 0       | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_lost_share`            | 0.1558   | 0.08155 to 0.6667     | 0       | 0.05   | 0.1    | -      | more than 64          |
| `eval.chase_outrun_share`          | 0.1441   | 0 to 0.25             | 0       | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_escape_share`          | 0.3381   | 0.125 to 0.455        | 0       | 0.05   | 0.05   | -      | 16                    |
| `eval.pack_prey_size_ratio`        | -        | -                     | 1       | -      | -      | -      | more than 64          |
| `eval.style_lineage_share`         | 0.007872 | 0.000004284 to 0.1084 | 0.09375 | 0.03   | -      | -      | 16                    |
| `eval.hunter_zero_kill_share`      | 0.519    | 0.4322 to 1           | 0       | 0.075  | 0.075  | -      | more than 64          |
| `eval.escape_share`                | 0.3184   | 0.08333 to 0.6064     | 0       | 0.1    | 0.075  | -      | more than 64          |
| `eval.herd_dodge_share`            | 0.9827   | 0.8842 to 1           | 0       | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_giveup_share`          | 0.3971   | 0.3164 to 0.6667      | 0       | 0.05   | 0.05   | -      | 16                    |
| `eval.hunt_abort_rate`             | 0.3912   | 0.309 to 0.6667       | 0       | 0.05   | 0.05   | -      | 16                    |
| `eval.champion_elo`                | -        | -                     | 1       | -      | -      | -      | more than 64          |

Not registered (detector not merged): `eval.dodge_skill`, `bench.step_ms`, `bench.observe_ms@500`.

### [sprint-burst.md](sprint-burst.md)

| Metric | Mean | Range | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ------ | ---- | ----- | ---- | ------ | ------ | ------ | --------------------- |

Not registered (detector not merged): `eval.sprint_share.hunter`, `eval.sprint_share.prey`, `eval.chase_sprint_lift`, `eval.flee_sprint_lift`, `eval.sprint_cost_share`, `eval.chase_spent_share`.

### [stillness.md](stillness.md)

| Metric | Mean | Range | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ------ | ---- | ----- | ---- | ------ | ------ | ------ | --------------------- |

Not registered (detector not merged): `eval.freeze_under_threat`, `eval.freeze_survival_gain`, `eval.ambush_kill_share`, `eval.first_sight_range.still`, `eval.first_sight_range.moving`, `eval.first_sight_range`.

### [chase-physics.md](chase-physics.md)

| Metric                              | Mean      | Range               | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ----------------------------------- | --------- | ------------------- | ---- | ------ | ------ | ------ | --------------------- |
| `eval.chase_overshoot_share`        | 0.3083    | 0.1832 to 0.6667    | 0    | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_cover_use_share`        | 0.002006  | 0 to 0.01547        | 0    | 0.03   | 0.03   | -      | 16                    |
| `eval.chase_turn_jitter`            | 0.2133    | 0.1479 to 0.5026    | 0    | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_catch_share`            | 0.2647    | 0 to 0.3941         | 0    | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_escape_share`           | 0.3381    | 0.125 to 0.455      | 0    | 0.05   | 0.05   | -      | 16                    |
| `eval.hunt_abort_rate`              | 0.3912    | 0.309 to 0.6667     | 0    | 0.05   | 0.05   | -      | 16                    |
| `eval.chase_ticks_p50`              | 45.95     | 39 to 55            | 0    | 0.1    | 0.1    | -      | 16                    |
| `eval.hunter_catches_per_1k`        | 1.198     | 0.242 to 2.132      | 0    | 0.3    | 0.3    | -      | more than 64          |
| `eval.refuge_prey_use_under_threat` | -0.002595 | -0.0289 to 0.006288 | 0    | 0.03   | 0.03   | -      | 16                    |

Not registered (detector not merged): `bench.step_ms@500`.

### [scent-trails.md](scent-trails.md)

| Metric                             | Mean     | Range           | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | -------- | --------------- | ---- | ------ | ------ | ------ | --------------------- |
| `eval.chase_catch_share`           | 0.2647   | 0 to 0.3941     | 0    | 0.075  | 0.05   | -      | 32                    |
| `eval.hunter_income_share.carcass` | 0.004049 | 0 to 0.06184    | 0    | 0.03   | 0.03   | -      | 16                    |
| `eval.hunter_juvenile_death_share` | 0.8587   | 0.5203 to 0.956 | 0    | 0.075  | 0.05   | -      | 32                    |

Not registered (detector not merged): `eval.chase_reacquire_share`, `eval.scavenge_approach_share`, `bench.step_ms@500`.

### [prey-guilds.md](prey-guilds.md)

| Metric                                | Mean        | Range              | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ------------------------------------- | ----------- | ------------------ | -------- | ------ | ------ | ------ | --------------------- |
| `eval.spec_effective`                 | 3.507       | 1.875 to 4.829     | 0        | 0.2    | 0.15   | -      | 16                    |
| `eval.spec_dominance`                 | 0.4778      | 0.2672 to 0.8256   | 0        | 0.15   | 0.1    | -      | more than 64          |
| `eval.alarm_rate`                     | 0.00001636  | 0 to 0.001674      | 0        | -      | -      | -      | more than 64          |
| `eval.defender_repel_per_1k`          | 0           | 0 to 0             | 0        | -      | -      | -      | more than 64          |
| `eval.scout_alarm_lead_share`         | 0.1111      | 0 to 0.2222        | 0.9844   | -      | -      | -      | more than 64          |
| `eval.reproducer_recovery_rate`       | 0.1882      | 0 to 0.7782        | 0.007813 | 0.2    | 0.15   | -      | more than 64          |
| `eval.hunt_abort_rate`                | 0.3912      | 0.309 to 0.6667    | 0        | 0.05   | 0.05   | -      | 16                    |
| `eval.pack_lift`                      | 1.779       | 1 to 3.689         | 0.1563   | 0.05   | -      | -      | 16                    |
| `eval.hunter_catches_per_1k`          | 1.198       | 0.242 to 2.132     | 0        | 0.3    | 0.3    | -      | more than 64          |
| `eval.alarm_lift`                     | 0.07447     | -0.04427 to 0.8373 | 0.9141   | -      | -      | -      | more than 64          |
| `eval.guild_survival.scout`           | 0.06444     | 0.03563 to 0.152   | 0        | 0.03   | 0.03   | -      | 16                    |
| `eval.alarm_calls_with_threat_per_1k` | 0.000002492 | 0 to 0.0002743     | 0        | 1      | -      | -      | 16                    |
| `eval.boom_bust_count`                | 2.195       | 0 to 8             | 0        | 0.75   | 0.75   | -      | more than 64          |
| `eval.pack_kills_per_eaten_death`     | 0.1104      | 0 to 0.175         | 0        | 0.03   | 0.03   | -      | 16                    |

Not registered (detector not merged): `eval.prey_selectivity.defender`, `bench.step_ms@500`.

### [body-genes.md](body-genes.md)

| Metric                             | Mean     | Range               | Null | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | -------- | ------------------- | ---- | ------ | ------ | ------ | --------------------- |
| `eval.trait_spread`                | 0.009952 | 0.003226 to 0.02302 | 0    | 0.5    | 0.3    | -      | 16                    |
| `eval.chase_catch_share`           | 0.2647   | 0 to 0.3941         | 0    | 0.075  | 0.05   | -      | 32                    |
| `eval.chase_escape_share`          | 0.3381   | 0.125 to 0.455      | 0    | 0.05   | 0.05   | -      | 16                    |
| `eval.predator_presence`           | 0.5191   | 0.02618 to 1        | 0    | -      | 0.2    | -      | more than 64          |
| `eval.predators_at_end`            | 10.75    | 0 to 69             | 0    | -      | -      | -      | more than 64          |
| `eval.hunter_catches_per_1k`       | 1.198    | 0.242 to 2.132      | 0    | 0.3    | 0.3    | -      | more than 64          |
| `eval.hunter_juvenile_death_share` | 0.8587   | 0.5203 to 0.956     | 0    | 0.075  | 0.05   | -      | 32                    |
| `eval.bite_on_prey_view`           | 0.9878   | 0.8949 to 0.9995    | 0    | 0.03   | 0.03   | -      | 16                    |
| `eval.spec_effective`              | 3.507    | 1.875 to 4.829      | 0    | 0.2    | 0.15   | -      | 16                    |

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
| T3  | (built) When the seven plans' detector tasks are merged, check each new metric has its registry entry, tests and a written baseline prediction; list any plan left out of the read. Result under Wave check; it re-runs when the four missing plans' detectors land                                | [mechanical] | T2         |
| T4  | Price the wave (`bench.observe_ms@500`, base ref against head) - benchmark deferred, see Wave check; the conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`, is done                                                                                              | [judgement]  | T3         |

### Phase 2 - The shared run

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T5  | (built) Add `scripts/baseline-table.mjs` and `npm run baseline:table`, with a test on a fixture report                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [mechanical] | -          |
| T6  | (built) Add `scripts/baseline-status.mjs` and `npm run baseline:status`, with a test of a matching and a differing `rulesHash`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [mechanical] | -          |
| T7  | (done 2026-11-16 on the season 10 defaults, `E187`, reports in evals/power/ and evals/decisions/E187/; the four plans with no detector merged get a top-up run later; `npm run baseline:status` names the hash) Run the baseline: 128 floor-on and 128 floor-off seeds x 200000 ticks, `--save-champions 2`; commit the reports; record the experiment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [mechanical] | T4         |
| T8  | Run `eval:power --include-watch` and `metric:liveness` for every new metric; write the readings to the registry; regenerate [metrics.md](metrics.md); fill each served plan's Baseline table. Liveness from E187 (`evals/power/defaults-floor-on-E187.json`) is read, but not written in this PR: the 12 misses are split out as T8a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [mechanical] | T5, T7     |
| T8a | Triage the 12 liveness misses of E187 (`npm run metric:liveness` on the floor-on report): 2 flora metrics expected flat (`eval.flora_patch_death_rate` and `eval.flora_seed_bank_occupancy_share`, 0 on every seed, the intended value); 10 rare-event metrics or suspected detector bugs (`eval.pack_prey_size_ratio` null on 128 of 128 seeds while `eval.pack_lift` is live on 108; `eval.scout_alarm_lead_share` null on 126). Each gets an event count against its null share: `expectedFlat` where the event is rare, a detector fix routed where the event happens while the metric is null Also to do, split from this PR: write power from E187 (`evals/power/defaults-floor-on-E187.json`, `metric-power-write --report`) and decide each pinned test: re-pin the generated expectations (power.test.js, index.test.js minSeedsFor, compare.test.js verdicts) only where the shift is the new data, and investigate why `eval.hunter_catches_per_1k` has no 64-seed power on E187 (a keep-rule guard must keep its power). | [judgement]  | T8         |
| T9  | Read each plan's prediction against the table and write its verdict in that plan; conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [judgement]  | T6, T8     |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: the four existing chase metrics read the same on a committed report's seeds, and `npm run bench -- --policy map-elites-v6` shows the observer inside its budget.
3. Phase 2: `npm run baseline:status` exits 0, `npm run baseline:table -- --plan sprint-burst` prints that plan's metrics with their power, and [metrics.md](metrics.md) lists the new metrics with a status.
