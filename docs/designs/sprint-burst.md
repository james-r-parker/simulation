# Sprint burst

**Status:** Implemented - Phase 1 detectors kept; Phase 2 gate not met on E210 (T3).
**Depends on:** [honest-budgets.md](honest-budgets.md), [training-stages.md](training-stages.md)

A positive `SPRINT` output multiplies thrust by `1 + sprintMultiplier x sprintBoost` (`thrustOf` in `js/sim/physics.js`), raises the speed cap in the Rust kernel (`move_agent` in `wasm/src/physics.rs`), and adds a fixed `sprintCost` (0.05) times juvenile burn to that tick's energy cost (`tickCost` in `js/sim/energy.js`). The fixed cost does not scale with output magnitude; speed-dependent movement cost also rises as speed squared. Temperature efficiency scales the sprint thrust with ordinary thrust. The hunter ledger records the realized sprint cost only for hunters. Phase 1 instead tallies the configured nominal charge for both roles and divides it by total energy removed from agents. This cost ratio can exceed 1 on energy-limited ticks because the nominal charge is not clipped to realized energy removal; only a very low ratio is evidence that the configured sprint price is negligible. No metric currently reads `SPRINT`. This phase measures its use before any rule change.

Scenes served: **A real chase** (a chase ends because one side is spent), **Abort** (a hunter that is spent peels off), **Same spec, different custom** (a short burst against a long run), and the trait "A body is a budget".

## Nature model

Sources are cited from memory and are to be checked before a number from them is relied on.

| Behaviour in nature                                                                                                            | Maps to                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| A cheetah's chase lasts well under a minute; it stops when spent and rests before eating (Wilson et al. 2013, Nature)          | A burst store that empties in one chase and refills at rest                  |
| Wolves and wild dogs run prey down over long distances at lower speed (Creel and Creel 1995)                                   | A large store with a small boost: a second custom of the same specialisation |
| Prey that reach a lead outlast a sprinter; a stotting gazelle signals it has reserve (Caro 1986; FitzGibbon and Fanshawe 1988) | The chase is decided by who empties first, not by top speed                  |
| Burst exercise is anaerobic and is repaid at rest (Bennett 1991, J Exp Biol)                                                   | The store refills only while thrust is low                                   |

## Detectors

All computed by the eval observer; none is a reward.

| Metric                     | Direction      | Reads                                                                                                                      |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `eval.sprint_share.hunter` | watch (lower)  | Hunter agent-ticks with `SPRINT` above 0 over hunter agent-ticks, after burn-in                                            |
| `eval.sprint_share.prey`   | watch (lower)  | The same for non-hunters                                                                                                   |
| `eval.chase_sprint_lift`   | higher         | A hunter's sprint share inside its chases over its sprint share outside them; 1 means the sprint does not follow the chase |
| `eval.flee_sprint_lift`    | higher         | A non-hunter's sprint share while a threat is on its rays over its share while calm                                        |
| `eval.sprint_cost_share`   | watch (higher) | Nominal configured sprint charge over total energy removed; may exceed 1 when energy limits clip realized costs            |
| `eval.chase_spent_share`   | watch (higher) | Phase 2 only: of resolved chases, those in which the hunter's or the prey's store reached 0 before the chase resolved      |

## Phases

### Phase 1 - Detectors and baseline

**Targets:** none - detectors only; `worldHash` and the golden cases are unchanged

The baseline is the shared run of [detector-baseline.md](detector-baseline.md), read once for every plan that has its prediction written. Sprint metrics are included in that top-up; there is no separate 16-seed E-SB-1 run.

The first five detectors. Prediction for the shared top-up, written before that run: `eval.sprint_share.hunter` is above 0.5 and `eval.chase_sprint_lift` is under 1.2, so the sprint is held, not chosen. Phase 2 is built only if the sprint share is above 0.5 for either role or the nominal `eval.sprint_cost_share` is under 0.02, evidence that its configured price is negligible relative to energy outflow; otherwise this doc closes with the detectors kept.

Baseline (`evals/power/defaults-floor-on-E210.json`, 128 seeds, 200000 ticks, `rulesHash` `38be2908ad820c86`):

