# Scent trails and carrion scent

**Status:** In progress - Phase 1 detectors and E-ST2-1 baseline complete (E210); the trail probe remains before Phase 2.
**Validated:** 3a150d75 (2026-11-17)
**Scheduled by:** [fair-chase.md](fair-chase.md) step 9 - trail and carrion scent; it builds on stillness.md and on body-priced carcasses
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

| Metric                         | Direction | Reads                                                                                                                                                                     |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.chase_reacquire_share`   | higher    | Share of resolved chases where the prey sighting returns after at least one unseen tick, within `REACQUIRE_WINDOW` (120) ticks; ray summaries do not expose prey identity |
| `eval.scavenge_approach_share` | higher    | Share of blob-carcass meals preceded by closing along the carcass direction from outside `visionRange`; herd carcasses are tallied separately by `scene-herd.js`          |

## Phases

### Phase 1 - Off-ray tracking detectors and baseline

**Targets:** none - detectors only; `worldHash` and golden cases are unchanged

The baseline is the shared run of [detector-baseline.md](detector-baseline.md), read once for every plan that has its prediction written. The trail-following probe remains a Phase 2 entry gate.

Add `js/evo/scene-scent.js` with `eval.chase_reacquire_share` and `eval.scavenge_approach_share`. The detector-baseline top-up measures them after all detector plans land. Before Phase 2, run the hand-laid trail probe and the `scent-after-sight-loss` champion probe.

Baseline (`evals/power/defaults-floor-on-E210.json`, 128 seeds, 200000 ticks, `rulesHash` `38be2908ad820c86`):

| Metric                             | Mean   | Range            | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| ---------------------------------- | ------ | ---------------- | -------- | ------ | ------ | ------ | --------------------- |
| `eval.chase_reacquire_share`       | 0.394  | 0.245 to 0.5501  | 0.007813 | 0.075  | 0.05   | -      | 32                    |
| `eval.scavenge_approach_share`     | 0.0234 | 0 to 0.09917     | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.chase_catch_share`           | 0.2657 | 0.155 to 0.3871  | 0.007813 | 0.05   | 0.05   | -      | 16                    |
| `eval.hunter_income_share.carcass` | 0.1503 | 0.0872 to 0.1926 | 0        | 0.03   | 0.03   | 0.03   | 16                    |
| `eval.hunter_juvenile_death_share` | 0.8565 | 0.4689 to 0.9888 | 0        | 0.1    | 0.05   | 0.05   | 32                    |

Verdict (E-ST2-1, E210): Partially falsified. `eval.scavenge_approach_share` (0.0234) is under 0.05 as predicted, while `eval.chase_reacquire_share` (0.394) is above the predicted 0.1 ceiling (hunters already re-acquire lost prey in 39.4% of chases without track scent). Both metrics are `verified` (32 and 16 seeds). The trail probe (T5) remains before Phase 2.

#### Chunks

| Chunk     | Tasks    | Contents                                                         |
| --------- | -------- | ---------------------------------------------------------------- |
| A (built) | T1 to T4 | `scene-scent.js`, registry entries, tests and conformance review |

### Phase 2 - Track scent and carrion scent

**Targets:** eval.chase_catch_share, eval.hunter_income_share.carcass, eval.hunter_juvenile_death_share

Add `trackDeposit`, `trackSpeedMin` and `carrionDeposit` behind `scentTrailsEnabled` in `js/sim/pheromones.js` and `js/sim/carcass.js` (and `wasm/src/pheromones.rs` if touched). Screen (`E-ST2-2`, 16 seeds) and judge by the 64-seed keep rule (`E-ST2-3`), checking that juvenile scavenging and off-ray chase re-acquisition rise without tanking `bench.step_ms@500`.

#### Chunks

