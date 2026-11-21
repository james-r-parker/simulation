# Registries

**Status:** In progress - Phases 1 and 3 are built: the events, the spec names, the per-slot state and the 42 scene detectors are each one declared list, with contract tests, and every golden `worldHash` and a 2-seed eval report are unchanged. Phase 2 is built inside body-genes.md T6a. The bench reading and T12 are the coordinator's.
**Validated:** 23e8cc66 (2026-11-21)
**Scheduled by:** [metric-noise.md](metric-noise.md) step 1 - the detector interface is built before metric-noise.md Phase 6 adds the role metrics, since each detector added today touches 12 to 22 files

> Companion to [body-genes.md](body-genes.md) (the lane catalogue and the trait registry) and [status-effects.md](status-effects.md) (the effects registry), which follow the same pattern.

A registry is one declarative list that everything else loops over: the list says what exists, contract tests run over every entry, and a table is generated from it. A concept held as a registry is added to by one entry. A concept spread over parallel lists is added to by finding every list.

## The systems map

| System                   | Holds                                                                                                              | State on 2026-11-21                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step phases              | the order of a tick (`STEP_PHASES` in `js/sim/step.js`)                                                            | a registry; left as it is                                                                                                                                                   |
| Config                   | 230 keys in eight `js/sim/config-*.js` files, defaults and rules as parallel maps, checked by exact-key validation | parallel but loud: a missed entry fails at start. Left as it is, with the generated key table `docs/config-keys.md` (built)                                                 |
| Lanes and traits         | every body setting and what a gene may shift                                                                       | planned: [body-genes.md](body-genes.md)                                                                                                                                     |
| Effects                  | every within-life modifier                                                                                         | planned: [status-effects.md](status-effects.md)                                                                                                                             |
| Metric registry          | what each of 377 metrics means, its direction, tests, liveness and power (`js/evo/metric-registry/`)               | a registry of descriptions; the computation is tied to it by name strings (Phase 3)                                                                                         |
| Events                   | 34 event codes with 13 positional fields (`EVENT_TYPE` in `js/sim/events.js`)                                      | a registry: `EVENTS` names every field, one emitter in `js/sim/log.js`, consumers read by named offset, a generated table (Phase 1, built)                                  |
| Brain inputs and outputs | ray channels, body inputs, outputs and their thresholds                                                            | spread: `BODY_INPUT` names 11 of 36 offsets, the labels are a second list, channel numbers are re-declared in 6 files (Phase 2)                                             |
| Detectors                | 48 scene modules behind the observer                                                                               | spread: each wired by hand in `js/evo/observer-scenes.js`; adding one touched 12, 19 and 22 files in the last three cases (Phase 3)                                         |
| Specialisations          | the five specs                                                                                                     | a registry: `js/sim/specs.js`; a `conventions` rule refuses a local count, index or name list (Phase 1, built)                                                              |
| Per-slot state           | every per-agent array                                                                                              | `agentSpecs` (`js/sim/agent-arrays.js`) says for each array how it is hashed and which kernels take it; the hash order and the arena's field lists read it (Phase 1, built) |
| Training stages          | `evals/stages/*.json`, the ladder files                                                                            | declarative; left as they are                                                                                                                                               |
| Scenarios                | drills, reflex cases, chase arenas, role scenes                                                                    | four arena stagers and three entry shapes; one stager and one shape when [role-budget.md](role-budget.md) adds its scenes (T11)                                             |
| Food and entity kinds    | plants, meat, carcasses; agents, rocks, smoke, herds                                                               | per-kind arrays by design, for speed; not a registry                                                                                                                        |

Not made into registries: a generic entity system (kinds share only a position and a radius, and an array per kind is the speed design), physics and collision per kind, the kernels, the renderer's draw modules, a timer system apart from the effects.

## Events (Phase 1)

`EVENTS` in `js/sim/events.js` is the list: for each event its `code`, `name`, `level`, and `fields`, an ordered list of names for its positional numbers.