| Metric                     | Mean    | Range             | Null     | MDE 16 | MDE 32 | MDE 64 | Seeds a verdict needs |
| -------------------------- | ------- | ----------------- | -------- | ------ | ------ | ------ | --------------------- |
| `eval.sprint_share.hunter` | 0.4086  | 0.06814 to 0.8781 | 0        | 0.2    | 0.15   | 0.1    | more than 64          |
| `eval.sprint_share.prey`   | 0.4463  | 0.08054 to 0.8235 | 0        | 0.15   | 0.15   | 0.075  | more than 64          |
| `eval.chase_sprint_lift`   | 1.117   | 0.2275 to 5.024   | 0.007813 | 0.75   | 0.75   | -      | more than 64          |
| `eval.flee_sprint_lift`    | 1.105   | 0 to 2.65         | 0.02344  | 0.5    | 0.3    | -      | more than 64          |
| `eval.sprint_cost_share`   | 0.05363 | 0.0116 to 0.128   | 0        | 0.5    | 0.3    | 0.2    | 64                    |

Verdict (E210): `eval.sprint_share.hunter` (0.4086) and `eval.sprint_share.prey` (0.4463) are both at or under 0.5, and `eval.sprint_cost_share` (0.05363) is above 0.02 (`eval.chase_sprint_lift` is 1.117, under 1.2). The Phase 2 gate is not met; Phase 2 is not built and this doc closes with the Phase 1 detectors kept.

### Phase 2 - The store

**Targets:** eval.chase_catch_share, eval.chase_escape_share, eval.hunt_abort_rate

A per-agent store `sprintStore` (0 to 1). It drains by `sprintDrain` a tick while `SPRINT` is above 0 and refills by `sprintRefill` a tick while thrust is under `sprintRestThrust`. The sprint's factor on thrust and its rise of the speed cap are both multiplied by the store's state: full above `sprintFloor`, falling linearly to 0 at an empty store. `sprintCost` stays. No brain input is added in the first screen: a spent blob feels its own forward speed fall (the velocity body inputs). The store joins `worldHash` only with `sprintStoreEnabled` on.

| Arm       | `sprintDrain` | `sprintRefill` | Reading                            |
| --------- | ------------- | -------------- | ---------------------------------- |
| `control` | 0             | -              | Today                              |
| `burst`   | 0.01          | 0.002          | 100 ticks of sprint, 500 to refill |
| `long`    | 0.004         | 0.002          | 250 ticks of sprint                |
| `spec`    | by spec       | 0.002          | Predators 0.012, the others 0.006  |

| Done when                                                                                                                                             | Stop when               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `eval.chase_sprint_lift` or `eval.flee_sprint_lift` is `better` on 16 seeds and `eval:compare --keep-rule` on 64 matched seeds reads no guard `WORSE` | Every arm reads `WORSE` |

### Phase 3 - Adopt or delete

**Targets:** eval.chase_catch_share, eval.predators_at_end

The keep rule decides ([principles.md](../principles.md), "A realistic mechanism stays"). An arm with no guard `WORSE` on 64 matched seeds and a step inside its margin becomes the default even if neither lift moved; the switch and its off path are deleted and the golden cases re-pinned. The store, its keys and its ledger entry are deleted only when every arm reads `WORSE`, or the step is slower than its margin and no scene metric moved. The detectors stay either way.

## Decisions

