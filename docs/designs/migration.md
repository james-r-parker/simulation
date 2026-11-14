# Migration

**Status:** Proposed - migrants arrive at the map edges at a steady rate from a balanced mainland, whatever the headcount, and replace the floor refill that drops agents into an emptied world. Phase 1 (the principle edit and the detectors) is first.
**Validated:** e2455f2f (2026-11-11)
**Priority:** 5 - built after the attempts to make the world stand on its own (eat-choice.md, low-density-edge.md), since migration would hide a world that cannot
**Depends on:** [eat-choice.md](eat-choice.md), [low-density-edge.md](low-density-edge.md)

The scene this doc serves ([principles.md](../principles.md)): **Boom and bust** - a world thins and is refilled by
newcomers walking in from outside, never by agents appearing out of the air in an emptied world. The selection rules it
serves: selection by death (a blob that crashes, starves or fails to dodge dies, and a migrant may take its place) and
selection rule 1 (the world, not the archive, does the choosing). It needs the user to change the refusal **Smoothing
away crashes**; K3 is unchanged.

## Principle - islands are fed by a mainland

A real population on a patch, an island or a valley rarely sustains itself alone: a steady trickle of migrants from a
larger source keeps it and brings new genes (the rescue effect). Migrants do not know the island is in trouble, so the
rate does not read the island's headcount, a basin's state or a lineage's. The mainland has a fixed, balanced mix of
kinds, so newcomers are balanced on average; the island's own selection decides which kinds thrive. Mainland brains are
not the island's archive.

| Rule today                                                    | What it does                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `fillFloor` in `js/sim/population.js`, called by `step`       | When fewer than `floorTrigger` (8) are alive, spawns up to `minAgents` (40) at once at random points of the map |
| `spawnAgent` in `js/sim/spawn.js` with `BORN_CAUSE.IMMIGRANT` | Supported, never called; `eval.birth_source_share.immigrant` reads 0                                            |
| `chooseSpec` in `js/sim/spawn.js`                             | Calls `policy.initSpec`, which takes a random elite's spec or the least-populated one                           |
| `placeClear` in `js/sim/spawn.js`                             | A clear random point anywhere on the map, written to `world.point`                                              |

## What changes

| Id  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | `migrate` in `js/sim/migration.js` (new), called by `step` just before `fillFloor`, spawns `floor((tick + 1) x r / 1000) - floor(tick x r / 1000)` migrants this tick for `migrantsPer1k` r (new number, 0 to `maxAgents` / 100, default 0): stateless and exact for an integer r. An arrival at `maxAgents` is dropped, not queued. At r = 0 it draws nothing                                                                                                                                               |
| M2  | `placeEdgeClear` (new, in `js/sim/spawn.js`) places a migrant at a clear point within `migrantEdgeBand` (new number, px, default 200, above the largest body radius plus the obstacle clearance) of the left or right world edge, the side drawn uniformly from the `spawn` stream, so both basins are fed alike; it fails as `placeClear` does                                                                                                                                                              |
| M3  | A migrant's specialisation is drawn uniformly (`nextInt(world.rng.spawn, SPEC_COUNT)` in `chooseSpec` when the cause is `IMMIGRANT`), and its brain is a random genome (`randomGenome` in `js/evo/instinct.js`, sigma `SIGMA_START`) through a cause-aware `initBrain`; the archive path of the seeder is never used for a migrant. `FLOOR` and `INITIAL` draws are unchanged                                                                                                                                |
| M4  | `migrantDepth` (new per-slot `Uint8Array`, in the style of `clonalDepth`): 0 for a migrant, the lesser parent value plus 1 for a mate or split child (capped at 255), 255 for initial and floor entrants; set on every birth path and reset on slot reuse                                                                                                                                                                                                                                                    |
| M5  | `docs/principles.md`: the refusal "Smoothing away crashes" and the Selection paragraph's note on the deleted immigration pulse say a constant-rate migration from a balanced mainland, that never reads the headcount, a basin's or a lineage's state, and whose brains are not drawn from the archive, is allowed, and does not count as a basin's recolonisation; any entry triggered by the headcount, a basin's extinction or a low count, or that picks a role to restock, is refused (the user's text) |
| M6  | When migration lands, `fillFloor`, `floorTrigger` and `minAgents` are deleted: an emptied world is refilled only by migrants walking in from the edges                                                                                                                                                                                                                                                                                                                                                       |