- `EVENT_TYPE` and a named offset for every field (`EVENT.AGENT_DIED.CAUSE`) are built from the list; the positions and the codes of today are kept, so no `worldHash` moves.
- One emitter in `js/sim/log.js` loops over `fields` and replaces the 34 `emit*` functions; the log's name table in the docs is generated.
- Every consumer reads a field by its named offset: `js/evo/observer-events.js`, `js/worker/effects.js`, `js/evo/observer-scenes.js` and the six other readers hold no bare number.
- The cause lists (`DEATH_CAUSE`, `BORN_CAUSE`, `LOSS_CAUSE`) carry `{code, name, colour}`; the app's cause colours (`js/app/ui/css-color.js`) are read from them.
- The renderer's effect vocabulary (`EFFECT_KIND` in the worker) names the event each kind comes from.

Two riders in the same phase, both small:

- **Spec names.** `js/sim/specs.js` exports `SPEC`, `SPEC_NAMES`, `SPEC_COUNT` and the role tests; the five arrays and the 21 local constants (`SCOUT_SPEC = 3`, `spec === 1`) go, and a `conventions` rule refuses a new one.
- **Per-slot state.** An entry of `agentSpecs` in `js/sim/world.js` gains `hashed` (or the reason it is not) and the kernels that take its pointer; `world-hash.js` and the `wasm-*.js` pointer tables filter that one list in today's order. A contract test fails an array that is neither hashed nor excused.

### As built (Phase 1)

Where the code differs from the text above, and what the plan did not say:

- **Events.** A field's name is `lowerCamel` and its offset `UPPER_SNAKE` (`EVENT.AGENT_DIED.FOOD_ENERGY`); `EVENT_FIELDS_AT` and `EVENT_TICK` name the first field and the tick. The log's decodings (cause names, flags, the packed hunter-ledger word, the fields the log leaves out, the `FloorGuard` record) are `js/sim/log-rules.js`; `drainEvents` is the one emitter. The log's table is `docs/log-events.md`, generated by `scripts/events-doc.mjs` and checked by the `conventions` gate. `PROVISIONED` (code 32) stays in `EVENTS` with no log name, so its code is not reused.
- **Cause lists.** `DEATH_CAUSES`, `BORN_CAUSES` and `LOSS_CAUSE_LIST` are the lists of `{code, key, name, colour}`; `DEATH_CAUSE`, `BORN_CAUSE` and `LOSS_CAUSE` stay as the keyed maps of codes, built from them, since about a hundred call sites read `DEATH_CAUSE.EATEN`. `DISEASE` shares `STARVED`'s colour, as the flow charts' six-colour palette always wrapped; The app may not import `js/sim/`, so the colours reach it in the worker's layout (`layout.causeColours`), through `createSampler` to the flow chart, and `css-color.js` keeps the six-colour palette for a series that names no cause. `EFFECT_SOURCE` in `js/worker/effect-ring.js` names the event of each `EFFECT_KIND`.
- **Readers.** `js/evo/observer-scenes.js` stood at the 300-line limit, so its event pass moved to `js/evo/observer-scenes-events.js`. `test/sim/event-offsets.test.js` is the check that no bare offset is left under `js/`.
- **Spec names.** `SPEC_NAMES` replaced `GENOME_SPECS`, `HERD_SPEC_NAMES`, `spec-params.js`'s list and `SPECIALISATION_KEYS`; `js/library/shapes.js` keeps its own copy, since the library may import nothing from `js/sim/` (the `library-standalone` rule), and a test keeps it equal to `SPEC_NAMES`; the `conventions` rule leaves `js/library/` out.
- **Per-slot state.** `agentSpecs` moved to `js/sim/agent-arrays.js` (no imports, so the WASM modules can read it without a cycle) and `HEARD_STRIDE` with it. An entry has `hashed` (its place in the first block of the hash, `'optional'` for the four arrays `hashOptionalArrays` covers, or `false` with an `excuse`) and `kernels`. `world-hash.js` takes the first block from the places, in today's order. The arena's owned field lists (`BRAIN_FIELDS`, `SENSE_FIELDS`, `PHYSICS_FIELDS`) take their agent arrays from `kernels` in the order of the owner's parameter table. The parameter tables themselves stay written out: the Rust parameter structs fix their order, so `test/sim/world-state.contract.test.js` checks both ways that each table holds exactly the agent arrays naming that kernel.
- **Rows outside the agent list.** The other groups of `allocAgentArrays` are hashed by their own lists, or are named with a reason in `UNHASHED_ROWS` (their modules say they are derived state outside `worldHash`). `restTimer`, which holds a hunter at thrust 0 after a kill (`predatorRestTicks`, 60 by default), was the one gap: hashing it moved every golden, so it waited for a PR that re-pins, and body-genes T7 (`pooled-v6`, which re-pins every golden) hashes it beside the sprint store (`hashStateRows` in `world-hash.js`).
- **Config.** `docs/config-keys.md` is generated by `scripts/config-doc.mjs` and checked by the `conventions` gate.