| Decision                                                                  | Why                                                                                                                                                          | Who                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Measure before building                                                   | No metric reads the sprint today; a store built on a guess is a number that only moves a number                                                              | Delegated (planning, 2026-11-15) |
| No new brain input in the first screen                                    | A new input is a cost that needs a scene metric to move ([principles.md](../principles.md)); the blob already senses its own speed                           | Delegated (planning, 2026-11-15) |
| Body heat is not reused as the store                                      | [body-temperature.md](body-temperature.md) prices over-eating and sitting over hundreds of ticks; a burst is tens of ticks, and T1 records what sprint heats | Delegated (planning, 2026-11-15) |
| The Rust kernel change is built by Opus, and the JS reference is the test | The sprint's speed cap lives in `wasm/src/physics.rs` (user, 2026-11-07)                                                                                     | Planner, from the user's rule    |
| The switch `sprintStoreEnabled` is deleted at Phase 3 on either verdict   | Delete what a switch replaces (`AGENTS.md`)                                                                                                                  | Planner, from AGENTS.md          |
| Keep Phase 1 observer-only and use the shared detector top-up             | The hunter ledger omits prey sprint cost; recomputing the configured sprint charge in the observer covers both roles without changing sim state or rules     | Delegated (planning, 2026-11-17) |
| Call the sprint cost detector a nominal ratio                             | Energy-limited ticks may remove less than the configured sprint charge, so this ratio can exceed 1 and only a very low read signals a negligible price       | Delegated (review, 2026-11-17)   |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Phase 1: `js/evo/scene-sprint.js` and its registry entries. Phase 2: `js/sim/sprint-store.js` (drain, refill, factor), read in the thrust step of `js/sim/physics.js` and the Rust physics kernel (`wasm/src/physics.rs`, built by `scripts/build-wasm.sh`)                |
| Unit tests              | `test/evo/scene-sprint.test.js` (a brain that always sprints reads share 1 and lift 1; one that sprints only in a chase reads a lift above 1). Phase 2: `test/sim/sprint-store.test.js` against a naive reference, the off path bit-identical                              |
| Headless e2e            | Phase 1: golden hashes unchanged. Phase 2: unchanged with the switch off; a 6000-tick replay with it on runs clean under `--check-invariants`                                                                                                                              |
| Performance budget      | Phase 1 adds one observer scan over living agents per tick; measured by the existing eval runtime. Phase 2's cost is measured with `npm run bench:parts -- --area physics --compare <base>` once the rule is written                                                       |
| Evolution metrics       | The Phase 2 Done row; Phase 1 uses the shared detector-baseline top-up, with its prediction recorded before the run; Phase 2 experiments remain in `evals/experiments.json`                                                                                                |
| Determinism             | No RNG stream. The store is per-agent state, zeroed in `freeAgent`, in `worldHash` only with the switch on                                                                                                                                                                 |
| Config and persistence  | Phase 2: `sprintStoreEnabled` (false), `sprintDrain` (0.01), `sprintRefill` (0.002), `sprintRestThrust` (0.2), `sprintFloor` (0.3); a `scripts/flag-ledger.json` entry for the boolean pointing at T9. A new key changes `rulesHash`, so the switch lands on `season/next` |
| Logging and diagnostics | `SprintConfig` (info, tick 0, with the switch on). Replay: `npm run replay -- --seed <n> --ticks 20000 --config <on.json> --level debug --check-invariants`                                                                                                                |
| Browser compatibility   | Phase 1 is headless observer arithmetic and has no browser-specific path. Phase 2's spent-store display is decided when Phase 2 is planned in full                                                                                                                         |
| Docs                    | [metrics.md](metrics.md) regenerated; [principles.md](../principles.md) scene table gains the sprint detectors under **A real chase**; one [sim-notes.md](sim-notes.md) entry per run                                                                                      |
| Verification            | `scripts/check.sh` green per chunk PR; the baseline and the keep-rule reports committed under `evals/decisions/`                                                                                                                                                           |

## Task breakdown

### Phase 1 - Detectors and baseline

| #   | Task                                                                                                                                                                                        | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Read what a sprint costs today (`tickCost`, the thrust step, `thrustEfficiency` in `js/sim/temperature.js`) and record it in [sim-notes.md](sim-notes.md) (built)                           | [judgement]  | -          |
| T2a | Add `js/evo/scene-sprint.js` and observer wiring for the five Phase 1 detectors, with focused arithmetic tests (built)                                                                      | [judgement]  | T1         |
| T2b | Add registry entries, registry coverage and regenerate [metrics.md](metrics.md) (built)                                                                                                     | [mechanical] | T2a        |
| T3  | Read sprint metrics in the shared detector top-up from [detector-baseline.md](detector-baseline.md); prediction first, then record the Phase 2 verdict (built - E210, Phase 2 gate not met) | [mechanical] | T2b        |
| T4  | Conformance review of the Phase 1 implementation by a fresh agent; confirm the nominal cost ratio and shared-baseline gate (built)                                                          | [judgement]  | T1, T2b    |

### Phase 2 - The store

| #   | Task                                                                                                                                                 | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T5  | Add `js/sim/sprint-store.js`, the keys, the ledger entry, the thrust and speed-cap read in JS and the Rust kernel, the tests and the off-path checks | [judgement]  | T3, T4     |
| T6  | Add `eval.chase_spent_share`; write `evals/screens/sprint-burst.grid.json`                                                                           | [judgement]  | T5         |
| T7  | Run the screen (`E-SB-2`, 16 seeds) and the keep-rule pass of the best arm (`E-SB-3`, 64 matched seeds)                                              | [mechanical] | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                  | [judgement]  | T5, T6, T7 |

### Phase 3 - Adopt or delete

| #   | Task                                                                                                                                                                                                        | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T9  | Verdict by the keep rule: adopt the best harmless arm and delete the switch and its off path with the golden re-pin; delete the store, its keys and its ledger entry only on `WORSE` or an unpaid step cost | [judgement] | T8         |
| T10 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; the clip of a chase for the user; move the Status line                                                                 | [judgement] | T9         |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: an eval report carries the five sprint metrics, and the sim-notes entry states the Phase 2 verdict.
3. Phase 2: the golden hashes are unchanged with the switch off; the screen table and the keep-rule output are in the PR.
4. Phase 3: `npm run browser:hash` matches the re-pinned goldens, or the store's files are gone.