No flag is added: `migrantsPer1k` and `migrantEdgeBand` are numbers, so `scripts/flag-ledger.json` does not list them.
At `migrantsPer1k` 0 nothing spawns and nothing is drawn. Any new key changes `rulesHash`, so the screen runs from an
unmerged branch and the switch targets `season/next`. When the finalist is `migrantsPer1k` 0, the migration code and keys
are deleted and the floor stays.

## Detectors

Registered in `js/evo/metric-registry/world-3.js` from the scene `js/evo/scene-migration.js` (new), sampled at the
1000-tick checkpoint in `observeScenes`. Phase 1 registers them with arithmetic and source tests on scripted worlds;
their liveness and power come from the Phase 2 first-pass report of the `migrate-4` arm.

| Detector                      | Meaning                                                                                       | Unit, better  | `nullWhen`                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------- | -------------------------------- |
| `eval.migrant_alive_share`    | Share of living agents whose `migrantDepth` is at most 3, over checkpoints after burn-in      | share, lower  | no agent alive at any checkpoint |
| `eval.native_birth_share`     | Share of births after burn-in whose child's `migrantDepth` is above 3                         | share, higher | no birth after burn-in           |
| `eval.migrant_survival_ticks` | Median life length of migrants that died, over the median life of world-born agents that died | ratio, watch  | no migrant died after burn-in    |

A migrant into an extinct basin marks the basin's recolonisation tainted (`noteBasinBirth` in `js/evo/scene-basin.js`,
as for floor and immigrant births), so `eval.basin_recolonisations` is read as a guard and must not get worse.
`eval.floor_episodes` reads 0 once the floor is deleted.

## Phases

### Phase 1 - The principle and the detectors

**Targets:** none - a principle edit for the user and detectors; no sim behaviour changes

- The user approves or rewrites M5; without it the plan stops here.
- `migrantDepth` is allocated and set on every birth path (memory only; `worldHash` unchanged), and the three detectors
  are registered with arithmetic and source tests.

| Chunk | Tasks    | Contents                                                 |
| ----- | -------- | -------------------------------------------------------- |
| A     | T1 to T3 | The principle, `migrantDepth`, the detectors, the review |

### Phase 2 - Screen the rate

**Targets:** eval.births_per_1k, eval.lineages_alive, eval.food_energy_per_1k

The screen runs from an unmerged branch carrying M1 to M3, on the world as eat-choice.md and low-density-edge.md leave
it, floor on, policy live, 200000 ticks, seeds 1 to 16 for the first pass:

| Arm          | Config             |
| ------------ | ------------------ |
| `defaults`   | `migrantsPer1k` 0  |
| `migrate-1`  | `migrantsPer1k` 1  |
| `migrate-4`  | `migrantsPer1k` 4  |
| `migrate-8`  | `migrantsPer1k` 8  |
| `migrate-16` | `migrantsPer1k` 16 |

- The first pass ranks by `held`, then `alive`, then lowest `eval.migrant_alive_share`, and reports `eval.floor_episodes`.
- The bars on `eval.migrant_alive_share` (a ceiling, starting at 0.15) and `eval.native_birth_share` (a floor, starting at
  0.95) are set from the first pass before the second pass runs, and recorded with its prediction.
- The second pass runs the defaults and the two leading arms on seeds 1 to 64 with `--keep-rule --allow-config-diff
migrantsPer1k`, then the leading arm with the floor off (`floorTrigger` 0) against itself with the floor on; reports
  committed under `evals/decisions/`.
