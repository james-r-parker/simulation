# Migration

**Status:** Proposed - migrants arrive at the map edges at a steady rate from a balanced mainland, whatever the headcount. Phase 1 (the principle edit and the detectors) is first.
**Validated:** e2455f2f (2026-11-11)
**Priority:** 3 - after eat-choice.md and low-density-edge.md: migration hides a world that cannot stand on its own, so it lands only once those two have made births and eating real
**Depends on:** [eat-choice.md](eat-choice.md), [low-density-edge.md](low-density-edge.md)

The scene this doc serves ([principles.md](../principles.md)): **Boom and bust** - a crashed patch is recolonised, here
also by newcomers from outside. The selection rules it serves: selection by death (a blob that crashes, starves or
fails to dodge dies quickly and a migrant may take its place) and selection rule 1 (the world, not the archive, does the
choosing). It needs the user to change one refusal: the principles refuse timed immigration today (known violation K3,
deleted in the first big bang).

## Principle - islands are fed by a mainland

A real population on a patch, an island or a valley rarely sustains itself alone: a steady trickle of migrants from a
larger source keeps it and brings new genes (the rescue effect). Migrants do not know the island is in trouble, so the
rate does not read the island's headcount. The source has a fixed mix of kinds, so newcomers are balanced on average;
the island's own selection, not a top-up rule, decides which kinds thrive there.

| Rule today                                                    | What it does                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `fillFloor` in `js/sim/population.js`                         | Refills the world to `minAgents` (40) when fewer than `floorTrigger` (8) are alive; the only entry after the first tick |
| `spawnAgent` in `js/sim/spawn.js` with `BORN_CAUSE.IMMIGRANT` | Supported, never called; `eval.birth_source_share.immigrant` reads 0                                                    |
| `chooseSpec` and `placeClear` in `js/sim/spawn.js`            | Pick the entrant's specialisation through the policy, and a clear random point anywhere on the map                      |

## What changes

| Id  | Change                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `migrate` in `js/sim/migration.js` (new) spawns `BORN_CAUSE.IMMIGRANT` agents at `migrantsPer1k` (new number, default 0) per 1000 ticks, on a fixed schedule from the tick, while the world is under `maxAgents` |
| M2  | A migrant arrives at a clear point within `migrantEdgeBand` (new number, px) of a map edge, drawn from the `spawn` stream                                                                                        |
| M3  | A migrant's specialisation is drawn uniformly over the specialisations (the balanced mainland), and its brain from the seeder as for an entrant                                                                  |
| M4  | `docs/principles.md`: K3 and the refusal "Smoothing away crashes" name a constant-rate migration from a balanced mainland as allowed, and a headcount-triggered entry as refused (user's text, user's approval)  |

No flag is added. `migrantsPer1k` 0 is off and changes nothing; any new key changes `rulesHash`, so the screen runs from
an unmerged branch and the switch targets `season/next`.

## Detectors

Registered in `js/evo/metric-registry/world-3.js` with arithmetic and source tests, liveness and power, from the scene
`js/evo/scene-migration.js` (new), sampled at the 1000-tick checkpoint in `observeScenes`:

| Detector                      | Meaning                                                                                                         | Unit, better  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| `eval.migrant_alive_share`    | Share of the living population that arrived as a migrant, or descends within 3 generations from one             | share, watch  |
| `eval.native_birth_share`     | Share of births after burn-in with a mother born in the world (mate or split), not a migrant of this generation | share, higher |
| `eval.migrant_survival_ticks` | Median life length of migrants, against the median life of world-born agents                                    | ratio, watch  |

`eval.native_birth_share` is the guard that the world still evolves itself: a world fed only by migrants reads it low.

## Phases

### Phase 1 - The principle and the detectors

**Targets:** none - a principle edit for the user and detectors; no sim behaviour changes

- The user approves or rewrites M4; without it the plan stops here.
- The three detectors are built, registered and tested; their liveness and power come from the reference run of the
  next 128-seed defaults report (the eat-choice.md or low-density-edge.md switch reference).

| Chunk | Tasks    | Contents                                 |
| ----- | -------- | ---------------------------------------- |
| A     | T1 to T3 | The principle, the detectors, the review |

### Phase 2 - Screen the rate

**Targets:** eval.births_per_1k, eval.lineages_alive, eval.food_energy_per_1k

The screen runs from an unmerged branch carrying M1 to M3, on the world as eat-choice.md and low-density-edge.md leave
it, floor on, policy live, 200000 ticks, seeds 1 to 16 for the first pass:

| Arm         | Config            |
| ----------- | ----------------- |
| `defaults`  | `migrantsPer1k` 0 |
| `migrate-1` | `migrantsPer1k` 1 |
| `migrate-2` | `migrantsPer1k` 2 |
| `migrate-4` | `migrantsPer1k` 4 |

- The first pass ranks by `held`, then `alive`, then `eval.native_birth_share`.
- The second pass runs the defaults and the two leading arms on seeds 1 to 64 with `--keep-rule --allow-config-diff
migrantsPer1k`; reports committed under `evals/decisions/`.
- The finalist reads `held` `better`, `alive` not worse, and `eval.native_birth_share` at or above 0.8; a rate that
  holds the world only by feeding it migrants is not a finalist.
- Done when the finalist is named with its keep-rule output at 64 seeds, or the record says why none is.

| Chunk | Tasks     | Contents                                  |
| ----- | --------- | ----------------------------------------- |
| B     | T4, T5    | M1 to M3 on the screen branch (code)      |
| C     | T6 to T8a | The grid, the passes, the finalist (runs) |

### Phase 3 - The switch

**Targets:** eval.births_per_1k, eval.lineages_alive, bench.step_ms@500

