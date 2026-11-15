# Detector baseline

**Status:** Proposed - the measure-first plans share one chase-outcome taxonomy, one detector wave and one 128-seed baseline of the defaults, in place of seven separate 16-seed runs; Phase 1 (the taxonomy and the wave) is first.
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

Built apart, a chase that is lost and then re-acquired is counted as two chases by one module and one by another, and the shares stop summing. `js/evo/chase-outcome.js` (new) owns one record per chase: its opening and resolving ticks, its end class (caught, escaped, quit, lost, outrun), and its flags (overshot, crossed cover, re-acquired, sprinted, prey still at first sight). Every chase metric of the three plans, and the sprint and stillness chase reads, is a count over those records. The end classes partition the chases; the flags do not. A re-acquired chase is one chase.

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

### Phase 2 - The shared run

**Targets:** none - a baseline of the defaults; no arm is compared

The run, the power and liveness read, and each plan's Baseline table.

#### Chunks

| Chunk | Tasks    | Holds                                                        |
| ----- | -------- | ------------------------------------------------------------ |
| C     | T5, T6   | `baseline:table`, `baseline:status` and their tests (Sonnet) |
| D     | T7 to T9 | The run, the readings, the plan tables and the review (runs) |

## Decisions

| Decision                                                        | Why                                                                                                            | Who                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| One 128-seed baseline serves seven plans                        | Seven 16-seed runs cost about as many ticks, land on different seasons, and cannot give a new metric its power | Delegated (planning, 2026-11-15) |
| One module owns the chase record                                | Three plans classify one event; shares from three modules do not sum                                           | Delegated (planning, 2026-11-15) |
| Detector tasks may be built ahead of their plan's rank          | They change no behaviour, and a detector is checked before the sim is blamed (`run-evolution-loop`)            | Delegated (planning, 2026-11-15) |
| A plan with no written prediction is left out of the read       | A prediction written after the numbers is not one                                                              | Planner, from run-evolution-loop |
| A stale baseline dates a prediction and never decides a verdict | Every screen runs its own control on matched seeds                                                             | Delegated (planning, 2026-11-15) |
| The wave has an observer budget                                 | About 40 new metrics arrive together; `bench.observe_ms` is paid by every eval, screen and training episode    | Delegated (planning, 2026-11-15) |

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

| #   | Task                                                                                                                                                                                                            | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/chase-outcome.js` and its tests; move the four existing chase metrics onto it with their values unchanged on a committed report's seeds                                                             | [judgement]  | -          |
| T2  | Point the chase tasks of [training-stages.md](training-stages.md) T1, [chase-physics.md](chase-physics.md) T1 and [scent-trails.md](scent-trails.md) T1 at the record: one line in each task row, no new module | [mechanical] | T1         |
| T3  | When the seven plans' detector tasks are merged, check each new metric has its registry entry, tests and a written baseline prediction; list any plan left out of the read                                      | [mechanical] | T2         |
| T4  | Price the wave (`bench.observe_ms@500`, base ref against head); conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                             | [judgement]  | T3         |

### Phase 2 - The shared run

| #   | Task                                                                                                                                                                                         | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T5  | Add `scripts/baseline-table.mjs` and `npm run baseline:table`, with a test on a fixture report                                                                                               | [mechanical] | -          |
| T6  | Add `scripts/baseline-status.mjs` and `npm run baseline:status`, with a test of a matching and a differing `rulesHash`                                                                       | [mechanical] | -          |
| T7  | Run the baseline: 128 floor-on and 128 floor-off seeds x 200000 ticks, `--save-champions 2`; commit the reports; record the experiment                                                       | [mechanical] | T4         |
| T8  | Run `eval:power --include-watch` and `metric:liveness` for every new metric; write the readings to the registry; regenerate [metrics.md](metrics.md); fill each served plan's Baseline table | [mechanical] | T5, T7     |
| T9  | Read each plan's prediction against the table and write its verdict in that plan; conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line  | [judgement]  | T6, T8     |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: the four existing chase metrics read the same on a committed report's seeds, and `npm run bench -- --policy map-elites-v6` shows the observer inside its budget.
3. Phase 2: `npm run baseline:status` exits 0, `npm run baseline:table -- --plan sprint-burst` prints that plan's metrics with their power, and [metrics.md](metrics.md) lists the new metrics with a status.