- The finalist reads `held` `better`, `alive` not worse, `eval.basin_recolonisations` not worse, both share bars met,
  and with the floor off no keep-rule guard worse than with it on.
- Done when the finalist is named with its keep-rule output at 64 seeds, or the record says why none is.

| Chunk | Tasks     | Contents                                  |
| ----- | --------- | ----------------------------------------- |
| B     | T4, T5    | M1 to M3 on the screen branch (code)      |
| C     | T6 to T8a | The grid, the passes, the finalist (runs) |

### Phase 3 - The switch

**Targets:** eval.births_per_1k, eval.lineages_alive, bench.step_ms@500

One PR, a breaking commit to `season/next`: the finalist's `migrantsPer1k` as the default, `fillFloor` and its keys
deleted (M6), the goldens re-pinned, the bench baseline re-recorded, and the paired check on seeds 65 to 128 with
`--keep-rule`. Done when `held` reads `better`, `alive` not worse, `eval.basin_recolonisations` not worse, and both share
bars hold on those seeds.

| Chunk | Tasks     | Contents                                                           |
| ----- | --------- | ------------------------------------------------------------------ |
| D     | T9 to T13 | The default, the floor deleted, the re-pins, the check, the review |

## Experiments

| Label    | Prediction, written before the run                                                                                                                       | Falsified when                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `E-MG-1` | A migration rate reads `held` `better` at 64 seeds with `alive` not worse, the migrant share under its ceiling and the native-birth share over its floor | No rate does all of these                                        |
| `E-MG-2` | Migrants die sooner than world-born agents (`eval.migrant_survival_ticks` under 1): the world selects against random newcomers                           | Migrants live as long as natives: they are not being selected on |
| `E-MG-3` | With migration, the floor-off world reads no keep-rule guard worse than the floor-on world: the floor refill is no longer needed                         | A guard reads `WORSE` with the floor off                         |

## Decisions

