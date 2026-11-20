# Fair chase

**Status:** Proposed - a sprint that spends a store, so prey tire and a hunter's burst is short; judged first on the scripted chase envelope, then on the `hunt` rung, then on the live world; Phase 1 (the store behind a switch and the envelope screen) is first.
**Validated:** 58f38443 (2026-11-20)
**Priority:** 4 - the `hunt` rung passes on 0 of 16 offsets after twelve falsified trainer levers (E191 to E232), and the live world's hunters fail the same way; no trainer, recruitment or champion work can pass a chase the bodies do not allow
**Depends on:** [senses-and-motor.md](senses-and-motor.md), [training-loop.md](training-loop.md)

> Companion to [sprint-burst.md](sprint-burst.md), whose Phase 2 specifies the store and whose detectors this doc reads, and to [chase-physics.md](chase-physics.md), which owns heading inertia and terrain. This doc owns the store's build, the per-specialisation drain, and the three-step judgement. [training-stages.md](training-stages.md) T62 is this doc.

Scene: **A real chase** ("Bite arc, vision, and sprint are limited"). Selection rule 6: hunting wins by the chain.

## Measured on 2026-11-20

`npm run audit:chase` on the defaults (predator `visionRange` 400):

| Body     | Cruise | Sprint | Turn radius | Sprint turn radius | Energy per 100 ticks | Sprinting |
| -------- | ------ | ------ | ----------- | ------------------ | -------------------- | --------- |
| forager  | 8.0    | 12.0   | 21.5        | 32.3               | 103                  | 228       |
| predator | 8.0    | 14.4   | 41.8        | 75.3               | 59                   | 191       |

| Reading                                                                      | Value                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Predator on a breaking forager, catch share by start distance (of view)      | 0.25 at 0.2; 0 at 0.4, 0.6, 0.8 and 1.0                           |
| Predator on a straight runner (E185)                                         | 0.75 to 0.88                                                      |
| Fair band (`fairBand` in `js/evo/chase-envelope.js`, catch share 0.2 to 0.8) | one distance, 0.2 of view                                         |
| Trained hunter wins of 64 on `prey-ahead`, by prey `sprintBoost` (E201)      | 0 to 1 at 1; 3 to 7 at 0.5; 6 to 11 at 0.2; 32 to 54 inert        |
| Lost `prey-ahead` trials that never reach the jaws (E201)                    | 121 to 128 of 128                                                 |
| `prey-ahead` learnable from random brains (E206, `train:feasible`)           | 0 of 8 populations                                                |
| `hunt` rung passes (E232)                                                    | 0 of 16 offsets                                                   |
| `eval.chase_catch_share`, shared baseline                                    | 0.266                                                             |
| Sprint store in `js/` or `wasm/src`                                          | none: a sprint costs `sprintCost` energy a tick and no body tires |

## Nature model

Prey sprint in bursts and tire; a chase is decided by who empties first, not by top speed. A stalker closes unseen and spends a short, fast burst. A courser runs slower and longer. Carnivores catch 10 to 40% of the chases they start, which is the fair band. The citations are in [sprint-burst.md](sprint-burst.md) ("Nature model") and `evals/decisions/E201/results.md`.

## The store

The store is the one [sprint-burst.md](sprint-burst.md) Phase 2 specifies, built here with one addition, the per-specialisation drain.

- Each agent holds `sprintStore`, 0 to 1, full at birth.
- It drains by `sprintDrain x sprintDrainMultiplier[spec]` a tick while the `SPRINT` output is above 0.
- It refills by `sprintRefill` a tick while `SPRINT` is at or under 0 and thrust is under `sprintRestThrust`.
- The sprint's factor on thrust (`thrustOf` in `js/sim/physics.js`) and its rise of the speed cap (`move_agent` in `wasm/src/physics.rs`) are both multiplied by `storeFactor`: 1 above `sprintFloor`, falling linearly to 0 at an empty store.
- `sprintCost` stays, charged on the sprint actually delivered (`sprintCost x storeFactor`), in `tickCost` in `js/sim/energy.js`.
- No brain input is added. A spent body feels its forward speed fall through the velocity body inputs.
- With `sprintStoreEnabled` off the JS store is not allocated, the kernel's factor lane holds 1 for every slot, and every `worldHash` is unchanged.
- The six keys change `rulesHash` (it hashes every config key), so T1 is a breaking commit (`!`) and Phases 1 to 3 are built on `season/next`.

