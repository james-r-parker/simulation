# Lean observer

**Status:** Proposed - one phase: the app's sim worker runs the observer without the eval-only detectors.
**Validated:** 3f8bf122 (2026-11-12)
**Priority:** 2 - a worker-only change that moves no sim behaviour, so it does not wait on the balance work

The app's sim worker builds the full eval observer (`buildRun` in [host-world.js](../../js/worker/host-world.js) calls
`createObserver`) and feeds it every tick through `feedPolicy` in [feed-policy.js](../../js/evo/feed-policy.js). The
live policy reads only part of it, and the app's panels read a few run counters. The rest feeds `computeMetrics` in
[metrics.js](../../js/evo/metrics.js), which the app never calls. A lean observer runs the part the policy and the
panels read and skips the rest.

## What the live run reads

| Reader                                                | Observer state it reads                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fitnessV6` (`js/evo/fitness-v6*.js`)                 | `intent`, the slot counters (`ageTicks`, `children`, `kills`, `foodEnergy`, `biteEnergy`, `spec`), `maturedChildren`, `descendantsAlive`                                                                                                                                      |
| The `map-elites-v6` archive (`js/evo/policies/`)      | `deaths` and its `fitness` rows, the role skill (`roleSkillOf` in [descriptors.js](../../js/evo/descriptors.js)), the style scene ([style.js](../../js/evo/style.js)) and the terrain scene's ring geometry (`inRefuge` in [scene-terrain.js](../../js/evo/scene-terrain.js)) |
| The app's panels (`js/worker/live-stats.js`, inspect) | `combat`, `births`, `birthsAfterBurnIn`, `deathsByCause`, `deathCount`, `deathsDrained`, `slotOf`                                                                                                                                                                             |

## The lean mode

`createObserver(config, rng, { lean: true })` builds an observer whose `lean` field is `true`. `observe` then runs the
policy core and skips the eval layer.

| Step of `observe`                                                                             | Policy core (runs when lean)                                                                                                                                                                                | Eval layer (skipped when lean)                                                                         |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Combat and intent                                                                             | `observeCombat`, `updateIntent`, `noteIntentEvents`                                                                                                                                                         | -                                                                                                      |
| Chases (`noteChase` in [observer-watch-counters.js](../../js/evo/observer-watch-counters.js)) | `creditBite` and its `noteStyleBite` call, which build the style scene's bite chains                                                                                                                        | the watch counters and the competence and matched scenes' chase notes                                  |
| Scenes (`observeScenes`)                                                                      | `tickStyle`, and in the birth and death notes (`noteEvents`, `resetSceneSlot`) only `noteStyleAtDeath`, `noteStyleDeath` and `resetStyleSlot`                                                               | every other scene's tick, sample, birth, death and slot reset                                          |
| Events (`applyEvents`)                                                                        | `finishDeath` (the death log and its fitness), `noteFloor`, `resetIntentSlot`, and the lineage counters behind `descendantsAlive` (`noteBirthLineage`, `recordParents`, `readDescendants`, `releaseDeaths`) | the lineage, parentage, environment, merit, mate, split, body and brain pools fed on births and deaths |
| Per tick                                                                                      | `noteMatured`, `countTick`                                                                                                                                                                                  | `snapshotMerit`, `sampleVisits`, `trackCircling`, `observeBrain`, `noteWindows`                        |
| `observerPhases`                                                                              | the physics phase                                                                                                                                                                                           | `countCollisions`                                                                                      |

`checkpoint` is never called by `observe`, and a lean observer refuses it. `createScenes` takes the same flag and
builds only the style and terrain scenes when lean; the terrain scene keeps the ring geometry `inRefuge` reads, and
`sampleTerrain` does not run. `computeMetrics` and `checkpoint` throw `<name>: the observer is lean` on a lean
observer. `buildRun` passes `{ lean: true }`; eval, replay, bench, the trainer, the league, the probes and the screens
keep the full observer.

> Note: a call that moves from the policy core to the eval layer changes what the live policy selects on. The
> equality test (T2) catches it: a lean and a full observer fed the same world give the same archive, death log and
> panel counters.

## Phases

### Phase 1 - The lean observer in the worker

**Targets:** bench.observe_ms@500

- `observe`, `applyEvents`, `noteChase` and `createScenes` honour `lean`; `computeMetrics` and `checkpoint` refuse a lean observer.
- A lean and a full observer on the same seeded world give identical policy and panel state over 6000 ticks.
- `npm run bench -- --policy live` reports `bench.observe_ms@500` (the `feedPolicy` time per tick) for the full and the
  lean observer; done when the lean one is at most 0.7 of the full one at 500 agents.
- `buildRun` uses the lean observer.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | `js/evo/observer.js` (`createObserver` option `lean`; `observe` and `observerPhases` skip the eval layer), `js/evo/observer-scenes.js` (`createScenes` and `observeScenes` build and feed only the style and terrain scenes when lean), `js/evo/metrics.js` (`computeMetrics` refusal), `js/worker/host-world.js` (`buildRun` passes `lean`). The layer split moves to `js/evo/observer-layers.js` if `observer.js` passes 300 lines                                                                                                             |
| Unit tests              | `test/evo/observer-lean.slow.test.js`: a lean and a full observer stepping the same seeded `SIMPLE_WORLD` with the live policy for 6000 ticks give the same archive cells and elites, `deaths.fitness` rows, `intent` totals, style rows and panel counters. `test/evo/observer-lean.test.js`: `computeMetrics` and `checkpoint` throw on a lean observer; a lean observer builds no scene but style and terrain; a birth and a death on a lean observer touch no eval pool. `test/worker/host-world.test.js`: `buildRun` builds a lean observer |
| Headless e2e            | The golden runs are unchanged (`test/sim/golden.json`, all cases); `test/worker/sim-host.slow.test.js` keeps its busy `worldHash` and effect stream through a lean observer                                                                                                                                                                                                                                                                                                                                                                      |
| Performance budget      | `bench.observe_ms@500` added to `scripts/bench.mjs` for `--policy` runs, full and lean; the lean value at most 0.7 of the full value at 500 agents under the CPU lock, with a row in the Metrics table of `docs/designs/evolution-evals.md`. `bench.step_ms@500` without `--policy` is unchanged; with `--policy` it times `step` plus `feedPolicy`, so it falls with the observer                                                                                                                                                               |
| Evolution metrics       | N/A - eval runs keep the full observer, and the unit test pins the live policy's state equal                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Determinism             | The world never reads the observer, and the lean mode keeps every piece of policy-side state; the equality test pins identical policy state from the same seed and config                                                                                                                                                                                                                                                                                                                                                                        |
| Config and persistence  | N/A - `lean` is an observer option, not a config key, so `rulesHash`, champion files and saved archives are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Logging and diagnostics | `computeMetrics` on a lean observer throws with the message above; the worker logs nothing new. A mismatch is reproduced from the equality test's seed and tick count                                                                                                                                                                                                                                                                                                                                                                            |
| Browser compatibility   | N/A - no new browser API; the worker changes only the option it passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Docs                    | `docs/designs/evolution-evals.md` (the observer section names the two layers), `docs/designs/worker-and-renderer.md` (the host builds a lean observer); this doc becomes `Implemented`                                                                                                                                                                                                                                                                                                                                                           |
| Verification            | `scripts/check.sh` green; `npm run perf:browser` before and after shows no frame-time regression; in `npm run dev`, the stats panel, the inspector and the champion archive fill as on `main`                                                                                                                                                                                                                                                                                                                                                    |

## Task breakdown

### Phase 1 - The lean observer in the worker

| #   | Task                                                                                                                                                                                                      | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | `createObserver` option `lean`; `observe`, `observerPhases`, `noteChase`, `applyEvents`, `createScenes` and `observeScenes` skip the eval layer; `computeMetrics` and `checkpoint` refuse a lean observer | [judgement]  | -          |
| T2  | `test/evo/observer-lean.slow.test.js` and `test/evo/observer-lean.test.js`: the lean and full observers give identical policy and panel state over 6000 ticks                                             | [judgement]  | T1         |
| T3  | `bench.observe_ms@500` in `scripts/bench.mjs` for `--policy` runs, full and lean, and its Metrics table row                                                                                               | [mechanical] | T1         |
| T4  | `buildRun` passes `{ lean: true }`; the host tests and `test/worker/sim-host.slow.test.js` pass unchanged                                                                                                 | [mechanical] | T2         |
| T5  | Measure `bench.observe_ms@500` full and lean under the CPU lock, and `npm run perf:browser`; the docs updated                                                                                             | [mechanical] | T3, T4     |
| T6  | Conformance review by a fresh agent in parallel with `scripts/check.sh`; status line moved                                                                                                                | [judgement]  | T5         |

## Verification

1. `scripts/check.sh` passes.
2. `flock /tmp/claude-1000/cpu.lock npm run bench -- --policy live --sizes=500` prints `bench.observe_ms@500` for both
   observers, the lean one at most 0.7 of the full one.
3. `npm run dev`: the stats panel counts births, deaths and kills, the inspector opens an agent, and the archive view
   fills, as on `main`.
