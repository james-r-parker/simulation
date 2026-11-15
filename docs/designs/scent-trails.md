# Scent trails and carrion scent

**Status:** Proposed - add decaying movement/track scents behind fast-moving blobs and far-carrying carcass scents around kills (reusing the existing `attack`/`danger` pheromone antennae) so hunters can track prey off-ray and scavengers find kills beyond `visionRange`; Phase 1 (off-ray tracking detectors and baseline) is first.
**Validated:** 5abe7bfb (2026-11-15)
**Priority:** 32 - builds on [honest-budgets.md](honest-budgets.md) (body-priced carcasses) and [stillness.md](stillness.md) (motionless concealment)
**Depends on:** [honest-budgets.md](honest-budgets.md), [stillness.md](stillness.md)

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
| Scent discrimination | Track scent deposits to `world.attack` (or a shared prey/carrion channel read by `HUNT_SCENT` antennae) while `danger` stays alarm/bite danger | Zero layout change; hunters already have antennae wired to `HUNT_SCENT`       |

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

| Chunk | Tasks    | Contents                                                                             |
| ----- | -------- | ------------------------------------------------------------------------------------ |
| A     | T1 to T3 | `scene-scent.js`, registry entries, tests, `E-ST2-1` baseline and conformance review |

### Phase 2 - Track scent and carrion scent

**Targets:** eval.chase_catch_share, eval.hunter_income_share.carcass, eval.hunter_juvenile_death_share

Add `trackDeposit`, `trackSpeedMin` and `carrionDeposit` behind `scentTrailsEnabled` in `js/sim/pheromones.js` and `js/sim/carcass.js` (and `wasm/src/pheromones.rs` if touched). Screen (`E-ST2-2`, 16 seeds) and judge by the 64-seed keep rule (`E-ST2-3`), checking that juvenile scavenging and off-ray chase re-acquisition rise without tanking `bench.step_ms@500`.

#### Chunks

| Chunk | Tasks         | Contents                                             |
| ----- | ------------- | ---------------------------------------------------- |
| B     | T3a, T4 to T8 | Channel checks, deposits, screens, switch and review |

### Scent must carry usable local evidence

T3a checks the shared channel before deposit tuning: prey tracks, carrion and existing hunt signals may attract to different things. Fixtures cover a dead trail, an exhausted carcass, crossing trails, a rock barrier and slot reuse. No source identity or target coordinates enter the brain. Compare track-only, carrion-only and combined arms against the same no-scent control; report wrong-source approaches and time/energy wasted as well as successful reacquisition. Scent diffusion must not provide an effortless route through sealed cover. T6 includes juvenile access to carcasses and hunter descendant replacement from [honest-budgets.md](honest-budgets.md) Phase 6 before adoption. More approaches without food or offspring is not a success. Replay clips show a lost trail and a late scavenger finding a depleted body as well as successful tracking.

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

| #   | Task                                                                                                                                                            | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-scent.js` (`eval.chase_reacquire_share`, `eval.scavenge_approach_share`), registry + `liveness.js` entries and `test/evo/scene-scent.test.js` | [judgement]  | -          |
| T2  | Run `E-ST2-1` (16 seeds x 400,000 ticks) baseline and record in [sim-notes.md](sim-notes.md)                                                                    | [mechanical] | T1         |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                             | [judgement]  | T1, T2     |

### Phase 2 - Track scent and carrion scent

| #   | Task                                                                                                                                                          | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T3a | Add channel-interference and stale-source fixtures with observer tests; specify scent ablations and wrong-source approach costs                               | [judgement]  | T3         |
| T4  | Add `trackSpeedMin`, `trackDeposit` and `carrionDeposit` in `pheromones.js` and `carcass.js` behind `scentTrailsEnabled`; add `test/sim/scent-trails.test.js` | [judgement]  | T3a        |
| T5  | Write `evals/screens/scent-trails.grid.json` and prediction; run 16-seed screen `E-ST2-2`                                                                     | [judgement]  | T4         |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-ST2-3`)                                                                                   | [mechanical] | T5         |
| T7  | Switch: adopt winning scent defaults, delete `scentTrailsEnabled`, open new season, re-pin goldens and `browser:hash`; watch arena clip                       | [judgement]  | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented`                                        | [judgement]  | T7         |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports `eval.chase_reacquire_share` and `eval.scavenge_approach_share`.
3. Phase 2: 64-seed `eval:compare --keep-rule` report committed under `evals/decisions/E-ST2-3/`, `npm run browser:hash` matches re-pinned goldens, and the arena clip shows off-ray tracking and scavenging.