| Key                     | Type    | Default | Where                                                                          |
| ----------------------- | ------- | ------- | ------------------------------------------------------------------------------ |
| `sprintStoreEnabled`    | boolean | false   | `js/sim/config-defaults.js`; `scripts/flag-ledger.json`                        |
| `sprintDrain`           | number  | 0.01    | `js/sim/config-defaults.js`                                                    |
| `sprintRefill`          | number  | 0.002   | `js/sim/config-defaults.js`                                                    |
| `sprintRestThrust`      | number  | 0.2     | `js/sim/config-defaults.js`                                                    |
| `sprintFloor`           | number  | 0.3     | `js/sim/config-defaults.js`                                                    |
| `sprintDrainMultiplier` | number  | 1       | per specialisation, `SPECIALISATION_DEFAULTS` in `js/sim/config-spec-rules.js` |

`js/sim/sprint-store.js` exports `createSprintStore(config, slots)`, `stepSprintStore(store, outputs, alive)` (drain and refill for every live slot, no allocation), `storeFactor(store, slot)` and `resetSprintSlot(store, slot)`. The store joins the snapshot state (`js/sim/snapshot-state.js`) and `hashWorld` in `js/sim/world-hash.js` only when enabled.

> Note: the speed cap is applied in the Rust kernel, and `move_agent` reads the boost per specialisation (`sprint_by_spec`). The kernel gains a per-agent `f64` factor lane that `stepSprintStore` writes; `scripts/build-wasm.sh` rebuilds the binary, and the Rust is written by Opus. With the switch off the lane holds 1 for every slot.

## Detector

`eval.chase_spent_share`: of the chases that end (the episodes behind `eval.chase_catch_share` in `js/evo/scene-approach.js`), the share in which the pursuer or the evader was under `sprintFloor` at the end. It is null with the store off. This definition replaces the one in [sprint-burst.md](sprint-burst.md). It is registered `watch`, with scenes `A real chase`, in `js/evo/metric-registry/`.

## Judgement in three steps

Each step is cheaper than the next and gates it.

### Step 1 - The envelope (minutes, scripted)

`npm run audit:chase -- --config <arm.json> --pairs predator:forager,predator:scout,predator:defender,predator:reproducer --trials 8 --json` per arm. The oracles of `js/evo/chase-envelope.js` gain the store: the pursuer sprints while its store is above `sprintFloor` and the evader is in view; the evader (`evaderBrain` in `js/evo/chase-oracles.js`) sprints only while the pursuer is within 3 times `JINK_RANGE`.

| Arm       | `sprintDrain` | Predator `sprintDrainMultiplier` | Predator `sprintBoost` | Reading                               |
| --------- | ------------- | -------------------------------- | ---------------------- | ------------------------------------- |
| `control` | store off     | -                                | 1.6                    | today                                 |
| `even`    | 0.01          | 1                                | 1.6                    | 100 ticks of sprint for every body    |
| `long`    | 0.004         | 1                                | 1.6                    | 250 ticks                             |
| `courser` | 0.01          | 0.5                              | 1.6                    | the hunter outlasts the prey          |
| `stalker` | 0.01          | 2                                | 2.2                    | a 50-tick burst at a higher top speed |

An arm passes when, against the breaking evader, the predator-on-forager fair band covers at least 2 of the 5 start distances, and the catch share at the full view distance is under 0.8 on the straight runner. At most two passing arms go to step 2, the widest band first.

### Step 2 - The rung (hours, trained)

This step needs the 32-offset screens and the per-stage pass test of [training-loop.md](training-loop.md) Phase 5 (T24, T25) built first. For each arm from step 1, with the arm's keys laid over every stage world of `evals/train-ladder.json`:

- `npm run train:feasible -- --curriculum <ladder> --until hunt`: `prey-ahead` is learnable (at least 2 of 8 populations reach its bar).
- `npm run train:screen` on the 32 offsets of [training-loop.md](training-loop.md) T24, `until` `hunt`, against `base`: the `hunt` pass count rises on the exact paired test of T25 (p under 0.05; 6 passes against 0 is the smallest such count).

An arm that fails both readings is recorded and dropped. If no arm passes, the doc stops at Phase 2: `sprintStoreEnabled` and its code are deleted (T8a).

### Step 3 - The world (64 seeds)

The passing arm against the defaults, 64 matched floor-on seeds, 200000 ticks, `eval:compare --keep-rule`.

| Done when                                                                                                                                         | Stop when             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| No keep-rule guard reads `WORSE`, and `eval.pursuit_kill_share` or `eval.hunter_catches_per_1k` reads `better`                                    | A guard reads `WORSE` |
| No guard `WORSE` and neither metric `better`: the store stays on as a realistic mechanism that does no harm (the keep rule, `docs/principles.md`) |                       |

The keep rule gains a second metric guard before this read: `eval.hunter_kills_per_life_mean`. It is registered `watch` today, which the keep rule cannot judge; T11 gives it the direction `higher` and re-reads its power before it guards. `eval.hunter_catches_per_1k` divides by hunter ticks alive, so it falls when hunters live longer (E195, E203); kills per life does not.

## Phases

### Phase 1 - The store behind a switch, and the envelope

**Targets:** none - the switch is off by default, so no `eval.*` or `bench.*` metric moves; its reading is the fair band per arm from `npm run audit:chase`, recorded as `E-FC-1`

| Chunk | Tasks    | Builder                                |
| ----- | -------- | -------------------------------------- |
| A     | T1 to T6 | Sonnet; Opus for the kernel part of T2 |

### Phase 2 - The rung

**Targets:** none - a training reading, not a world metric: `prey-ahead` learnable on at least 2 of 8 populations, and the `hunt` pass count against `base` on 32 offsets (`E-FC-2`, `E-FC-3`)

| Chunk | Tasks    | Builder |
| ----- | -------- | ------- |
| B     | T7 to T9 | Sonnet  |

### Phase 3 - The world, then adopt or delete

**Targets:** eval.pursuit_kill_share, eval.hunter_catches_per_1k, eval.chase_catch_share, bench.step_ms@500

`bench.step_ms@500` stays inside the `bench-check` margin of `bench/baseline.json` with the store on.

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| C     | T10 to T17 | Sonnet  |

## Decisions

