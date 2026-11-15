# Scent trails and carrion scent

**Status:** Proposed - add decaying movement/track scents behind fast-moving blobs and far-carrying carcass scents around kills (reusing the existing `attack`/`danger` pheromone antennae) so hunters can track prey off-ray and scavengers find kills beyond `visionRange`; Phase 1 (off-ray tracking detectors and baseline) is first.
**Validated:** a8013e98 (2026-11-15)
**Priority:** 33 - builds on [honest-budgets.md](honest-budgets.md) (body-priced carcasses) and [stillness.md](stillness.md) (motionless concealment)
**Depends on:** [honest-budgets.md](honest-budgets.md), [senses-and-motor.md](senses-and-motor.md)

Today, when a fleeing prey breaks line of sight behind a rock ring or slips between the 16 rays at `300`–`400` px, it ceases to exist for the pursuer. Likewise, a fresh carcass is invisible outside `visionRange`, so scavengers and juvenile predators only find kills by stumbling within sight. Meanwhile, the brain already has left/right scent antennae (`BODY_INPUT.SCENT` and `BODY_INPUT.HUNT_SCENT` in `js/sim/brain-layout.js`) reading `world.danger` and `world.attack` pheromone grids.

This doc makes scent the "off-ray" nervous system of the map: fast-moving or sprinting blobs deposit a faint track scent, and carcasses emit a decaying carrion scent—giving hunters a trail to follow around cover and giving scavengers a beacon to kills, with **zero new brain inputs**.

Scenes served: **A real chase** ("losing sight is not the same as the prey ceasing to exist"), **Scavenge** ("a large herd carcass pulls a meat-eater"), **Death stays in the world**, and **Refuge** ([principles.md](../principles.md)).

## Principle and refusals

- **Zero new brain inputs:** Reuse the existing `attack` / `danger` antennae (`scent-inputs.js`, `pheromones.js`) or existing scent channels rather than expanding `BRAIN_LAYOUT_NAME`.
- **Motion leaves a trace, stillness stays hidden:** Only moving/sprinting blobs deposit track scent above a speed threshold, reinforcing [stillness.md](stillness.md): freezing or walking slowly hides your trail.
- **No free omniscience:** Scent decays locally (`pheromoneDecay`) and diffuses slowly, so old trails fade and wind/time can throw a pursuer off.

## Mechanics

| Mechanism            | Rule                                                                                                                                           | Scene served                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Track scent          | Non-hunters moving above `trackSpeedMin` (or sprinting) deposit `trackDeposit` into the scent grid                                             | A hunter losing sight at a rock ring can follow the recent trail around cover |
| Carrion scent        | Blob and herd carcasses deposit `carrionDeposit` per tick while `carcassFadeTicks` > 0                                                         | Scavengers and juvenile predators converge on kills from beyond `visionRange` |
| Scent discrimination | T3a picks the grid from the table under Test design; `world.attack` and `world.hunt` each already mean something to the animals that read them | Zero layout change                                                            |

## Detectors

All computed by the eval observer; none is a reward.

| Metric                         | Direction | Reads                                                                                                          |
| ------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------- |
| `eval.chase_reacquire_share`   | higher    | Share of chases that lose ray sight of prey and re-acquire the same prey within `REACQUIRE_WINDOW` (120) ticks |
| `eval.scavenge_approach_share` | higher    | Share of carcass meals preceded by closing along the carcass direction from outside `visionRange`              |

## Phases

### Phase 1 - Off-ray tracking detectors and baseline

**Targets:** none - detectors only; `worldHash` and golden cases are unchanged

Add `js/evo/scene-scent.js` with `eval.chase_reacquire_share` and `eval.scavenge_approach_share`, and run a 16-seed baseline (`E-ST2-1`, 400,000 ticks, floor on).

#### Chunks

| Chunk | Tasks         | Contents                                                                             |
| ----- | ------------- | ------------------------------------------------------------------------------------ |
| A     | T1 to T3, T2a | `scene-scent.js`, registry entries, tests, `E-ST2-1` baseline and conformance review |

### Phase 2 - Track scent and carrion scent