| Decision         | Choice                                                                                          | If it fails                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Purpose          | No emptied world refilled by agents appearing mid-map (user, 2026-11-11)                        | -                                                                                                                      |
| Rate             | Constant per 1000 ticks, never read from the headcount, a basin or a lineage                    | -                                                                                                                      |
| Balance of kinds | A balanced mainland: a uniform specialisation draw, no top-up of a rare kind (user, 2026-11-11) | Rare-kind advantage in the world (prey switching, niche food) in a later plan                                          |
| Mainland brains  | Random genomes, never the archive                                                               | -                                                                                                                      |
| The floor guard  | Deleted when migration lands (M6), after the floor-off arm reads no guard worse                 | When the floor-off arm reads a guard `WORSE`, the floor stays and its entrants arrive at the edges by `placeEdgeClear` |
| Order            | After eat-choice.md and low-density-edge.md (user, 2026-11-11)                                  | -                                                                                                                      |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/migration.js` (new: `migrate`, `migrantDepth`), called by `step` just before `fillFloor`; `chooseSpec`, a cause-aware `initBrain` path and `placeEdgeClear` (new) in `js/sim/spawn.js`; `fillFloor` in `js/sim/population.js` deleted at the switch; `js/evo/scene-migration.js` (new) and its rows in `world-3.js`; nothing in the worker or the app                                                                                                                                                                                                                                      |
| Unit tests              | `test/sim/migration.test.js`: at `migrantsPer1k` 0 nothing spawns and no stream is drawn; at an integer rate exactly that many arrive per 1000 ticks; none past `maxAgents`, dropped not queued; each within `migrantEdgeBand` of the left or right edge, sides balanced over many draws; specialisations uniform over many draws; a migrant's brain is not an archive genome; `FLOOR` and `INITIAL` draws unchanged; `migrantDepth` on every birth path and on slot reuse. `test/evo/scene-migration.test.js` and a source test: each detector on hand-built and scripted worlds, each `nullWhen` |
| Headless e2e            | Phases 1 and 2 change no `worldHash` on `main`; the goldens are re-pinned in Phase 3 with the Chromium hashes; `eval-smoke` passes without the floor                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin; migration adds a handful of spawns per 1000 ticks and one byte per slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Evolution metrics       | Phase 2's finalist rule and Phase 3's Done criteria: `keepRule` at 64 matched seeds, `eval.basin_recolonisations` not worse, and the two share bars                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Determinism             | Arrivals are computed from the tick with no stream; placement, side and specialisation draw from the existing `spawn` stream and brains from `brain-init`, only when an arrival happens; replay from seed and config holds                                                                                                                                                                                                                                                                                                                                                                         |
| Config and persistence  | New keys `migrantsPer1k` (number, 0 to `maxAgents` / 100, default 0 until Phase 3) and `migrantEdgeBand` (number, px, default 200). Deleted at the switch: `floorTrigger` and `minAgents` (M6). `rulesHash` changes, so archives of the old rules are refused by `js/evo/archive-codec.js`                                                                                                                                                                                                                                                                                                         |
| Logging and diagnostics | Each arrival pushes the existing `AGENT_BORN` event with cause `IMMIGRANT`; `POPULATION_FLOOR` events end with the floor. `npm run replay -- --seed <n> --level debug` shows the arrivals                                                                                                                                                                                                                                                                                                                                                                                                          |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Docs                    | `docs/principles.md` (M5, the user's text; K3 unchanged), README.md (how blobs arrive; no floor), `docs/designs/metrics.md`, sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 3                                                                                                                                                                                                                                                                                                                                                                                          |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 3's Done criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Task breakdown

### Phase 1 - The principle and the detectors

| #   | Task                                                                                                                                      | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | `docs/principles.md`: M5 as the user approves it                                                                                          | [judgement] | -          |
| T2  | `migrantDepth` on every birth path, and `js/evo/scene-migration.js` with the three detectors registered, with arithmetic and source tests | [judgement] | T1         |
| T3  | Conformance review of Phase 1, in parallel with `scripts/check.sh`                                                                        | [judgement] | T2         |

### Phase 2 - Screen the rate

| #   | Task                                                                                                                                             | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T4  | M1 and M2 on an unmerged branch: `migrate`, the arrival schedule and `placeEdgeClear`, with tests                                                | [judgement]  | T3         |
| T5  | M3: the uniform specialisation and random-genome brain for a migrant, with tests                                                                 | [judgement]  | T4         |
| T6  | The grid and `E-MG-1` recorded before the run                                                                                                    | [judgement]  | T5         |
| T7  | First pass on seeds 1 to 16; ranked; liveness and power of the detectors from `migrate-4`; the share bars and `E-MG-3` recorded                  | [mechanical] | T6         |
| T8  | Second pass on seeds 1 to 64 with `--keep-rule`, and the floor-off arm; the finalist or the reason none; `E-MG-1` to `E-MG-3`; a sim-notes entry | [judgement]  | T7         |
| T8a | Conformance review of Phase 2                                                                                                                    | [judgement]  | T8         |

### Phase 3 - The switch

| #   | Task                                                                                                                    | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9  | The finalist's `migrantsPer1k` as the default, and `fillFloor`, `floorTrigger` and `minAgents` deleted (M6), with tests | [judgement]  | T8a        |
| T10 | Re-pin the goldens in Node and Chromium                                                                                 | [mechanical] | T9         |
| T11 | Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                   | [mechanical] | T10        |
| T12 | The paired check on seeds 65 to 128 with `--keep-rule`; reports committed; README.md                                    | [mechanical] | T11        |
| T13 | Read the Done criteria; a sim-notes entry; conformance review in parallel with `scripts/check.sh`; status line moved    | [judgement]  | T12        |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, `docs/principles.md` names constant-rate migration from a balanced mainland as allowed, in the user's
   words.
3. After Phase 2, the reports and keep-rule output are under `evals/decisions/`, and the record names the finalist or why
   none is.
4. After Phase 3, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads `held`
   `better`, `alive` not worse and `eval.basin_recolonisations` not worse, and no agent enters except by birth or from an
   edge.