| Decision                                                             | Holds because                                                                                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gate of [sprint-burst.md](sprint-burst.md) Phase 2 does not bind | That gate read whether the sprint is held or free in the live world (E210). This doc reads whether a chase can be won, on the envelope and the `hunt` rung           |
| No brain input for the store                                         | A new input is a cost that needs a scene metric to move (`AGENTS.md`, Boundaries); the velocity inputs carry the effect                                              |
| The envelope comes before any training or eval                       | It runs in minutes on scripted bodies, and twelve trainer levers were spent on a chase the envelope already showed has one fair distance                             |
| The prey sprint is not lowered and the hunter is not sped up alone   | Either is a number tuned around a free sprint; a store is what nature does, and it gives the courser and the stalker different bodies (Same spec, different custom)  |
| [chase-physics.md](chase-physics.md) Phase 2 waits for this doc      | `speedTurnDrag` widens the predator's 75-unit sprint circle; it is screened on the bodies this doc leaves                                                            |
| `rulesHash` moves in Phase 1                                         | A new config key changes `rulesHash` even with the switch off, so every phase is built on `season/next`; the season opens on `main` after the Phase 3 keep-rule read |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Sim core: `js/sim/sprint-store.js` (new), reads in `thrustOf` (`js/sim/physics.js`) and `tickCost` (`js/sim/energy.js`), the cap in `move_agent` (`wasm/src/physics.rs`) through a per-agent factor lane, the snapshot state and `hashWorld`. Evo: the store in the oracles of `js/evo/chase-oracles.js`, `eval.chase_spent_share` in `js/evo/scene-approach.js` and the registry, the kills-per-life guard in `js/evo/keep-rule.js`. No worker, renderer or UI change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Unit tests              | `test/sim/sprint-store.test.js`: drain while sprinting, refill only under `sprintRestThrust`, `storeFactor` at 1, at the floor and at 0, the per-spec multiplier, a reset on birth, no allocation in `stepSprintStore`, and a naive reference over 1000 random ticks. `test/sim/physics.test.js`: thrust and cap with a full, half and empty store; identical to today with the switch off. `test/sim/energy.test.js`: `sprintCost` scales with the factor. `test/evo/chase-envelope.test.js` and `test/evo/chase-oracles.test.js`: a spent evader is caught from a distance where a fresh one escapes; the oracles stop sprinting under the floor. `test/evo/scene-approach.test.js` and `test/evo/metric-source-*.test.js`: `eval.chase_spent_share` arithmetic and source, null with the store off. `test/evo/keep-rule.test.js`: the second metric guard reads `worse` on a planted loss. `wasm/` Rust tests when the kernel changes (`scripts/test-wasm.sh`) |
| Headless e2e            | The golden runs are unchanged with the switch off (asserted by the existing golden tests). One new golden case with `sprintStoreEnabled` on (seed 1, 2000 ticks) pins its `worldHash`; `npm run browser:hash` matches it in Chromium. The adopting commit re-pins the goldens in its own commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | `bench.step_ms@500` and `bench.phase_ms.physics@500` with the store on stay inside the `bench-check` margin of `bench/baseline.json`; measured with `flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area physics --compare origin/main` on a quiet machine. `stepSprintStore` allocates nothing (`alloc-check`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Evolution metrics       | Step 3: 64 matched floor-on seeds, 200000 ticks, `eval:compare --keep-rule`; no guard `WORSE`; `eval.pursuit_kill_share` (64 seeds) or `eval.hunter_catches_per_1k` (64 seeds) `better` for the scene claim; `eval.chase_catch_share` and `eval.chase_spent_share` reported with intervals; `eval.chase_catch_share` is read against the nature band of 0.1 to 0.4, and a reading outside it becomes a follow-up task, not a stop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Determinism             | No RNG stream: the store is a function of outputs and config. A world with the store on replays bit for bit from seed and config; the JS and Rust reads use the same `f64` factor computed once per agent per tick in JS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Config and persistence  | The six keys above; `sprintStoreEnabled` in `scripts/flag-ledger.json` with deletion task T15 (or T8a). The world save gains the store array when enabled. No genome, archive, champion or IndexedDB change. Champions trained before adoption are retrained (T16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Logging and diagnostics | `SprintSpent` (debug; `tick`, `slot`, `genomeId`, `spec`): logged once when a store first falls under `sprintFloor` in a sprint, not per tick. `PreyTrace` drill records gain `pursuerStoreMin` and `evaderStoreMin`. A chase that cannot be won shows as `fair band: none` in `npm run audit:chase -- --config <arm>`; a world replays with `npm run replay -- --seed <n> --ticks <t> --config <arm> --level debug`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Browser compatibility   | N/A - no app code changes; the committed WASM binary runs wherever today's does, and `npm run browser:hash` checks the new golden case in Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Docs                    | This doc; [sprint-burst.md](sprint-burst.md) (Phase 2 points here); [training-stages.md](training-stages.md) (T62 points here); [chase-physics.md](chase-physics.md) (depends on this doc); `docs/designs/metrics.md` (generated); `docs/commands.md` or `AGENTS.md` only if a flag is added to `audit:chase`; a `sim-notes.md` entry for the envelope reading. Once `Implemented` this doc describes the sprint store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Verification            | `scripts/check.sh --fix --quick` per chunk and CI `check`; the full local gate under the CPU lock for the Phase 3 PR; the walk under Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Task breakdown

### Phase 1 - The store behind a switch, and the envelope

| #   | Task                                                                                                                                                                                                              | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/sim/sprint-store.js`, the six keys, the flag-ledger entry and `test/sim/sprint-store.test.js`                                                                                                             | [judgement]  | -          |
| T2  | Read `storeFactor` in `thrustOf`, `tickCost` and the speed cap (the per-agent factor lane in the Rust kernel, `scripts/build-wasm.sh`); save and hash the store when enabled; tests and the off-path golden check | [judgement]  | T1         |
| T3  | Add the store to the oracles of `js/evo/chase-oracles.js` and the two `PreyTrace` fields, with tests                                                                                                              | [judgement]  | T2         |
| T4  | Add the golden case with the switch on and the `SprintSpent` event                                                                                                                                                | [mechanical] | T2         |
| T5  | Write the five arm configs under `evals/fair-chase/`, run `audit:chase` on each, record `E-FC-1` with the fair band per arm and pair, and name at most two arms for Phase 2                                       | [judgement]  | T3         |
| T6  | Conformance review of Phase 1                                                                                                                                                                                     | [judgement]  | T4, T5     |

### Phase 2 - The rung

| #   | Task                                                                                                                                                                                                   | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T7  | Write `evals/train-screens/fair-chase.grid.json` (the Phase 1 arms over every stage world, 32 offsets, `until` `hunt`) and run `train:feasible` on each arm ladder; record `E-FC-2`                    | [mechanical] | T6         |
| T8  | Run the ladder screen detached (`E-FC-3`); record the `hunt` pass counts, the exact paired test and the yield table; name the arm for Phase 3 or the stop                                              | [judgement]  | T7         |
| T8a | Only when T8 names no arm: delete `sprintStoreEnabled`, `js/sim/sprint-store.js`, its reads, keys, golden case, kernel lane and ledger entry; move this doc to `Reference` with the `E-FC-3` record id | [mechanical] | T8         |
| T9  | Conformance review of Phase 2 (after T8a when T8 names no arm)                                                                                                                                         | [judgement]  | T8         |

### Phase 3 - The world, then adopt or delete

| #   | Task                                                                                                                                                                                                                   | Nature       | Depends on   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| T10 | Add `eval.chase_spent_share` with its arithmetic and source tests and its registry entry                                                                                                                               | [judgement]  | T6           |
| T11 | Add `eval.hunter_kills_per_life_mean` to `GUARD_METRICS` in `js/evo/keep-rule.js` with its direction in the registry and a planted-loss test                                                                           | [judgement]  | -            |
| T13 | Run the 64-seed keep-rule pair (`E-FC-4`) detached and record every guard with its smallest detectable loss, the two verdict metrics and the two watch metrics                                                         | [mechanical] | T9, T10, T11 |
| T14 | Time the store on a quiet machine under the CPU lock (`bench:parts --area physics --compare origin/main`) and record the margin                                                                                        | [mechanical] | T9           |
| T15 | Adopt on `season/next` as a breaking commit: the arm's values become the defaults, `sprintStoreEnabled` and the off path are deleted, the goldens re-pinned and `bench/baseline.json` re-recorded in their own commits | [judgement]  | T13, T14     |
| T16 | Retrain the ladder on the adopted bodies, export the champions, and hand [training-stages.md](training-stages.md) the new `hunt` pass share                                                                            | [mechanical] | T15          |
| T17 | Conformance review of Phase 3                                                                                                                                                                                          | [judgement]  | T15, T16     |

## Verification

- `scripts/check.sh --fix --quick` and CI `check` are green for each chunk; the Phase 3 PR also passes the full local gate under the CPU lock.
- With `sprintStoreEnabled` off, every golden `worldHash` equals `origin/main`.
- `npm run audit:chase -- --config evals/fair-chase/<arm>.json` prints a fair band of at least two distances for the arm Phase 1 names.
- `npm run train:curve` on a Phase 2 run shows `prey-ahead` `jawShareLow` above 0 at the `hunt` stage.
- The Phase 3 PR body names the scene **A real chase**, selection rule 6, and the `eval:compare --keep-rule` output.
- Browser walk after adoption: open the app, press `F` on a hunter in pursuit, and watch a chase end with one body visibly slowing before the catch or the escape.
