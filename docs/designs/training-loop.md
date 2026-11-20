# Training loop

**Status:** In progress - Phases 1 and 2 built (T1 to T12); Phase 3 and Phase 4 code built; adaptive difficulty is untested (E207 never left its floor, E251 stopped on a validation error; T16b, T16c); the tuning nights read no verdict (E208, E209, E230, E231); Phase 5 (verdict power and trainer throughput, T24 to T28) is next.
**Validated:** 0254883d (2026-11-19)
**Priority:** 4 - Training lead. A ladder change cannot be judged (every `train:compare` read is `no verdict`) and a run's workers are 35 to 45% busy; Phase 5 fixes both before the next ladder screen, which is fair-chase.md Phase 2
**Depends on:** [training-stages.md](training-stages.md), [training.md](training.md)

> Companion to [training-stages.md](training-stages.md), which holds the stages, gates, reviews and the exam. This doc owns how a ladder run is scored, when it stops, and how the ladder itself is improved.

A ladder run is an experiment on the training process. Each run gets one score, its yield. Two ladders are compared on matched offsets, the way `eval:compare` compares two worlds. A gated stage reads a graded progress series beside its pass bar, so a run shows it is closing on a lesson before it passes. A stage whose progress stops rising ends early. A rung is checked for learnability before a ladder spends hours on it. A stage's prey difficulty follows the population. A nightly lane screens trainer settings on tuning offsets, confirms a winner on held-out offsets, and carries its champions into a world trial. Nothing here enters fitness, merit, mate rank or archive rank, and no gate's pass bar moves.

## Order

This doc is a lead: it holds a rank in the Build queue, and the docs below are built as its steps, in order, after its own next work. A step doc keeps its own phases, tasks and status line.

Own work first: Phase 5 (T24 to T33), then T16b, T16c, T17 and T18.

| Step | Doc                                                          | Built when                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [training-stages.md](training-stages.md)                     | Phase 6 is open: the `hunt` rung passes on 0 of 16 offsets and waits on fair-chase.md (T62); T64 (kin-spared in its own stage) is next; Phase 9 (co-evolved rungs) follows a fair chase; Phase 7 waits for the world gate of training.md |
| 2    | [unit-knockout.md](unit-knockout.md)                         | Silencing one hidden unit lifts a champion from 6 to 24 of 128 on `prey-ahead`, a gain no small weight step reaches; cheap and needs no sim rule                                                                                         |
| 3    | [training.md](training.md)                                   | The world gate and the champions' adoption, after a ladder run passes `hunt`                                                                                                                                                             |
| 4    | [champion-pool.md](champion-pool.md)                         | The closed loop from trained champions to a seeded pool and back; it builds on the trainer and the exam                                                                                                                                  |
| 5    | [brain-reflex-tests.md](brain-reflex-tests.md)               | The reflex validation study (T10 onward), a filter in front of the drills once champions exist to validate it on                                                                                                                         |
| 6    | [brain-capacity-and-memory.md](brain-capacity-and-memory.md) | Measurement before redesign: the brain experiments are judged on the fixed measurement and the trained champions                                                                                                                         |

## Scope

- In: drill trial aggregates, the stage progress series, the plateau stop, the yield summary and comparison, the ladder screen, the learnability check, adaptive stage difficulty, the tuning lane.
- Out: sim rules (`rulesHash` does not move), gate bars, drill arenas, the exam rows, the champion pool ([champion-pool.md](champion-pool.md)).

## Graded readings

A hunting drill's trial record already carries its `PreyTrace` fields (`traceFields` in [drill-trace.js](../../js/evo/drill-trace.js)). The drill cell (`scripts/drill.mjs`) adds two aggregates, and `drillReadings` in [gate-readings.js](../../js/evo/gate-readings.js) adds two readings per drill.

| Cell field    | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `jawTrials`   | trials with `jawTicks` above 0                                          |
| `closestList` | each trial's `closest` (summed radii; trials where it is null left out) |

| Reading         | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `jawShareLow`   | the Wilson low bound (`wilsonInterval`) of the pooled `jawTrials` over trials |
| `closestMedian` | the median of the pooled `closestList`, null when empty                       |

A drill without a prey trace reads `jawShareLow` and `closestMedian` as null. The readings are keys a gate condition may name (`drill.prey-ahead.jawShareLow`); [evals/train-ladder.json](../../evals/train-ladder.json) names none of them.

## Stage progress

`stageProgress` in `js/evo/stage-progress.js` reads a gate checkpoint's drill readings for the stage's gate drills (the drills its conditions name) and returns one number in `[0, 1]`:

- a bite drill (a drill with a prey trace whose win is a kill: `prey-adrift`, `prey-weak`, `prey-mid`, `prey-ahead`, `prey-crossing`) scores the mean of its `winShareLow` and `jawShareLow`;
- any other drill, `kin-spared` included, scores its `winShareLow`;
- the progress is the mean over the gate drills; null readings count 0;
- conditions on non-drill readings (`retention.*`, cross-play) do not enter it.

Progress is a series within one stage. It is not scaled to the gate bar, so two stages' progress values are not compared.

Every gate checkpoint's curve row carries `progress`, `bestProgress` (the stage's highest so far since it began or last returned from a review), `workers` and `cpuShare` (the generation's share of the pool's time spent in episodes, as `TrainGeneration` logs it) and `cpuSeconds` (the seconds the pool has spent in episodes since the process started, which `runYield` reads; a resumed run counts from 0). `TrainProgress` logs `progress` and `bestProgress` at each gate checkpoint. `npm run train:curve` prints `progress` and `bestProgress`.