| Chunk | Tasks               | Contents                                                          |
| ----- | ------------------- | ----------------------------------------------------------------- |
| B     | T5 to T10, T5a, T6a | Trail probe, channel checks, deposits, screens, switch and review |

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
| S1  | A track in `attack` makes prey smell "a hunter bit here" along their own path and their herd's. A track in `hunt` reads as a hunt call. Either reuse changes what an existing input means for every brain that learned it  | T5a        |
| S2  | A trail has two ends. At a decay of 0.17% a tick the scent along a trail differs by under 2% between antennae 200 px apart, so the fresh end may not be readable; a blob may follow a trail backwards as often as forwards | T5         |
| S3  | A receptive-mate scent was built as a new input and mate-ready males did not learn to follow it (`E168`, [low-density-edge.md](low-density-edge.md) Phase 5). The same may hold here                                       | T5         |
| S4  | The memory probe already stages this: `scent-after-sight-loss` in `js/evo/memory-probe-scenarios.js`. Its score on today's champions is the baseline a trail has to beat                                                   | T5         |
| S5  | Every moving prey writes a cell each tick. The pheromone kernel skips rows that are all zero ([wasm-kernels.md](wasm-kernels.md) T22) and the brain skips zero inputs; a map covered in track scent loses both             | T6a        |
| S6  | A carcass that glows beyond sight pulls every meat-eater to one place. With the kill as the body ([honest-budgets.md](honest-budgets.md) Phase 2) that may starve juveniles at a crowd, not feed them                      | T7         |

### The trail must be followable before it is built

T5 stages a trail in the probe arena with a hand-written deposit (no sim change): a prey walked along a path, then removed from sight. It reads three bars for "reach the prey's last position along the trail": the oracle, a scripted reference that reads only the antenna inputs, and `npm run probe:learn` from random brains ([senses-and-motor.md](senses-and-motor.md), Lesson probes). Phase 2 is built only when the reference re-acquires on at least half of trials and the learn probe reaches half of the reference. If the reference fails, the gradient is too weak to carry direction: the fix is in the scent (a faster decay for the track grid, so the fresh end is stronger), and it is screened as its own arm, not by adding an input.

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

| Decision                                                              | Why                                                                                                           | Who                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| A staged trail is shown followable before any deposit is built        | `E168` built a scent no brain followed; a trail whose fresh end cannot be read is a number that moves nothing | Delegated (plan review, 2026-11-15)    |
| The grid a track uses is chosen by test, and its old meaning is named | `attack` and `hunt` are read by brains that learned them as a bite and a call                                 | Delegated (plan review, 2026-11-15)    |
| Track and carrion are separate arms                                   | They serve different scenes and may harm differently                                                          | Delegated (plan review, 2026-11-15)    |
| Detector metrics use the shared detector top-up                       | One current-default baseline measures every new detector on the same run conditions                           | Delegated (implementation, 2026-11-17) |
| The step cost is priced before the screen                             | Dense scent defeats two zero-skips the step relies on                                                         | Delegated (plan review, 2026-11-15)    |

## Experiments

