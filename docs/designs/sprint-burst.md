# Sprint burst

**Status:** Proposed - stub: measure how the `SPRINT` output is used, then, only if it reads as free, make a sprint a store that empties and refills; Phase 1 (detectors and baseline) is first.
**Validated:** f5ebac76 (2026-11-15)
**Priority:** 28 - a chase needs an end that is not luck, but the world must hold a standing prey population first ([honest-budgets.md](honest-budgets.md)), and Phase 1 reads the chase detectors of [training-stages.md](training-stages.md)
**Depends on:** [honest-budgets.md](honest-budgets.md), [training-stages.md](training-stages.md)

A sprint multiplies thrust by `1 + sprintMultiplier x sprintBoost` (`thrustOf` in `js/sim/physics.js`), raises the speed cap in the Rust kernel (`move_agent` in `wasm/src/physics.rs`) and costs `sprintCost` (0.05) energy a tick (`tickCost` in `js/sim/energy.js`). No metric reads the `SPRINT` output. If a sprint is held most of the time it is a free action ([principles.md](../principles.md), "What to refuse"), a chase is decided by top speed alone, and a courser and an ambusher cannot differ. This doc measures that first.

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
| `eval.sprint_cost_share`   | watch (higher) | Sprint energy over all energy spent, from the hunter ledger's `sprintEnergy` and the same tally for non-hunters            |
| `eval.chase_spent_share`   | watch (higher) | Phase 2 only: of resolved chases, those in which the hunter's or the prey's store reached 0 before the chase resolved      |

## Phases

### Phase 1 - Detectors and baseline

**Targets:** none - detectors only; `worldHash` and the golden cases are unchanged

The first five detectors, and a 16-seed baseline on the defaults (`E-SB-1`). Prediction, written before the run: `eval.sprint_share.hunter` is above 0.5 and `eval.chase_sprint_lift` is under 1.2, so the sprint is held, not chosen. Phase 2 is built only if the sprint share is above 0.5 for either role or `eval.sprint_cost_share` is under 0.02; otherwise this doc closes with the detectors kept.

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

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Phase 1: `js/evo/scene-sprint.js` and its registry entries. Phase 2: `js/sim/sprint-store.js` (drain, refill, factor), read in the thrust step of `js/sim/physics.js` and the Rust physics kernel (`wasm/src/physics.rs`, built by `scripts/build-wasm.sh`)                |
| Unit tests              | `test/evo/scene-sprint.test.js` (a brain that always sprints reads share 1 and lift 1; one that sprints only in a chase reads a lift above 1). Phase 2: `test/sim/sprint-store.test.js` against a naive reference, the off path bit-identical                              |
| Headless e2e            | Phase 1: golden hashes unchanged. Phase 2: unchanged with the switch off; a 6000-tick replay with it on runs clean under `--check-invariants`                                                                                                                              |
| Performance budget      | TBD - Phase 2's cost is measured with `npm run bench:parts -- --area physics --compare <base>` once the rule is written                                                                                                                                                    |
| Evolution metrics       | The Phase 2 Done row; experiments `E-SB-1` to `E-SB-3` in `evals/experiments.json`                                                                                                                                                                                         |
| Determinism             | No RNG stream. The store is per-agent state, zeroed in `freeAgent`, in `worldHash` only with the switch on                                                                                                                                                                 |
| Config and persistence  | Phase 2: `sprintStoreEnabled` (false), `sprintDrain` (0.01), `sprintRefill` (0.002), `sprintRestThrust` (0.2), `sprintFloor` (0.3); a `scripts/flag-ledger.json` entry for the boolean pointing at T9. A new key changes `rulesHash`, so the switch lands on `season/next` |
| Logging and diagnostics | `SprintConfig` (info, tick 0, with the switch on). Replay: `npm run replay -- --seed <n> --ticks 20000 --config <on.json> --level debug --check-invariants`                                                                                                                |
| Browser compatibility   | TBD - a spent blob may want a look in [crisp-renderer.md](crisp-renderer.md); decided when Phase 2 is planned in full                                                                                                                                                      |
| Docs                    | [metrics.md](metrics.md) regenerated; [principles.md](../principles.md) scene table gains the sprint detectors under **A real chase**; one [sim-notes.md](sim-notes.md) entry per run                                                                                      |
| Verification            | `scripts/check.sh` green per chunk PR; the baseline and the keep-rule reports committed under `evals/decisions/`                                                                                                                                                           |

## Task breakdown

### Phase 1 - Detectors and baseline

| #   | Task                                                                                                                                                                                      | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Read what a sprint costs today (`tickCost`, the thrust step, `thrustEfficiency` in `js/sim/temperature.js`) and record it in [sim-notes.md](sim-notes.md)                                 | [judgement]  | -          |
| T2  | Add `js/evo/scene-sprint.js` with the five Phase 1 detectors, registry entries and `test/evo/scene-sprint.test.js`                                                                        | [judgement]  | T1         |
| T3  | Run `E-SB-1`: prediction first, 16 floor-on seeds x 200000 ticks on the defaults, `npm run eval:power` on the new metrics, the report under `evals/decisions/`; write the Phase 2 verdict | [mechanical] | T2         |
| T4  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`; replace every `TBD` if Phase 2 is to be built, or close the doc                                      | [judgement]  | T1, T2, T3 |

### Phase 2 - The store

| #   | Task                                                                                                                                                 | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T5  | Add `js/sim/sprint-store.js`, the keys, the ledger entry, the thrust and speed-cap read in JS and the Rust kernel, the tests and the off-path checks | [judgement]  | T4         |
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