## Plateau stop

A gated curriculum entry may set `plateauStop`, a count of gate checkpoints. After `minGenerations`, a stage whose `bestProgress` has not risen by `PROGRESS_RISE` (0.02, absolute) over the last `plateauStop` gate checkpoints stalls with reason `plateau`, exactly as a stage that reaches `maxGenerations` stalls (reason `max`). An optional stage's plateau stall lets the ladder move on. `plateauStop` 0 or absent keeps the stage to `maxGenerations`. A stage whose gate names no drill (`arms-race`, `habitat`) has no progress to watch and never stalls on a plateau.

- The check runs in `gateCheckpoint` (`js/evo/stage-run.js`) after the hold check, and only when the stage has not passed there: a stage passing its gate never stalls on a plateau.
- The progress history is a `RunState` field (`progressHistory`), carried by `snapshotState` and `restoreState`, and cleared when the stage begins (`moveOn`) and when a review returns, as `history` is.
- At the checkpoint `maxGenerations` forces, a stage that meets both causes stalls with reason `max`.
- A regression past `REVIEW_MAX` stalls with reason `review`.

| Constant / key  | Value                                         | Where                      |
| --------------- | --------------------------------------------- | -------------------------- |
| `PROGRESS_RISE` | 0.02                                          | `js/evo/stage-progress.js` |
| `plateauStop`   | 6 on every gated stage of `train-ladder.json` | `evals/train-ladder.json`  |

`TrainStageStalled` gains a `reason` field (`max`, `plateau` or `review`) and the stage's `bestProgress`.

## Ladder yield

`runYield` in `js/evo/ladder-yield.js` reads one run's parsed `manifest.json` and `curve.jsonl` rows (`scripts/lib/yield-files.mjs` reads the directory) and returns:

| Field          | Meaning                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `offset`       | the run's `--seed-offset`                                                                                                           |
| `reached`      | the index of the last stage the run trained in (0 is the first)                                                                     |
| `passed`       | each passed stage and its generation                                                                                                |
| `bestProgress` | the `bestProgress` of the stage it stopped in (1 when the ladder finished)                                                          |
| `score`        | `reached + bestProgress`: one ordinal number per run                                                                                |
| `cpuSeconds`   | the summed episode time: the curve's `cpuSeconds`, or for a curve without it `cpuShare` x `workers` x the wall seconds between rows |

`ladderYield(runs, stages)` returns, per stage, the share of runs that passed it, the median generations to pass, and the CPU hours spent per pass of the stage. `npm run train:yield -- <dir> [<dir> ...]` prints the table and writes `--out <path>` JSON.

`compareYield(before, after)` pairs runs by offset and reads the per-offset `score` differences:

- an exact sign test (`binomialTwoSidedP` in [binomial.js](../../js/evo/binomial.js)); tied pairs, such as two runs that both finish the ladder, are left out of it;
- a bootstrap interval of the mean difference (`bootstrapInterval` in [compare.js](../../js/evo/compare.js));
- `better` or `worse` when the sign test is under 0.05 and the interval excludes 0, else `no verdict`;
- it refuses under 16 matched offsets (exit 2), counting tied pairs, and reports the tied pairs and the offsets present in one side only.

`npm run train:compare -- <before-dir-glob> <after-dir-glob>` prints the pairs, the per-stage pass shares side by side, the CPU hours, and the verdict.

## Ladder screen

`npm run train:screen -- --grid <grid.json>` runs every arm of a ladder grid on the same offsets and compares each with the reference arm.

| Grid key        | Meaning                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `curriculum`    | the base ladder file                                                                                                                                               |
| `offsets`       | the `--seed-offset` values every arm runs (at least 16 for a verdict)                                                                                              |
| `until`         | the stage after which each run stops (`--until`)                                                                                                                   |
| `generations`   | `--generations`                                                                                                                                                    |
| `train`         | trainer options every arm starts from (`episodes`, `ticks`, `offerFrom`, `checkpointEvery`)                                                                        |
| `arms`          | named overlays: `curriculum` (a whole ladder file in place of the base), `train` keys, and `stages: {<name>: {<entry key>: value}}` laid over the ladder's entries |
| `reference`     | the arm the others are compared with (default an added arm `base`)                                                                                                 |
| `workersPerRun` | workers per run (default 8); runs in flight is the worker budget (`defaultWorkers()`) over it                                                                      |

`--runs <dir>` moves the run directories (default `<out>`). Each arm's merged ladder is written to `<out>/<arm>/ladder.json`; each run trains into `<out>/<arm>/o<offset>/`. A run whose `manifest.json` matches the arm's ladder hash, trainer options and offset is reused (resume after a kill). The screen writes `yield.json` (each arm's `ladderYield`), `verdicts.json` (each arm's `compareYield` against the reference) and `table.md` to `evals/train-screens/results/<grid>/`. It does not take the CPU lock: training runs are deterministic under load.

## Learnability check

`npm run train:feasible -- --curriculum <ladder.json>` checks each gated stage before a ladder spends runs on it:

- for each drill a stage's gate names, `learnLesson` ([learn-probe.js](../../js/evo/learn-probe.js)) evolves random brains on that drill under the drill config the trainer's gate uses (the default config and the drill's own arena: a stage's world size and agent counts would break the staged scenes; defaults: 8 populations, 200 generations) and reads the best final win share;
- a drill is learnable when at least 2 of the 8 populations reach a final win share at or above the share the gate condition implies (`winShareLow` bound, or the reference win share times a `winShareOverReference` bound; `edgeLow` uses the random brains' share plus the bound);
- for a stage whose gate names a bite drill, `playPair` and `fairBand` ([chase-envelope.js](../../js/evo/chase-envelope.js)) play each hunter specialisation against the forager at the stage's prey `sprintBoost` and report whether the fair band is non-empty.

The bars are point-estimate bars, not the gate's Wilson bars (`winShareLow`, `edgeLow`), so a learnable drill meets a necessary condition of its gate, not a sufficient one.

It writes `feasible.json` (per stage: each drill's populations reaching the bar, the best share, the fair band, and `learnable`) and prints one line per stage. `train:screen` runs it once per arm ladder before training and marks an arm whose ladder holds an unlearnable stage within `until` (`unlearnable` in `verdicts.json`); the arm still runs unless the grid sets `skipUnlearnable`.

## Adaptive difficulty

A gated curriculum entry may set `adapt`, which moves one stage-world parameter at each gate checkpoint so the population wins about half its stage-drill trials. The gate's drills, and so its pass bar, stay at full difficulty.

| `adapt` field | Meaning                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `param`       | `preySprint`: the `sprintBoost` of the forager, reproducer, scout and defender in the stage world (each set to the value), and of the steering drill's scripted fleer |
| `drill`       | the drill whose champion win share steers it (a hunting drill)                                                                                                        |
| `from`, `to`  | the start and end values (`to` at most 1, the forager's default)                                                                                                      |
| `step`        | the change per checkpoint                                                                                                                                             |
| `target`      | the win share to hold (default 0.5)                                                                                                                                   |

At each gate checkpoint, `nextDifficulty` in `js/evo/adaptive-difficulty.js` raises the value by `step` toward `to` when the champions' pooled win share on `adapt.drill` at the current value exceeds `target`, lowers it by `step` toward `from` when under `target / 2`, and holds it otherwise.

- The steering read is one extra drill run per gate checkpoint: the champions on `adapt.drill` with its fleer at the current value, at the gate seed and `GATE_TRIALS` (about the cost of one gate drill). The arena of a sprint drill is a function of the fleer's `sprintBoost` (`sprintArena` in `js/evo/drill-scenarios.js`), so `prey-weak` and `prey-mid` keep `WEAK_SPRINT_BOOST` and `MID_SPRINT_BOOST`.
- The gate's drills, and the kept passers' retention reads (`keepPasser`), run at full difficulty.
- The steering read drills the champions, the random brains and the reference rows, as a gate drill does.
- The value is a `RunState` field (`difficulty`), carried by `snapshotState` and `restoreState`. A review leaves it unchanged.
- The curve's `difficulty` column is the value the generation ran at (`adapt.to` during a review). `TrainDifficulty` carries the step: stage, generation, `param`, `from`, `to` and `winShare`.
- An adaptive stage does not stall on a plateau while `difficulty` is below `adapt.to`. Its plateau window (`plateauStop`) counts only the gate checkpoints taken at `adapt.to`: `progressHistory` is cleared at the first one (`RunState.atTop`). `RunState.stageBest` holds the best progress of the whole stage, and `TrainGate` and `TrainStageStalled` report it as `bestProgress`. `maxGenerations` ends the stage in any case.
- Episodes lay the value over the stage's overrides when `runEpisodes` builds each task. The stage's hash (`rulesHash` of `StageInfo.overrides`) is taken without it, so a resume of an adaptive stage is accepted.

## Tuning lane

`npm run train:tune -- --spec evals/train-tune.json` runs one night of trainer tuning, detached through `scripts/run-detached.sh`:

1. `proposeArms` in `js/evo/train-tune.js` reads the spec (each tunable: a ladder entry key or trainer option, its current value, its allowed values) and the past results under `evals/train-tune/results/`, and returns up to `maxArms` (default 2) one-change arms around the current ladder, skipping any arm already screened at the same ladder hash.
2. It runs `train:feasible` on each arm ladder, then `train:screen` on the tuning offsets (`tuneOffsets`, default 16 offsets from 0 to 120 by 8).
3. An arm with a `better` verdict is rerun on the held-out offsets (`holdoutOffsets`, default 16 offsets from 128 to 248 by 8). It is a finalist only when the held-out verdict is also `better`.
4. For each finalist and for the reference, `train:export` writes the best run's champions and a 16-seed `npm run eval` with `champions-v1` against the matching live report reads `eval.hunter_catches_per_1k`, `eval.hunter_kills_per_life_mean` and `eval.food_energy_per_1k`.
5. It writes `evals/train-tune/results/<date>/summary.md`, `result.json` (arms, verdicts, the world readings) and a draft `evals/experiments.json` entry (`draft-experiment.json`). It changes no file outside the results directory.

A finalist's ladder change is adopted by a PR that commits the ladder edit, the experiment entry and the results. A finalist's champions reach the 64-seed keep rule only by that PR.

| Spec field       | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `curriculum`     | the ladder file tuned                                             |
| `until`          | the last stage the screen trains                                  |
| `tunables`       | `[{key, stage?, values}]`: a trainer option, or a stage entry key |
| `maxArms`        | arms per night (2: a night is over 8 hours)                       |
| `tuneOffsets`    | offsets of the screen                                             |
| `holdoutOffsets` | offsets of the confirmation                                       |
| `worldSeeds`     | seeds of the champion world trial (16)                            |
| `generations`    | generations of each screen run (380)                              |
| `workersPerRun`  | workers per training run (8)                                      |
| `train`          | trainer options every arm starts from (`checkpointEvery` 5)       |
| `feasible`       | the learnability check's sizes (default 60 generations, 4 seeds)  |
| `worldTicks`     | ticks of the world trial (200000)                                 |
| `worldTrial`     | `false` skips the world trial (tests)                             |

## Phases

### Phase 1 - Graded readings, plateau stop, yield and the ladder screen

**Targets:** none - it measures and shortens training runs; its readings are the ladder yield (`train:yield`) and CPU hours per pass, not a world metric

- Drill cells carry `jawTrials` and `closestList`; `drillReading` adds `jawShareLow` and `closestMedian`.
- `stageProgress`, the curve's `progress` and `bestProgress` columns, and `plateauStop` with `TrainStageStalled.reason`.
- `runYield`, `ladderYield`, `compareYield`, `train:yield`, `train:compare` and `train:screen`.
- The first screen (`E-TL-1`, `evals/train-screens/plateau.grid.json`): the current ladder with and without `plateauStop`, 16 offsets, `until` `hunt-mid`. Recorded as E205: `no verdict` on score (15 of 16 offsets tied, 1 down), CPU hours 26.7 to 21.9 (-18%, short of the predicted 30%), so `plateauStop` 6 stays the default. Prediction (written before the run): equal pass shares, `no verdict` on score (a `worse` would mean the stop cuts runs that were still closing), and at least 30% fewer CPU hours with the stop.

#### Chunks

| Chunk | Tasks    | Holds                                                                                                                       |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1A    | T1 to T7 | Graded readings, stage progress, the plateau stop, yield, comparison, the ladder screen and the conformance review (Sonnet) |

T8 is a long run, not a code chunk: detached, recorded in its own PR.

### Phase 2 - The learnability check

**Targets:** none - it checks a ladder before training; its reading is `learnable` per stage

- `train:feasible`, and `train:screen` marking `unlearnable` arms.
- The check on the current ladder (`E-TL-2`, recorded as E206). Prediction (written before the run; hunt-mid turned out unlearnable too, and kin-spared): every rung through `hunt-mid` is learnable; `hunt` (`prey-ahead` at 0.5 of the reference) is not, which says the next lever is a sim rule ([training-stages.md](training-stages.md) T62), not a ladder change.

#### Chunks

| Chunk | Tasks     | Holds                                                                                                       |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------- |
| 2A    | T9 to T12 | The check, the screen hook, the first reading and review (Sonnet); T11 is a run of minutes inside the chunk |

### Phase 3 - Adaptive difficulty

**Targets:** none - it changes how stage worlds are set, read by `compareYield` against the fixed ladder

- The `adapt` curriculum key, `nextDifficulty`, the saved value and `TrainDifficulty`.
- `evals/train-ladder-adaptive.json`: `hunt-weak`, `hunt-mid` and `hunt` replaced by one `hunt` stage with `adapt` (`preySprint` from 0.1 to the live default, step 0.05, steered by `prey-ahead`).
- The screen `E-TL-3`, adaptive against fixed, 16 offsets, `until` `hunt`. Recorded as E207. Prediction (written before the run): `better` on `train:compare` score, adaptive against fixed, with the adaptive arm passing `hunt` on at least 1 of 16 offsets; falsified on `no verdict` or `worse`. On `better`, the fixed rungs `hunt-weak` and `hunt-mid` and their drills' ladder entries are deleted from `train-ladder.json` (the drills stay for the exam); on `worse` or `no verdict`, `adapt` and its module are deleted.

#### Chunks

| Chunk | Tasks      | Holds                                                    |
| ----- | ---------- | -------------------------------------------------------- |
| 3A    | T13 to T15 | The key, the controller and the adaptive ladder (Sonnet) |

T16 is a long run, not a code chunk. T16a retests it; T17 and T18 follow T16a in one PR (Sonnet).

### Phase 4 - The tuning lane

**Targets:** none - it runs screens and world trials; its world readings feed a PR, which carries its own targets

- `proposeArms`, `train:tune`, `evals/train-tune.json` and the results layout.
- The first night (`E-TL-4`, recorded as E208) and its record. Prediction, written before the run: nursery `maxGenerations` 80 reads `better` on the 16 tune offsets (nursery passes on at least 12 of 16 against 9) and confirms `better` on the 16 held-out offsets; `episodes` 48 reads `no verdict`. Falsified when the nursery arm reads `no verdict` or `worse` on the tune offsets.

#### Chunks

| Chunk | Tasks      | Holds                                         |
| ----- | ---------- | --------------------------------------------- |
| 4A    | T19 to T21 | The planner, the runner and the docs (Sonnet) |

T22 is a long run, not a code chunk; T23 follows its record in one PR (Sonnet).

### Phase 5 - Verdict power and trainer throughput

**Targets:** none - it changes how a ladder change is judged and how long a run takes; its readings are a `train:compare` stage verdict on a planted effect of 6 pass flips in 32 offsets (the smallest count the exact test calls at 0.05), and the CPU hours of one 16-offset arm against 17.6 (E232 `base`)

Every `train:compare` read from E205 to E250 is `no verdict` (8 of 8). The base ladder passes `nursery` on 56% of the tune offsets and 81% of the held-out offsets, so offset luck exceeds most effects at 16 offsets.

- **32 offsets.** A screen that carries a decision runs 32 offsets (0 to 248 by 8). The base arm comes from the cache of T22f, so the second 16 cost one arm, not two. The trainer's seed list (`js/evo/trainer.js` cycles it by `seeds.length`, 256 today) grows to 512 entries by appending, so every existing offset replays unchanged. `evals/train-tune.json` moves `tuneOffsets` to these 32 and `holdoutOffsets` to 256 to 504 by 8, which share no seed with a tune offset.
- **A pass test per stage.** `compareYield` adds, per stage, the exact paired test on pass and fail (the exact two-sided test on the discordant offsets, `binomialTwoSidedP` in `js/evo/binomial.js`). `train:compare` prints it beside the score test and reads a stage `better` or `worse` when p is under 0.05; the run-level verdict is unchanged. The smallest loss it could have seen (`leastDetectedLoss`) prints with it.
- **Where a generation's time goes.** `npm run train:profile -- --curriculum <ladder> --generations 20` prints the share of wall time in world episodes, gate drills, the archive and checkpoint writes, per stage, and the worker busy share.

Measured on 2026-11-20 (ten `ladder-1k` and `ladder-1l` runs and an 11-generation profiled run; 32 episodes of 4000 ticks):

| Reading                                                     | Value                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Wall time in generations; in checkpoints and archive writes | 73%; 27% (15.7 s a checkpoint)                                       |
| Worker busy share in a hunt-stage generation                | 0.35 to 0.45 at 12 workers; 0.85 to 0.91 at 3                        |
| One archive or pool snapshot                                | 19.7 MB; a task carrying 8 costs 77 ms of main-thread clone          |
| A fresh worker's first episode                              | 410 ms against 245 ms warm; workers are respawned every generation   |
| Checkpoint drill tasks that repeat constant work            | about 70 of 105 (the random brains and the reference)                |
| One warm episode                                            | step 74 to 79%, the observer feed 13.5 to 16%, `createWorld` 4 to 8% |

The step is under half of a training run's wall time at 12 workers. T27 to T33 take the rest back without changing any archive a run writes: `--workers 1` and `--workers 32` still write identical archives. Until they land, a screen runs more runs at 3 or 4 workers each, 16 workers in total.

- **The adaptive retest.** `validateAdapt` in `js/evo/adaptive-difficulty.js` accepts a `from` of 0 where the config validation accepts a `sprintBoost` of 0, and T16a reruns.

#### Chunks

| Chunk | Tasks      | Holds                                             |
| ----- | ---------- | ------------------------------------------------- |
| I     | T24 to T28 | the 32-offset screens, the pass test, the profile |

| Done when                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `train:compare` on a fixture pair with 6 planted pass flips in 32 offsets prints a stage verdict, and none with 5                                    |
| the worker busy share in a hunt-stage generation at 12 workers is at least 0.8, and one 16-offset `base` arm costs at most 12 CPU hours against 17.6 |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Pure modules in `js/evo/`: `stage-progress.js` (`stageProgress`, `PROGRESS_RISE`), `ladder-yield.js` (`runYield`, `ladderYield`, `compareYield`), `adaptive-difficulty.js` (`nextDifficulty`), `train-tune.js` (`proposeArms`); `gate-readings.js` gains `jawShareLow` and `closestMedian`; `stage-run.js` gains the plateau stall and the difficulty state; `curriculum.js` validates `plateauStop` and `adapt`. Shells in `scripts/`: `train-yield.mjs`, `train-compare.mjs`, `train-screen.mjs` (with `scripts/lib/train-screen-grid.mjs`), `train-feasible.mjs`, `train-tune.mjs`; `drill.mjs` adds the cell aggregates. No change to `js/sim/`, the worker or the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unit tests              | `test/evo/gate-readings.test.js`: `jawShareLow` from known cells, null for drills without a trace, `closestMedian` with null closests left out. `test/evo/stage-progress.test.js`: bite and other drill scores, `kin-spared` scored on win share only, nulls count 0, range `[0, 1]`. `test/evo/stage-run.test.js`: a plateau stall after `plateauStop` flat checkpoints, none before `minGenerations`, none when progress rises by 0.02, `reason` `max`, `plateau` and `review`, no plateau stall on a passing checkpoint, the history cleared on a review return, an optional stage moving on, the difficulty value saved and resumed. `test/evo/curriculum.test.js`: `plateauStop` and `adapt` validation errors. `test/evo/ladder-yield.test.js`: `score` of a finished, a stalled and an empty run, pass shares, CPU hours, `compareYield` verdicts on constructed pairs, refusal under 16, unmatched offsets reported. `test/evo/adaptive-difficulty.test.js`: up over target, down under half target, hold between, clamped to `from` and `to`. `test/evo/train-tune.test.js`: one-change arms, skipping screened arms, `maxArms`. `test/train-screen.test.js` and `test/train-screen.slow.test.js`: grid merge, ladder hash, reuse of a matching run, a two-arm two-offset tiny screen end to end. `test/train-feasible.slow.test.js`: a learnable `food-ahead` stage and a stage with an unreachable bar. `test/train-yield.test.js`, `test/train-compare.test.js`, `test/train-tune.slow.test.js` on fixture run directories. |
| Headless e2e            | `test/train-screen.slow.test.js` runs a two-arm screen on offsets 0 and 8 with 2 generations, 2 episodes and 2000-tick episodes, and asserts both runs write identical archives at `--workers 1` and `--workers 2`; `eval-smoke` unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Performance budget      | No `bench.*` change: nothing runs in the step. A gate checkpoint's drills already record the trace fields; the added aggregation is under 1 ms per checkpoint. `E-TL-1` reports CPU hours per run with and without `plateauStop`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Evolution metrics       | None in the world for Phases 1 to 3: verdicts come from `compareYield` on 16 matched offsets. Phase 4's champion trial reads `eval.hunter_catches_per_1k`, `eval.hunter_kills_per_life_mean` and `eval.food_energy_per_1k` on 16 seeds; adoption of a champion set still needs the 64-seed `eval:compare --keep-rule`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Determinism             | No new RNG stream: a run's archive depends on its offset, ladder and trainer options only. The difficulty value is a function of the gate readings, which are fixed by `GATE_SEED` and the gate trials, so a resumed run replays it. `learnLesson` keeps its own seeds. Screens, yield and tuning read files and add no randomness besides `bootstrapInterval`'s fixed seed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Config and persistence  | No sim config key and no `rulesHash` change, so no `scripts/flag-ledger.json` entry. Curriculum keys: `plateauStop` (integer, absent = off), `adapt` (object, absent = off). Curve rows gain `progress`, `bestProgress` and `difficulty`; saved run state gains `difficulty`; `TrainStageStalled` gains `reason` and `bestProgress`. New files: `evals/train-ladder-adaptive.json`, `evals/train-tune.json`, `evals/train-screens/*.grid.json`; outputs under `evals/train-screens/results/` and `evals/train-tune/results/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Logging and diagnostics | `TrainStageStalled` (error): `stage`, `generation`, `reason`, `bestProgress`, `failing`. `TrainProgress` (info, each gate checkpoint): `stage`, `generation`, `progress`, `bestProgress`. `TrainDifficulty` (info): `stage`, `generation`, `param`, `from`, `to`, `winShare`. `TrainScreenRun` (info): `arm`, `offset`, `reused`, `status`. `TrainScreenVerdict` (info): `arm`, `verdict`, `pairs`, `p`, `interval`. `FeasibleStage` (info): `stage`, `drill`, `reached`, `best`, `fairBand`, `learnable`. `TuneArm` and `TuneResult` (info) in `.sim/logs/train-tune-<date>.jsonl`. A failed run in a screen logs `TrainScreenRunFailed` (error) with its exit code and log path and the screen goes on. Reproduce a run with `npm run train -- --curriculum <out>/<arm>/ladder.json --seed-offset <k> --generations <g> --until <stage> --out <dir>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser compatibility   | N/A - Node-only training tools; nothing reaches the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Docs                    | AGENTS.md command rows for `train:yield`, `train:compare`, `train:screen`, `train:feasible`, `train:tune`; the `train` row names `plateauStop` and `adapt`; [training-stages.md](training-stages.md) links this doc from its ladder section; the `run-evolution-loop` skill names `train:compare` as the verdict for a ladder change. Once `Implemented`, this doc describes the training loop as built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Verification            | `scripts/check.sh --fix --quick` green per chunk and CI `check` green; the `E-TL-1` to `E-TL-4` records in `evals/experiments.json`; no manual browser walk (no app change).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Task breakdown

### Phase 1 - Graded readings, plateau stop, yield and the ladder screen

| #   | Task                                                                                                                                                                                                                                                                                                                                            | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | (built) Drill cells carry `jawTrials` and `closestList` (`scripts/drill.mjs`); `drillReadings` adds `jawShareLow` and `closestMedian`; tests                                                                                                                                                                                                    | [judgement]  | -          |
| T2  | (built) `stageProgress` and `PROGRESS_RISE` in `js/evo/stage-progress.js`; curve rows carry `progress`, `bestProgress`, `workers` and `cpuShare`; `TrainProgress`; `train:curve` columns; tests                                                                                                                                                 | [judgement]  | T1         |
| T3  | (built) `plateauStop` curriculum key and validation; the plateau stall in `gateCheckpoint` with `progressHistory` in `RunState`, `TrainStageStalled.reason` (`max`, `plateau`, `review`) and `bestProgress`; `plateauStop` 6 on the gated stages of `train-ladder.json`; tests                                                                  | [judgement]  | T2         |
| T4  | (built) `runYield` and `ladderYield` in `js/evo/ladder-yield.js` and `npm run train:yield`; its AGENTS.md row; tests on fixture run directories                                                                                                                                                                                                 | [mechanical] | T2         |
| T5  | (built) `compareYield` and `npm run train:compare`; its AGENTS.md row; tests                                                                                                                                                                                                                                                                    | [judgement]  | T4         |
| T6  | (built) `npm run train:screen` with `scripts/lib/train-screen-grid.mjs`: grid merge, per-arm ladders, run reuse, the worker budget, `yield.json`, `verdicts.json`, `table.md`, `TrainScreenRun`, `TrainScreenVerdict`, `TrainScreenRunFailed`; `evals/train-screens/plateau.grid.json`; its AGENTS.md row; tests including the tiny slow screen | [judgement]  | T3, T5     |
| T7  | Conformance review of Phase 1 code by a fresh agent, in parallel with `scripts/check.sh --fix --quick`; mark T1 to T6 built and move the Status line                                                                                                                                                                                            | [judgement]  | T6         |
| T8  | (built) (screen `E-TL-1`, detached) the current ladder with and without `plateauStop`, offsets 0 to 120 by 8, `until` `hunt-mid`; record E-TL-1 in `evals/experiments.json` with the yield table and CPU hours; mark Phase 1 built                                                                                                              | [judgement]  | T7         |
| T8a | `plateauStop` 10 against 6 as a `train:tune` arm; the nursery stall on 7 of 16 offsets (best progress 0.67 to 0.83) is the next ladder lever (episodes or `minGenerations` at nursery). E-TL-1 kept `plateauStop` 6: 18% fewer CPU hours for 1 of 16 runs lost                                                                                  | [judgement]  | T8         |

### Phase 2 - The learnability check

| #   | Task                                                                                                                                                                                                                                               | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9  | (built) `npm run train:feasible`: the per-drill bar from each gate condition, `learnLesson` per gate drill in the stage config, the fair band for bite drills (`playPair`, `fairBand`), `feasible.json`, `FeasibleStage`; its AGENTS.md row; tests | [judgement]  | T7         |
| T10 | (built) `train:screen` runs the check per arm ladder and marks `unlearnable`; `skipUnlearnable`; tests                                                                                                                                             | [mechanical] | T6, T9     |
| T11 | (built) (run `E-TL-2`) the check on `train-ladder.json`; record E-TL-2                                                                                                                                                                             | [judgement]  | T9         |
| T12 | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh --fix --quick`; mark Phase 2 built                                                                                                                              | [judgement]  | T10, T11   |

### Phase 3 - Adaptive difficulty

| #    | Task                                                                                                                                                                                                                                                                                               | Nature       | Depends on      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| T13  | (built) `nextDifficulty` in `js/evo/adaptive-difficulty.js`; the `adapt` curriculum key and its validation; tests                                                                                                                                                                                  | [judgement]  | T7              |
| T14  | (built) `difficulty` in `RunState` (`snapshotState`, `restoreState`); `runEpisodes` lays it over the stage overrides outside the stage hash; `sprintArena` takes the value and the steering drill runs at it each gate checkpoint; curve `difficulty`; `TrainDifficulty`; tests including a resume | [judgement]  | T13             |
| T15  | (built) `evals/train-ladder-adaptive.json`; `evals/train-screens/adaptive.grid.json` (adaptive against fixed, offsets 0 to 120 by 8, `until` `hunt`)                                                                                                                                               | [mechanical] | T14, T6         |
| T16  | (screen `E-TL-3`, detached) run the adaptive grid; record E-TL-3 (built: E207, falsified as configured: the difficulty never left 0.10, hunt passed on 0 of 16 in both arms)                                                                                                                       | [judgement]  | T15             |
| T16a | (screen, detached) retest adaptive with `from` 0, `target` 0.15 (the hunt-weak passers win a few percent; 0.5 is out of reach), `steerShare` logged; T17's deletion waits for this retest                                                                                                          | [judgement]  | T16             |
| T16b | Make `validateAdapt` and the config validation agree on a `sprintBoost` of 0, with a test of the E251 failure                                                                                                                                                                                      | [judgement]  | T16a            |
| T16c | (screen, detached) rerun T16a's retest and record it                                                                                                                                                                                                                                               | [mechanical] | T16b            |
| T17  | Delete the losing path (after T16a): on `better`, the `hunt-weak` and `hunt-mid` entries of `train-ladder.json` go and `hunt` takes `adapt`; otherwise `adapt`, `adaptive-difficulty.js` and the adaptive ladder go                                                                                | [judgement]  | T16, T16a, T16c |
| T18  | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh --fix --quick`; mark Phase 3 built                                                                                                                                                                              | [judgement]  | T17             |

### Phase 4 - The tuning lane

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                       | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T19  | (built) `proposeArms` in `js/evo/train-tune.js` and `evals/train-tune.json`; tests                                                                                                                                                                                                                                                                                                                                                         | [judgement]  | T7         |
| T20  | (built) `npm run train:tune`: feasibility, the tuning screen, the held-out confirmation, the champion export and the 16-seed world trial for finalists, `summary.md`, `result.json`, `draft-experiment.json`, `TuneArm`, `TuneResult`; tests on a tiny spec                                                                                                                                                                                | [judgement]  | T19, T10   |
| T21  | (built) AGENTS.md `train:tune` row; the `run-evolution-loop` skill names `train:compare` and the tuning lane; [training-stages.md](training-stages.md) links this doc                                                                                                                                                                                                                                                                      | [mechanical] | T20        |
| T22  | (built) (run `E-TL-4`, detached) the first night; record E-TL-4 (E208: nursery `maxGenerations` 80 tied on 16 of 16, `episodes` 48 no verdict)                                                                                                                                                                                                                                                                                             | [judgement]  | T21, T18   |
| T22a | (built) confirm `episodes` 48 on the 16 held-out offsets 128-248 (E209; run `E-TL-5`, detached): no verdict, 8 up 6 down, p 0.79; not adopted                                                                                                                                                                                                                                                                                              | [judgement]  | T22        |
| T22b | (built) (run `E-TL-6`, E230) nursery `plateauStop` 10 and hunt-weak `preyShare` 1: nursery tied on 16 of 16 (pass shares identical to base), `preyShare` 1 no verdict, hunt-weak 25 to 19%, cpu +113%; neither adopted. Nursery is capped by both its `maxGenerations` 40 and its `plateauStop` 6                                                                                                                                          | [judgement]  | T22        |
| T22c | (built) (run `E-TL-7`, E231) nursery `maxGenerations` 80 with `plateauStop` 0 together: 1 up, 0 down, 15 tied, no verdict, nursery 56 to 63%, cpu +32%; the stall is a skill limit, not a budget limit                                                                                                                                                                                                                                     | [judgement]  | T22b       |
| T22d | (built) `proposeArms` gains bundled tunables (a tunable whose value sets several keys at once) so the lane can test a change that needs two settings moved together; `evals/train-tune.json` drops `hunt-weak` `preyShare` 1.0                                                                                                                                                                                                             | [judgement]  | T22b       |
| T22e | (planned as [training-stages.md](training-stages.md) Phase 8, T65 to T71, which reads the last nursery archives and finds the turn in 7 of 7 stalled archives but not in their one forager champion) the nursery stall is a skill limit on the food-behind drill (6 of the 7 stalled offsets fail only `drill.food-behind.edgeLow`): a curriculum rung or a brain change, not a longer stage; `plateauStop` 6 and `maxGenerations` 40 stay | [judgement]  | T22c       |
| T22f | (built) `train:screen` and `train:tune` reuse an identical base arm across screens via `--cache` (default `.sim/train-cache`, keyed by ladder hash, trainer options and offset)                                                                                                                                                                                                                                                            | [judgement]  | T22b       |
| T23  | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh --fix --quick`; mark Phase 4 built                                                                                                                                                                                                                                                                                                                      | [judgement]  | T22        |

### Phase 5 - Verdict power and trainer throughput

| #   | Task                                                                                                                                                                                                                                                                                                                       | Nature       | Depends on              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| T24 | Append 256 seeds to the trainer's seed list with a test that offsets 0 to 255 replay unchanged; move `evals/train-tune.json` and the example grids to 32 tune and 32 held-out offsets with the base cache; `train:screen` warns when a grid with a verdict clause has under 32 offsets; tests                              | [mechanical] | -                       |
| T25 | Add the per-stage exact paired pass test to `compareYield` and the `train:compare` and `table.md` output, with the smallest detectable flip count; tests on planted flips                                                                                                                                                  | [judgement]  | -                       |
| T26 | Add `scripts/train-profile.mjs` and `npm run train:profile` with tests on a two-generation fixture run; record the shares for the current ladder in `sim-notes.md`                                                                                                                                                         | [judgement]  | -                       |
| T27 | Keep one worker pool alive for the whole run in `runPool` (`scripts/lib/worker-pool.mjs`) and the trainer, with a test that a run's archives are byte-identical to before and to `--workers 1`                                                                                                                             | [judgement]  | -                       |
| T29 | Send the archive and opponent-pool snapshots to workers as `SharedArrayBuffer`s, or once per worker and generation, not cloned into every task (`runEpisodes` in `scripts/train.mjs`, `taskPool`); identical-archive test; main-thread `postMessage` share before and after                                                | [judgement]  | T27                     |
| T30 | Cache checkpoint drill results across checkpoints, keyed by drill, seed, trials, config hash (the steer config included) and genome id: the random brains, the reference and unchanged elites (`buildTasks` in `scripts/drill.mjs`, `drillPart` in `scripts/lib/train-checkpoint.mjs`); identical `curve.jsonl` test       | [judgement]  | -                       |
| T31 | Run a training episode that returns no metrics with the lean observer, and reuse the world across episodes in `runEpisode` (`js/evo/trainer.js`) through the `resetWorld` that [throughput.md](throughput.md) T9 adds (built here first if that task is not); identical-archive test for each, kept or reverted separately | [judgement]  | T27                     |
| T32 | Size the pool so the episodes divide evenly across workers (`resolvePoolSize`), and write the archive JSON at checkpoints only (`saveArchive` in `scripts/lib/train-state.mjs`), with tests                                                                                                                                | [mechanical] | T27                     |
| T33 | Re-run `train:profile` and one 16-offset `base` arm; record the worker busy share, the checkpoint share and the CPU hours against the Measured table                                                                                                                                                                       | [mechanical] | T26, T29, T30, T31, T32 |
| T28 | Conformance review of Phase 5; move the Status line to `Implemented` when Phases 3 and 4 are also closed                                                                                                                                                                                                                   | [judgement]  | T24, T25, T33           |

## Verification

1. `scripts/check.sh --fix --quick` is green on each chunk's branch and CI `check` is green on its PR.
2. `npm run train:screen -- --grid evals/train-screens/plateau.grid.json` writes `table.md` with a verdict per arm; killing it and rerunning reuses every finished run.
3. `npm run train:curve -- <run>` shows the `progress` and `bestProgress` columns and a `plateau` stall reason on a stalled run.
4. `npm run train:feasible -- --curriculum evals/train-ladder.json` prints one line per stage and writes `feasible.json`.
5. `npm run train:tune -- --spec evals/train-tune.json` writes the results directory and changes no other file (`git status` shows only the results).
6. Each of E-TL-1 to E-TL-4 is in `evals/experiments.json` with its prediction and outcome.