**Targets:** eval.chase_catch_share, eval.hunter_income_share.carcass, eval.hunter_juvenile_death_share

Add `trackDeposit`, `trackSpeedMin` and `carrionDeposit` behind `scentTrailsEnabled` in `js/sim/pheromones.js` and `js/sim/carcass.js` (and `wasm/src/pheromones.rs` if touched). Screen (`E-ST2-2`, 16 seeds) and judge by the 64-seed keep rule (`E-ST2-3`), checking that juvenile scavenging and off-ray chase re-acquisition rise without tanking `bench.step_ms@500`.

#### Chunks

| Chunk | Tasks              | Contents                                             |
| ----- | ------------------ | ---------------------------------------------------- |
| B     | T3a, T4 to T8, T4a | Channel checks, deposits, screens, switch and review |

### Scent must carry usable local evidence

T3a checks the shared channel before deposit tuning: prey tracks, carrion and existing hunt signals may attract to different things. Fixtures cover a dead trail, an exhausted carcass, crossing trails, a rock barrier and slot reuse. No source identity or target coordinates enter the brain. Compare track-only, carrion-only and combined arms against the same no-scent control; report wrong-source approaches and time/energy wasted as well as successful reacquisition. Scent diffusion must not provide an effortless route through sealed cover. T6 includes juvenile access to carcasses and hunter descendant replacement from [honest-budgets.md](honest-budgets.md) Phase 6 before adoption. More approaches without food or offspring is not a success. Replay clips show a lost trail and a late scavenger finding a depleted body as well as successful tracking.

## Test design

### What the code does today

| Grid     | Laid by                                                     | Read by every agent as                           | Means today             |
| -------- | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| `danger` | A bite, at the victim (`feeding.js`); an alarm (`calls.js`) | Left and right antenna (`BODY_INPUT.SCENT`)      | Something was hurt here |
| `attack` | A bite, at the biter (`feeding.js`)                         | Left and right antenna (`BODY_INPUT.SCENT`)      | A hunter bit here       |
| `hunt`   | A hunt call (`calls.js`)                                    | Here and both antennae (`BODY_INPUT.HUNT_SCENT`) | A hunter called here    |

A cell is `pheromoneCellSize` 100 px. Antennae sit `antennaReach` 150 px out at 0.8 rad either side. `pheromoneDecay` is 0.00167 a tick (a trail fades to a third in about 600 ticks) and `pheromoneDiffusion` 0.05. No grid is laid by movement or by a carcass, and no input reads `attack` as "prey went this way".

### Leads to settle before any deposit

| #   | Lead                                                                                                                                                                                                                       | Settled by |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| S1  | A track in `attack` makes prey smell "a hunter bit here" along their own path and their herd's. A track in `hunt` reads as a hunt call. Either reuse changes what an existing input means for every brain that learned it  | T3a        |
| S2  | A trail has two ends. At a decay of 0.17% a tick the scent along a trail differs by under 2% between antennae 200 px apart, so the fresh end may not be readable; a blob may follow a trail backwards as often as forwards | T2a        |
| S3  | A receptive-mate scent was built as a new input and mate-ready males did not learn to follow it (`E168`, [low-density-edge.md](low-density-edge.md) Phase 5). The same may hold here                                       | T2a        |
| S4  | The memory probe already stages this: `scent-after-sight-loss` in `js/evo/memory-probe-scenarios.js`. Its score on today's champions is the baseline a trail has to beat                                                   | T2a        |
| S5  | Every moving prey writes a cell each tick. The pheromone kernel skips rows that are all zero ([wasm-kernels.md](wasm-kernels.md) T22) and the brain skips zero inputs; a map covered in track scent loses both             | T4a        |
| S6  | A carcass that glows beyond sight pulls every meat-eater to one place. With the kill as the body ([honest-budgets.md](honest-budgets.md) Phase 2) that may starve juveniles at a crowd, not feed them                      | T5         |

### The trail must be followable before it is built