| Id      | Task                                            | Question                                                 | Prediction (written before the run)                                                                                                                          |
| ------- | ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E-ST2-1 | [detector-baseline.md](detector-baseline.md) T3 | How often is a lost prey found again today?              | `eval.chase_reacquire_share` under 0.1; `eval.scavenge_approach_share` under 0.05; the probe's `scent-after-sight-loss` gain inside its noise                |
| E-ST2-0 | T5                                              | Can a trail be followed with two antennae?               | At `pheromoneDecay` the reference re-acquires on under half of trials and follows the trail backwards on a third; at 5 x decay it passes half                |
| E-ST2-2 | T7                                              | Which arm lets hunters re-acquire and scavengers arrive? | `track-f` lifts re-acquisition and `track` does not; `carrion` lifts scavenge approaches and raises the hunters at one carcass; no arm reads hunters `WORSE` |
| E-ST2-3 | T8                                              | Does the finalist harm on 64 matched seeds?              | No guard `WORSE`; `eval.hunter_juvenile_death_share` not higher                                                                                              |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/pheromones.js`, `js/sim/carcass.js`, `js/sim/scent-inputs.js`, `js/sim/config-defaults.js` / `config-rules.js`, and `js/evo/scene-scent.js` + `js/evo/metric-registry/`. Zero change to `brain-layout.js`, worker, renderer or UI                                                                                     |
| Unit tests              | `test/evo/scene-scent.test.js` (gap and window boundaries, recent carcass approach from beyond sight, within-sight and retreating paths, null metrics); `test/evo/scene-carcass.test.js` (food slot reuse resets carcass lifetime); `test/evo/metric-registry/scenes-scent.test.js`; `test/evo/metric-source-ecology.test.js` |
| Headless e2e            | `test/sim/golden.json` and `BUSY_EFFECT_HASH` unchanged in Phase 1 and re-pinned at Phase 2 switch with `npm run browser:hash`; `eval-smoke` passes                                                                                                                                                                           |
| Performance budget      | `bench.step_ms@500` within `bench-check` margin; deposits reuse the existing pheromone grid with one array write per fast agent / active carcass and zero allocations                                                                                                                                                         |
| Evolution metrics       | Phase 1: shared detector-baseline run (128 floor-on and 128 floor-off seeds, 200000 ticks). Phase 2: 16-seed screen (`E-ST2-2`) and 64-seed `eval:compare --keep-rule` (`E-ST2-3`)                                                                                                                                            |
| Determinism             | No new RNG stream; deposits are deterministic functions of speed, carcass state and grid coordinates                                                                                                                                                                                                                          |
| Config and persistence  | New keys: `scentTrailsEnabled` (boolean switch with `scripts/flag-ledger.json` entry, deleted at Phase 2 switch), `trackSpeedMin`, `trackDeposit`, `carrionDeposit`. Saved genomes and `BRAIN_LAYOUT_NAME` unchanged                                                                                                          |
| Logging and diagnostics | No per-tick log event; `npm run replay -- --seed <n> --ticks 400000 --level debug` reproduces trails and carcass approaches                                                                                                                                                                                                   |
| Browser compatibility   | Verified with `npm run browser:hash` after Phase 2 switch                                                                                                                                                                                                                                                                     |
| Docs                    | [metrics.md](metrics.md) regenerated; [sim-notes.md](sim-notes.md) entry for baseline and verdict                                                                                                                                                                                                                             |
| Verification            | `scripts/check.sh` green per chunk PR; `eval:compare --keep-rule` report under `evals/decisions/E-ST2-*/`; arena clip of tracking and scavenging                                                                                                                                                                              |

## Task breakdown

### Phase 1 - Off-ray tracking detectors and baseline

| #   | Task                                                                                                                                         | Nature       | Depends on  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| T1  | Implement `js/evo/scene-scent.js` and wire chase and carcass observers (built)                                                               | [judgement]  | -           |
| T1a | Pin the dead-slot, burn-in, no-scent and carcass-credit branches in observer tests (built)                                                   | [mechanical] | T1          |
| T2  | Register both metrics and add registry and real-source tests (built)                                                                         | [mechanical] | T1a         |
| T3  | Regenerate [metrics.md](metrics.md) and `test/fixtures/metric-names.json`; add both metric rows to [principles.md](../principles.md) (built) | [mechanical] | T2          |
| T4  | Conformance review of the detector chunk by a fresh agent, in parallel with `scripts/check.sh` (built)                                       | [judgement]  | T1a, T2, T3 |

### Phase 2 - Track scent and carrion scent

| #   | Task                                                                                                                                                                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T5  | Stage the hand-laid trail, read the oracle, antenna-only reference and `probe:learn` at two decays, and run `scent-after-sight-loss` on champions; record whether Phase 2 opens (`E-ST2-0`)                                             | [judgement]  | -          |
| T5a | Add channel-interference and stale-source fixtures with observer tests; specify scent ablations and wrong-source approach costs                                                                                                         | [judgement]  | T5         |
| T6  | Add `trackSpeedMin`, `trackDeposit` and `carrionDeposit` in `pheromones.js` and `carcass.js` behind `scentTrailsEnabled`; add `test/sim/scent-trails.test.js`                                                                           | [judgement]  | T5a        |
| T6a | Price the deposits: `npm run bench:parts -- --area field --compare <base>` and `--area brain` under the CPU lock with the switch on, and the nonzero inputs per agent; a step outside its margin goes into the keep-rule read as a cost | [mechanical] | T6         |
| T7  | Write `evals/screens/scent-trails.grid.json` (the five arms of Test design) and prediction; run the 16-seed screen `E-ST2-2` at 200000 ticks, with hunters per carcass in the report                                                    | [judgement]  | T6, T6a    |
| T8  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-ST2-3`)                                                                                                                                                             | [mechanical] | T7         |
| T9  | Switch: adopt winning scent defaults, delete `scentTrailsEnabled`, open new season, re-pin goldens and `browser:hash`; watch arena clip                                                                                                 | [judgement]  | T8         |
| T10 | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented`                                                                                                                  | [judgement]  | T9         |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports `eval.chase_reacquire_share` and `eval.scavenge_approach_share`.
3. Phase 2: 64-seed `eval:compare --keep-rule` report committed under `evals/decisions/E-ST2-3/`, `npm run browser:hash` matches re-pinned goldens, and the arena clip shows off-ray tracking and scavenging.