## Brain inputs and outputs (Phase 2)

`BRAIN_IO` in `js/sim/brain-layout.js` is the schema: `channels` (the ray channels in order), `sense` (the pooled values that are not channels), `body` (each body input with its name and width) and `outputs` (each with its name, its gene column and its threshold key).

- Every offset, count and label is built from it: `BODY_INPUT`, `OUTPUT_INDEX`, `inputCount`, `inputLabels`, the inspector's rows and the signal census's names. A body input is added by one entry.
- The six files that re-declare `CH_*` import them.
- `scripts/check-wasm.mjs` compares the kind and channel constants of `wasm/src/sense.rs` and `wasm/src/brain.rs` with the schema.
- It is built inside [body-genes.md](body-genes.md) Phase 1 as task T6a there, before the layout commit (T7), so the new layout is written once, from the schema, and no second re-pin is spent on it.

## Detectors (Phase 3)

A detector is a module with one shape, and the observer loops over a list of them (`js/evo/observer-detectors.js`).

| Field                             | Meaning                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                            | the detector's name, and the key of its state in `observer.scenes`                                                                                                                              |
| `modules`                         | the repo paths its metrics are registered under (`module` of a registry entry); the registry's entries name the detector through them                                                           |
| `sourceTest`                      | optional; the one source test of every metric of those modules                                                                                                                                  |
| `lean`, `atStart`                 | optional; `lean` builds and feeds it in a lean observer, `atStart` runs its `onTick` at tick 0 too                                                                                              |
| `create(config, {runTicks})`      | its state                                                                                                                                                                                       |
| `link(states)`                    | optional; wires the state to the other detectors' states once all exist (the chase detectors)                                                                                                   |
| `every`                           | how often `onTick` runs, in ticks (1, or a sampling interval)                                                                                                                                   |
| `onTick(state, world, observer)`  | optional                                                                                                                                                                                        |
| `on`                              | a map from an event name of `EVENTS` to `fn(state, world, o, observer)`, `o` being the record's offset in `world.events.data`; the observer dispatches each event to the detectors that name it |
| `onSlotFree(state, slot)`         | optional; a detector with per-slot counters resets them here                                                                                                                                    |
| `metrics(state, world, observer)` | an object from metric name to value                                                                                                                                                             |