T2a stages a trail in the probe arena with a hand-written deposit (no sim change): a prey walked along a path, then removed from sight. It reads three bars for "reach the prey's last position along the trail": the oracle, a scripted reference that reads only the antenna inputs, and `npm run probe:learn` from random brains ([senses-and-motor.md](senses-and-motor.md), Lesson probes). Phase 2 is built only when the reference re-acquires on at least half of trials and the learn probe reaches half of the reference. If the reference fails, the gradient is too weak to carry direction: the fix is in the scent (a faster decay for the track grid, so the fresh end is stronger), and it is screened as its own arm, not by adding an input.

### Arms and what counts

| Arm       | Track | Carrion | Track decay          |
| --------- | ----- | ------- | -------------------- |
| `control` | off   | off     | -                    |
| `track`   | on    | off     | `pheromoneDecay`     |
| `track-f` | on    | off     | 5 x `pheromoneDecay` |
| `carrion` | off   | on      | -                    |
| `both`    | on    | on      | the better track arm |

- `eval.chase_catch_share` and `eval.hunter_income_share.carcass` are `watch` metrics and give no verdict; `eval.hunter_juvenile_death_share` needs 64 seeds. The screen reports them; the verdict metrics are `eval.chase_reacquire_share`, `eval.scavenge_approach_share` and the wrong-source approaches of T3a.
- Adoption is the keep rule on 64 matched seeds: kept when no guard reads `WORSE` and the step is inside its margin, deleted only on `WORSE` or an unpaid step cost.
- Runs are 200000 ticks, the length the registry's power was measured at.
- [stillness.md](stillness.md) is not a build dependency: it may close after its own Phase 1. If it is adopted, the two are read together once.

## Decisions

| Decision                                                              | Why                                                                                                           | Who                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A staged trail is shown followable before any deposit is built        | `E168` built a scent no brain followed; a trail whose fresh end cannot be read is a number that moves nothing | Delegated (plan review, 2026-11-15) |
| The grid a track uses is chosen by test, and its old meaning is named | `attack` and `hunt` are read by brains that learned them as a bite and a call                                 | Delegated (plan review, 2026-11-15) |
| Track and carrion are separate arms                                   | They serve different scenes and may harm differently                                                          | Delegated (plan review, 2026-11-15) |
| The step cost is priced before the screen                             | Dense scent defeats two zero-skips the step relies on                                                         | Delegated (plan review, 2026-11-15) |

## Experiments