One PR, a breaking commit to `season/next`: the finalist's `migrantsPer1k` as the default, the goldens re-pinned, the
bench baseline re-recorded, and the paired check on seeds 65 to 128 with `--keep-rule`. Done when `held` reads `better`,
`alive` not worse, and `eval.native_birth_share` is at or above 0.8 on those seeds.

| Chunk | Tasks     | Contents                                        |
| ----- | --------- | ----------------------------------------------- |
| D     | T9 to T13 | The default, the re-pins, the check, the review |

## Experiments

| Label    | Prediction, written before the run                                                                                                  | Falsified when                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `E-MG-1` | A migration rate reads `held` `better` at 64 seeds with `alive` not worse and `eval.native_birth_share` at or above 0.8             | No rate does all three                                           |
| `E-MG-2` | Under migration, migrants die sooner than world-born agents (`eval.migrant_survival_ticks` under 1): the world selects against them | Migrants live as long as natives: they are not being selected on |

## Decisions

| Decision         | Choice                                                                      | If it fails                                                                   |
| ---------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Rate             | Constant per 1000 ticks, never read from the headcount or the mix of kinds  | -                                                                             |
| Balance of kinds | A balanced mainland (uniform specialisation draw); no top-up of a rare kind | Rare-kind advantage in the world (prey switching, niche food) in a later plan |
| Order            | After eat-choice.md and low-density-edge.md                                 | -                                                                             |
| The floor guard  | Stays as the total-extinction guard                                         | -                                                                             |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/migration.js` (new: `migrate`, the edge placement), called from the population phase beside `fillFloor` in `js/sim/population.js`; `spawnAgent` and `chooseSpec` in `js/sim/spawn.js`; `js/evo/scene-migration.js` (new) and its rows in `world-3.js`; nothing in the worker or the app                                     |
| Unit tests              | `test/sim/migration.test.js`: at `migrantsPer1k` 0 nothing spawns; at 2, two migrants per 1000 ticks on the schedule, none at `maxAgents`; each within `migrantEdgeBand` of an edge; specialisations uniform over many draws. `test/evo/scene-migration.test.js` and a source test: each detector on hand-built and scripted worlds |
| Headless e2e            | Phases 1 and 2 change no `worldHash` on `main`; the goldens are re-pinned in Phase 3 with the Chromium hashes; `eval-smoke` passes                                                                                                                                                                                                  |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin; migration adds a handful of spawns per 1000 ticks                                                                                                                                                                                                                              |
| Evolution metrics       | Phase 2's finalist rule and Phase 3's Done criteria: `keepRule` at 64 matched seeds and `eval.native_birth_share`                                                                                                                                                                                                                   |
| Determinism             | Placement and specialisation draw from the existing `spawn` stream, brains from `brain-init`; replay from seed and config holds                                                                                                                                                                                                     |
| Config and persistence  | New keys `migrantsPer1k` (number, at least 0, default 0 until Phase 3) and `migrantEdgeBand` (number, px, default 200). `rulesHash` changes, so archives of the old rules are refused by `js/evo/archive-codec.js`                                                                                                                  |
| Logging and diagnostics | Each arrival pushes the existing `AGENT_BORN` event with cause `IMMIGRANT`; no new event. `npm run replay -- --seed <n> --level debug` shows the arrivals                                                                                                                                                                           |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                            |
| Docs                    | `docs/principles.md` (M4, the user's text), README.md (how blobs arrive), `docs/designs/metrics.md`, sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 3                                                                                                                                                   |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 3's Done criteria                                                                                                                                                                                                                                       |

## Task breakdown

### Phase 1 - The principle and the detectors

| #   | Task                                                                                           | Nature      | Depends on |
| --- | ---------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | `docs/principles.md`: M4 as the user approves it                                               | [judgement] | -          |
| T2  | `js/evo/scene-migration.js`: the three detectors, registered, with arithmetic and source tests | [judgement] | T1         |
| T3  | Conformance review of Phase 1, in parallel with `scripts/check.sh`                             | [judgement] | T2         |

### Phase 2 - Screen the rate

| #   | Task                                                                                                                       | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | M1 and M2 on an unmerged branch: `migrate` and the edge placement, with tests                                              | [judgement]  | T3         |
| T5  | M3: the uniform specialisation draw for a migrant, with tests                                                              | [mechanical] | T4         |
| T6  | The grid and `E-MG-1` recorded before the run                                                                              | [judgement]  | T5         |
| T7  | First pass on seeds 1 to 16; ranked                                                                                        | [mechanical] | T6         |
| T8  | Second pass on seeds 1 to 64 with `--keep-rule`; the finalist or the reason none; `E-MG-1` and `E-MG-2`; a sim-notes entry | [judgement]  | T7         |
| T8a | Conformance review of Phase 2                                                                                              | [judgement]  | T8         |

### Phase 3 - The switch

| #   | Task                                                                                                                 | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9  | The finalist's `migrantsPer1k` as the default, with the config tests                                                 | [mechanical] | T8a        |
| T10 | Re-pin the goldens in Node and Chromium                                                                              | [mechanical] | T9         |
| T11 | Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                | [mechanical] | T10        |
| T12 | The paired check on seeds 65 to 128 with `--keep-rule`; reports committed; README.md                                 | [mechanical] | T11        |
| T13 | Read the Done criteria; a sim-notes entry; conformance review in parallel with `scripts/check.sh`; status line moved | [judgement]  | T12        |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, `docs/principles.md` names constant-rate migration as allowed, in the user's words.
3. After Phase 2, the reports and keep-rule output are under `evals/decisions/`, and the record names the finalist or
   why none is.
4. After Phase 3, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads
   `held` `better`, `alive` not worse, and `eval.native_birth_share` at or above 0.8.