- `DETECTORS` in `js/evo/detectors.js` lists every detector, in the order the observer runs them; `js/evo/observer-scenes.js` and the hand wiring are gone. The order is the old per-tick order, and it matters where a detector reads another's state (the approach detector before stillness, sprint and kinematics).
- Dispatch: every death first (its handlers, then the slot resets), then the other records in order (a birth resets its slot before its handlers run), as `applyEvents` orders them. A handler that throws is reported with the detector and the event it was reading.
- The contract test: the keys `metrics()` returns are exactly the registry entries whose `module` the detector names, so a metric cannot be registered and not computed, or computed and not registered. The rule scenes (proof, heritage, niche, mate) name no module: `ruleMetrics` in `js/evo/metrics-rules.js` still merges their metrics into the selection metrics.
- `SOURCE_BY_MODULE` (`js/evo/metric-registry/entry.js`) and `test/fixtures/metric-names.json` stay committed, and the contract test holds them to the detectors: `entry.js` cannot import the detectors (`metrics-stats.js` imports the registry, which imports `entry.js`), so a generated table would be a cycle. The table must equal the detectors' `sourceTest` declarations, and every metric a detector returns must be in the fixture.
- A lean run (training episodes) is the same loop over `LEAN_DETECTORS` (terrain and style).
- The move is a refactor: an eval report is byte-identical before and after each family moves.
- One stager: `stageArena` in `js/evo/chase-arena.js` places the rocks, the foods and the bodies for the chase arenas, the drills, the reflex cases and the role scenes; `stageWorld` (`js/evo/pool-discrimination-stage.js`) is its drill-shaped entry. The one scenario entry shape is not built: the drill, reflex-case and chase-envelope entries carry different run protocols, and [role-budget.md](role-budget.md) adds its scenes through `stageArena`; the shape is settled there once a second scene kind exists.

## Phases

### Phase 1 - Events, spec names and the per-slot list (built)

**Targets:** none - a refactor; every golden `worldHash` and an eval report are unchanged

| Chunk | Tasks    | Builder |
| ----- | -------- | ------- |
| A     | T1 to T5 | Sonnet  |

### Phase 2 - The brain's inputs and outputs

**Targets:** none - built as [body-genes.md](body-genes.md) T6a inside that doc's layout change; this doc holds the schema's shape

| Chunk | Tasks  | Builder |
| ----- | ------ | ------- |
| B     | T6, T7 | Sonnet  |

### Phase 3 - Detectors (built)

**Targets:** bench.observe_ms@500

Inside the `bench-check` margin; an eval report is byte-identical before and after.

| Chunk | Tasks     | Builder |
| ----- | --------- | ------- |
| C     | T8 to T12 | Sonnet  |

## Decisions