| Id      | Task | Question                                                 | Prediction (written before the run)                                                                                                                          |
| ------- | ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-ST2-1 | T2   | How often is a lost prey found again today?              | `eval.chase_reacquire_share` under 0.1; `eval.scavenge_approach_share` under 0.05; the probe's `scent-after-sight-loss` gain inside its noise                |
| E-ST2-0 | T2a  | Can a trail be followed with two antennae?               | At `pheromoneDecay` the reference re-acquires on under half of trials and follows the trail backwards on a third; at 5 x decay it passes half                |
| E-ST2-2 | T5   | Which arm lets hunters re-acquire and scavengers arrive? | `track-f` lifts re-acquisition and `track` does not; `carrion` lifts scavenge approaches and raises the hunters at one carcass; no arm reads hunters `WORSE` |
| E-ST2-3 | T6   | Does the finalist harm on 64 matched seeds?              | No guard `WORSE`; `eval.hunter_juvenile_death_share` not higher                                                                                              |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/pheromones.js`, `js/sim/carcass.js`, `js/sim/scent-inputs.js`, `js/sim/config-defaults.js` / `config-rules.js`, and `js/evo/scene-scent.js` + `js/evo/metric-registry/`. Zero change to `brain-layout.js`, worker, renderer or UI |
| Unit tests              | `test/sim/scent-trails.test.js` (still agent below `trackSpeedMin` deposits 0; sprinting agent deposits `trackDeposit`; fading carcass deposits `carrionDeposit`; expired carcass deposits 0); `test/evo/scene-scent.test.js`             |
| Headless e2e            | `test/sim/golden.json` and `BUSY_EFFECT_HASH` unchanged in Phase 1 and re-pinned at Phase 2 switch with `npm run browser:hash`; `eval-smoke` passes                                                                                       |
| Performance budget      | `bench.step_ms@500` within `bench-check` margin; deposits reuse the existing pheromone grid with one array write per fast agent / active carcass and zero allocations                                                                     |
| Evolution metrics       | Phase 1: `E-ST2-1` (16 seeds). Phase 2: 16-seed screen (`E-ST2-2`) and 64-seed `eval:compare --keep-rule` (`E-ST2-3`)                                                                                                                     |
| Determinism             | No new RNG stream; deposits are deterministic functions of speed, carcass state and grid coordinates                                                                                                                                      |
| Config and persistence  | New keys: `scentTrailsEnabled` (boolean switch with `scripts/flag-ledger.json` entry, deleted at Phase 2 switch), `trackSpeedMin`, `trackDeposit`, `carrionDeposit`. Saved genomes and `BRAIN_LAYOUT_NAME` unchanged                      |
| Logging and diagnostics | No per-tick log event; `npm run replay -- --seed <n> --ticks 400000 --level debug` reproduces trails and carcass approaches                                                                                                               |
| Browser compatibility   | Verified with `npm run browser:hash` after Phase 2 switch                                                                                                                                                                                 |
| Docs                    | [metrics.md](metrics.md) regenerated; [sim-notes.md](sim-notes.md) entry for baseline and verdict                                                                                                                                         |
| Verification            | `scripts/check.sh` green per chunk PR; `eval:compare --keep-rule` report under `evals/decisions/E-ST2-*/`; arena clip of tracking and scavenging                                                                                          |

## Task breakdown

### Phase 1 - Off-ray tracking detectors and baseline

| #   | Task                                                                                                                                                                                                                                    | Nature       | Depends on  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| T1  | Add `js/evo/scene-scent.js` (`eval.chase_reacquire_share`, `eval.scavenge_approach_share`), registry + `liveness.js` entries and `test/evo/scene-scent.test.js`                                                                         | [judgement]  | -           |
| T2  | Run `E-ST2-1` (16 seeds x 400,000 ticks) baseline and record in [sim-notes.md](sim-notes.md)                                                                                                                                            | [mechanical] | T1          |
| T2a | Stage a hand-laid trail in the probe arena and read the oracle, the antenna-only reference and `probe:learn` on it, at two decays; run the `scent-after-sight-loss` probe on today's champions; write whether Phase 2 opens (`E-ST2-0`) | [judgement]  | T2          |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                     | [judgement]  | T1, T2, T2a |

### Phase 2 - Track scent and carrion scent

| #   | Task                                                                                                                                                                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T3a | Add channel-interference and stale-source fixtures with observer tests; specify scent ablations and wrong-source approach costs                                                                                                         | [judgement]  | T3         |
| T4  | Add `trackSpeedMin`, `trackDeposit` and `carrionDeposit` in `pheromones.js` and `carcass.js` behind `scentTrailsEnabled`; add `test/sim/scent-trails.test.js`                                                                           | [judgement]  | T3a        |
| T4a | Price the deposits: `npm run bench:parts -- --area field --compare <base>` and `--area brain` under the CPU lock with the switch on, and the nonzero inputs per agent; a step outside its margin goes into the keep-rule read as a cost | [mechanical] | T4         |
| T5  | Write `evals/screens/scent-trails.grid.json` (the five arms of Test design) and prediction; run the 16-seed screen `E-ST2-2` at 200000 ticks, with hunters per carcass in the report                                                    | [judgement]  | T4, T4a    |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-ST2-3`)                                                                                                                                                             | [mechanical] | T5         |
| T7  | Switch: adopt winning scent defaults, delete `scentTrailsEnabled`, open new season, re-pin goldens and `browser:hash`; watch arena clip                                                                                                 | [judgement]  | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented`                                                                                                                  | [judgement]  | T7         |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports `eval.chase_reacquire_share` and `eval.scavenge_approach_share`.
3. Phase 2: 64-seed `eval:compare --keep-rule` report committed under `evals/decisions/E-ST2-3/`, `npm run browser:hash` matches re-pinned goldens, and the arena clip shows off-ray tracking and scavenging.