| Decision                                 | Holds because                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events first                             | Named fields are what lets a detector say which event it reads; it is the smallest of the three and moves no hash                                                                                                   |
| The brain schema rides the layout change | [body-genes.md](body-genes.md) Phase 1 re-lays the inputs and re-pins every golden once; the schema written then costs no second re-pin                                                                             |
| Detectors before the role metrics        | [metric-noise.md](metric-noise.md) Phase 6, [status-effects.md](status-effects.md) and [body-genes.md](body-genes.md) each add detectors; at 12 to 22 files a detector the interface pays back in the first of them |
| Config, food and entity kinds are left   | Config fails loudly when a list is missed; food and entities are arrays per kind for speed, and a new kind is a plan of its own                                                                                     |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | `js/sim/events.js` (`EVENTS`), `js/sim/log.js` (one emitter), `js/sim/specs.js`, `agentSpecs` in `js/sim/world.js` with `js/sim/world-hash.js` and the `wasm-*.js` tables reading it, `BRAIN_IO` in `js/sim/brain-layout.js`, `js/evo/detectors.js` and the detector shape in each `js/evo/scene-*.js`, the observer's loop in `js/evo/observer.js`. No kernel logic changes; `scripts/check-wasm.mjs` gains the constant check                                                                                                                                                                                          |
| Unit tests              | `test/sim/events.test.js` (every event's fields are named, codes and positions equal today's, the one emitter writes what each old emitter wrote, on a recorded log). `test/sim/specs.test.js`. `test/sim/world-state.contract.test.js` (every per-slot array is hashed or excused; the hash order equals today's). `test/sim/brain-io.test.js` (offsets and counts from the schema equal the pinned numbers; every label is unique). `test/evo/detectors.contract.test.js` (over every detector: `metrics()` keys equal its registry entries; `onSlotFree` clears per-slot state; an event it names exists in `EVENTS`) |
| Headless e2e            | Every golden `worldHash` unchanged in Phases 1 and 3. A 2-seed, 20000-tick eval report byte-identical before and after each commit of Phase 3. Phase 2 lands inside the body-genes re-pin                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Performance budget      | `bench.observe_ms@500` and `bench.step_ms@500` inside the `bench-check` margin; the event dispatch is a table lookup per event, and named offsets are constants                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evolution metrics       | N/A - no behaviour changes; the byte-identical report is the proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Determinism             | No RNG. The detector list is ordered and the dispatch runs in that order, so a report does not depend on registration order at run time                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Config and persistence  | No config key. Log event names and fields are unchanged. No genome, archive or IndexedDB change beyond the layout of body-genes.md                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Logging and diagnostics | The log's event table is generated from `EVENTS` (`docs/commands.md` or a notes page). A detector that throws names itself and the event it was reading                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Browser compatibility   | The app reads the cause colours and the effect kinds from the lists; verified by the existing browser smoke                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Docs                    | This doc's systems map is the architecture overview and is kept as the code moves; [body-genes.md](body-genes.md) (T6a); [metric-noise.md](metric-noise.md) (the detector shape in Phase 6); `docs/coding-standards.md` gains "a concept with more than two parallel lists becomes a registry". Once `Implemented` this doc is the reference for the registries                                                                                                                                                                                                                                                          |
| Verification            | `scripts/check.sh --fix --quick` per chunk and CI `check`; the byte-identical reports in each PR body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Task breakdown

### Phase 1 - Events, spec names and the per-slot list (built)

| #   | Task                                                                                                                                                                                                           | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `EVENTS` with every event's named fields, build `EVENT_TYPE` and the offsets from it, replace the 34 emitters with one, and generate the log's event table; tests on a recorded log                        | [judgement]  | -          |
| T2  | Move every consumer to named offsets (the nine reader files), and the cause lists to `{code, name, colour}` read by the app; no bare event offset left (`rg` check in the test)                                | [mechanical] | T1         |
| T3  | Add `js/sim/specs.js`, replace the five name arrays and the 21 local constants, and add the `conventions` rule                                                                                                 | [mechanical] | -          |
| T4  | Add `hashed` and the kernel list to `agentSpecs`, derive the hash list and the WASM pointer tables from it in today's order, with the contract test; generate the config key table from the defaults and rules | [judgement]  | -          |
| T5  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                            | [judgement]  | T2, T3, T4 |

### Phase 2 - The brain's inputs and outputs

| #   | Task                                                                                                                                                      | Nature      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T6  | Write `BRAIN_IO` and build every offset, count and label from it, as [body-genes.md](body-genes.md) T6a (the task is that doc's; this row tracks it here) | [judgement] | T5         |
| T7  | Conformance review of Phase 2 with the body-genes Phase 1 review                                                                                          | [judgement] | T6         |

### Phase 3 - Detectors

| #   | Task                                                                                                                                                                                                                                                                                | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T8  | (built) Add `js/evo/detectors.js`, the detector shape and the observer's loop with event dispatch, with the contract test on three moved detectors; a byte-identical eval report                                                                                                    | [judgement]  | T2         |
| T9  | (built) Move the hunter and chase scene modules to the shape, a family to a commit, each with a byte-identical report                                                                                                                                                               | [mechanical] | T8         |
| T10 | (built) Move the ecology, social, brain and world scene modules the same way; delete `js/evo/observer-scenes.js` and the hand wiring                                                                                                                                                | [mechanical] | T9         |
| T11 | (built) Hold `SOURCE_BY_MODULE` and `test/fixtures/metric-names.json` to the detectors (a generated table is an import cycle); give the role scenes of [role-budget.md](role-budget.md) and the drills one `stageArena`. The one scenario entry shape is deferred to role-budget.md | [judgement]  | T10        |
| T12 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                                                                 | [judgement]  | T11        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh --fix --quick` and CI `check` per chunk.
2. Phase 1: every golden unchanged; `rg 'd\[o \+ [0-9]' js` finds no bare event offset; `rg 'SCOUT_SPEC|SPEC_COUNT = ' js` finds one definition.
3. Phase 3: adding a throwaway detector with one metric touches the detector's file, its registry entry and its test, and nothing else; the report of a 2-seed eval is byte-identical to the one before the phase.
