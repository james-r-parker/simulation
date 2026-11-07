# Habitat cover

**Status:** Proposed - nothing built; Phase 1 (reach instruments and a 32-seed baseline) is first, Phase 2 puts rings on the rims of the food patches behind `refugeAnchor`.
**Validated:** f5c7880 (2026-11-07)
**Priority:** 20 - the Refuge scene is still absent after the cover mechanisms (`E131`) and the refuge sense (`E132`, `E133`) because prey are 1,400 to 2,400 px from a ring and flee within 300 px; the fix is where the cover stands, and it queues behind every unbuilt doc because it changes the map and so the goldens
**Depends on:** [refuge.md](refuge.md), [realistic-keepers.md](realistic-keepers.md)

The scene this doc serves ([principles.md](../principles.md), Refuge): **under threat, prey stack into a rock ring or a
cold margin and then leak back out to feed.** The two rules stay true: **cover blocks rays, and cover is not free food.**
Cover already protects (bites per prey-tick inside a ring are 0.12 of the outside rate, `E130`) and the brain can already
sense the nearest ring (`refugeSense`). The scene is absent because no ring is within a flight of where prey are. This doc
moves the cover to where prey feed. It changes the map, not the brains and not fitness.

## Principle - cover within a dash, never a reward

- **The map changes, nothing is paid.** No fitness term, no reflex and no input is added. A ring on the rim of a food patch
  makes a short flight to cover possible; whether selection uses it is what `eval.refuge_use_under_threat` reads.
- **Reach is measured first.** The distance from prey to the nearest ring edge is an instrument before it is a target
  (Phase 1), so a phase that does not shorten it is not credited with a scene it did not make.
- **The keep rule binds.** Floor on: hunters alive at the last tick on 12 of 16 seeds or more, and no more seeds under 80
  agents than the defaults. `eval.hunter_kill_conversion_by_age.1k-2k` stays at 80% of the defaults arm or more and
  `eval.hunter_independent_kill_share` is not down ([hunter-learning.md](hunter-learning.md)). Harm is judged by paired
  intervals on 32 matched floor-on seeds; eight seeds order the work and judge nothing.
- **Floor-off collapse is watched, never a target.**

## Context

### Nature model

Real prey do not travel to a refuge; the refuge is within a dash of where they feed, and the animal's flight decision
counts that distance.

| Behaviour in nature                                                                                                                                                                                                             | Maps to                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Flight initiation distance rises with the distance to refuge: gray squirrels (Dill and Houtman 1989) and woodchucks over 0 to 25 m from the burrow (Bonenfant and Kramer 1996) flee earlier the farther they stand from shelter | A prey that flees only inside 300 px needs cover inside about that distance of where it stands; `eval.prey_within_dash_share`           |
| The decision to flee trades the cost of leaving the food against the risk of being caught, so a refuge near the food is a refuge that is used (Ydenberg and Dill 1986; Stankowich and Blumstein 2005)                           | Ring on the rim of a food patch: `refugeAnchor` `patch`                                                                                 |
| Foragers feed near cover and pay for it in food: microhabitat choice under predation risk, giving-up densities higher in the open or far from cover (Kotler 1984; Brown 1988; Lima and Dill 1990)                               | Food stays outside the ring (`coverFoodFree`); the patch and the ring share a rim, so the leak back out to feed is a few hundred pixels |
| Many small patches of cover and edges of a feeding habitat, not one large shelter per range, hold the animals (Lima and Dill 1990; the landscape of fear, Laundre, Hernandez and Altendorf 2001)                                | `refugePerPatch` rings per food patch, one to two, instead of 8 rings placed at random                                                  |
| A burrow or thicket admits the prey and not the predator: a size refuge                                                                                                                                                         | `refugeSizeMax` (unchanged)                                                                                                             |

Sources, as read on 2026-11-07: the Dill and Houtman (1989) and Bonenfant and Kramer (1996) results were checked against
their abstracts; the rest are cited from memory and `sim-notes.md` flags them for a full read.

### What blocks it today (read from code)

| Fact                                                                                                                                                                                                | Where                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ring centres are drawn at random inside a height band of one basin, from the `obstacles` stream, with no knowledge of the food. Rings come in groups of `refugeCluster` 2, so 8 rings are 4 sites   | `placeRefuges`, `clusterSpacing` in `../../js/sim/terrain.js`                                                 |
| The 16 food patches (radius `foodPatchRadius` 400) are drawn from the `food` stream after the terrain and do not look at the rings                                                                  | `createPatches` in `../../js/sim/food-patches.js`, `basinPatchX` in `terrain.js`, `createWorld` in `spawn.js` |
| Prey are tied to the patches: 28 to 45% of prey-samples are inside a patch disc, which covers about 7% of the map; the median prey is 450 to 720 px from a patch centre                             | Diagnostic below                                                                                              |
| The ring count is bounded and hard to raise by hand: the layout check keeps whole rings in a basin and in height bands, and the rings sit in rows                                                   | `refugeProblem` in `terrain.js`; `refugeCount` is `int(0, 32)` in `../../js/sim/config-rules.js`              |
| Bites inside a ring are 0.12 of the outside rate and bodies up to radius 32 enter, so the cover works when reached                                                                                  | `E130`; `ringRadius` in `terrain.js`                                                                          |
| The refuge sense gives bearing and nearness over 2,500 px, but a flight that starts at a hunter inside 250 to 350 px of vision ends in 300 px, so the sense points at a ring that no flight reaches | `writeRefugeInputs` in `../../js/sim/refuge-sense.js`; `E132`                                                 |
| `coverFoodFree` and `coverConceals` exist as switches but act only inside a ring, which prey enter 0.1 to 0.5% of the time                                                                          | `rejectedByCover`, `stepCover` in `../../js/sim/cover.js`                                                     |

### Diagnostic (2026-11-07, floor on, default config, `map-elites-v6`, seeds 1 to 4, 20,000 ticks)

Non-hunting agents sampled every 200 ticks over the second half of each run (3,016 to 18,469 samples per seed).

| Seed | Median distance to nearest ring edge (px) | Within 300 px | Within 600 px | Inside a ring | Inside a patch disc | Population at end |
| ---- | ----------------------------------------- | ------------- | ------------- | ------------- | ------------------- | ----------------- |
| 1    | 2,667                                     | 1.3%          | 3.3%          | 0.12%         | 37%                 | 293               |
| 2    | 1,953                                     | 5.2%          | 12.6%         | 0.39%         | 45%                 | 280               |
| 3    | 2,197                                     | 1.1%          | 2.2%          | 0%            | 28%                 | 27                |
| 4    | 2,313                                     | 4.5%          | 9.5%          | 0.50%         | 31%                 | 452               |

A prey flees about 300 px and a body is about 40 to 60 px across, so the median prey stands 40 to 50 body lengths from
cover; the woodchucks of Bonenfant and Kramer fled from cover 25 m (about 50 body lengths) away at their longest and
stopped near the burrow when the start was beyond 2 m. The cover is a different habitat from the food, and the prey live
in the food. Phase 1 turns this table into a metric on 32 seeds.

## Baseline

| Metric                                                                  | Value (floor on)                         |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| `eval.refuge_use_under_threat`                                          | -0.0024, 32 seeds (`E130`)               |
| `eval.refuge_bite_deficit`                                              | 0.12 (`E130`)                            |
| Prey within 300 px / 600 px of a ring edge                              | 1 to 5% / 2 to 13%, seeds 1 to 4 (above) |
| Prey inside a patch disc                                                | 28 to 45%, seeds 1 to 4 (above)          |
| `eval.refuge_use_under_threat` with `refugeSense` on, 16 seeds (`E133`) | -0.0029                                  |

## Config keys and options

Validated in `../../js/sim/config-rules.js`, defaulted in `../../js/sim/config-defaults.js`; each has an entry in
`../../scripts/flag-ledger.json` pointing at its deletion task.

| Key              | Type                   | Default  | Meaning                                                                                                                                                                                                                      |
| ---------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refugeAnchor`   | enum `random`, `patch` | `random` | Phase 2. `random` is today's `placeRefuges`. `patch` puts each ring's centre on the rim of a food patch, `foodPatchRadius` from the patch centre, at an angle drawn from the `obstacles` stream, and ignores `refugeCluster` |
| `refugePerPatch` | integer, 1 to 2        | 1        | Phase 2. Used with `refugeAnchor` `patch`: the rings per patch; the second sits on the rim half a turn from the first. `refugeCount` is then `foodPatchCount x refugePerPatch`, checked at validation                        |

The existing `coverFoodFree`, `coverConceals` and `refugeSense` keep their owners ([realistic-keepers.md](realistic-keepers.md),
[refuge.md](refuge.md)); this doc screens them with the new map.

## Detectors

New `eval.*` metrics from the eval observer at the 10-tick sample, `watch`, none a reward.

| Metric                        | Reads                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.prey_cover_distance`    | The median over non-hunting agent-samples of the distance to the nearest ring edge, 0 inside one (intended lower)                                     |
| `eval.prey_within_dash_share` | The share of non-hunting agent-samples within `DASH_PX` 600 px of a ring edge (twice the 300 px a prey flees; intended higher)                        |
| `eval.prey_in_patch_share`    | The share of non-hunting agent-samples inside a food patch disc: the control that says where prey live, so a move in the first two is read against it |

## Phases

### Phase 1 - Reach instruments and baseline

**Targets:** none - the three metrics are instruments (`watch`) and no existing metric moves; the phase ends with a 32-seed baseline.

Done means: the three metrics run in `js/evo/scene-reach.js`, `npm run eval:power` has rated them, and the 32-seed floor-on
baseline (`E-D-2`) replaces the four-seed diagnostic above with numbers in [sim-notes.md](sim-notes.md).

Chunks:

| Chunk                  | Tasks  | Boundary                                                                            |
| ---------------------- | ------ | ----------------------------------------------------------------------------------- |
| A - Instruments (Code) | T1     | The three metrics with tests and the Metrics rows; no behaviour change              |
| B - Baseline (Runs)    | T2, T3 | The 32-seed floor-on run, `eval:power`, the sim-notes entry, the conformance review |

### Phase 2 - Habitat on the patch rims

**Targets:** eval.refuge_use_under_threat, eval.refuge_prey_use_under_threat, eval.refuge_episode_entry, eval.refuge_bite_deficit, eval.refuge_exit_fed, eval.refuge_crowding, eval.population_mean, eval.predators_at_end, eval.hunter_kill_conversion_by_age.1k-2k

`refugeAnchor` `patch` puts one or two rings on the rim of every food patch, so a prey that feeds in a patch is within a few
hundred pixels of cover.

Prediction (`E-D-3`, written before the run): with `patch` and `refugePerPatch` 1 (16 rings), `eval.prey_within_dash_share`
rises from about 0.03 to 0.10 to at least 0.5 and `eval.prey_cover_distance` falls from about 2,300 px to under 600 px;
`eval.refuge_use_under_threat` rises from -0.002 to between +0.01 and +0.04, because a flight now ends in a ring for the
prey that stand in a patch; `eval.refuge_bite_deficit` stays near 0.12. With `refugePerPatch` 2 (32 rings) reach rises
again and the detector more, with the cost that more rock stands in the patches. With `coverFoodFree` on the leak back
out to feed (`eval.refuge_exit_fed`) rises and ring use when calm falls, so the threatened-minus-calm difference rises.
`refugeSense` makes little difference at this range. The guard to watch is the hunters: a ring on every patch rim also
shelters prey from the hunters that work the patches, and `eval.hunter_kill_conversion_by_age.1k-2k` may drop. If it drops
below 80% of the defaults arm the arm is dropped and a smaller `refugePerPatch` is the fallback. The scene bar is
`eval.refuge_use_under_threat` of at least 0.02 with the paired interval excluding 0 on 32 matched seeds; the 0.05 bar of
[refuge.md](refuge.md) is the goal.

Done means: the screen (`evals/screens/habitat-cover.grid.json`, 8 seeds, 200,000 ticks, floor on) arms below, a 32-seed
confirmation of the best arm against its own `random` control, and the keep rule on both.

| Arm                   | `refugeAnchor` | `refugePerPatch` | `refugeCount` | `coverFoodFree` | `coverConceals` | `refugeSense` |
| --------------------- | -------------- | ---------------- | ------------- | --------------- | --------------- | ------------- |
| control               | random         | -                | 8             | false           | false           | false         |
| patch-16              | patch          | 1                | 16            | false           | false           | false         |
| patch-16-sense        | patch          | 1                | 16            | false           | false           | true          |
| patch-32              | patch          | 2                | 32            | false           | false           | false         |
| patch-16-free-conceal | patch          | 1                | 16            | true            | true            | false         |
| patch-32-free-conceal | patch          | 2                | 32            | true            | true            | false         |

Chunks:

| Chunk              | Tasks          | Boundary                                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------- |
| C - Habitat (Code) | T4, T5, T6, T7 | The two keys, the patch-rim placement, the layout check, the log fields; defaults unchanged |
| D - Screen (Runs)  | T8, T9         | The grid and the 8-seed screen                                                              |
| E - Confirm (Runs) | T10, T11       | The 32-seed paired confirmation, the floor-off watch run, the conformance review            |

### Phase 3 - Adopt and close

**Targets:** eval.refuge_use_under_threat, eval.refuge_episode_entry, eval.hunter_kill_conversion_by_age.1k-2k, eval.prey_types_at_end

Done means: the best arm that passes the keep rule on 32 matched seeds becomes the default (a realistic mechanism that
does no harm stays); the others are deleted with their keys; the goldens are re-pinned. If reach is at least 0.5 but
`eval.refuge_use_under_threat` is still under 0.02, the prey have cover in reach and do not use it: T12 records the numbers
and writes a Proposed doc for a flee-to-cover instinct (the hunter-reflex pattern), and does not tune here.

Chunks:

| Chunk            | Tasks         | Boundary                                                                              |
| ---------------- | ------------- | ------------------------------------------------------------------------------------- |
| F - Close (Code) | T12, T13, T14 | The verdict, the defaults and deletions, the re-pin, the docs, the conformance review |

## Decisions

| Decision                                                                               | Why                                                                                                                                                                | Status    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| The fix is where the cover stands, not a brain change                                  | Prey are 28 to 45% inside patch discs and a median 2,000 to 2,700 px from a ring; a flight is 300 px (`E132`)                                                      | Delegated |
| Rings go on the rim of a food patch, not at its centre                                 | Cover is not free food: the ring stays off the feeding ground and on its edge, the margin where nature puts the cover; a ring at the centre would cover the plants | Delegated |
| Phase 1 measures reach before any switch                                               | The scene is judged by a state metric that reads chance; a reach metric shows whether the map moved before selection could                                         | Delegated |
| `refugeAnchor` is an enum with `random` as the default and the control                 | The old placement is the control arm; the switch is deleted at T12 with the loser                                                                                  | Delegated |
| Eight seeds screen, 32 matched seeds judge                                             | The principles: eight seeds never judge anything; harm is a paired interval on 32                                                                                  | Delegated |
| Hunters are guarded, not exempted                                                      | Shelter on every patch also shelters prey from the hunters that work the patches; the keep rule and 80% conversion bound it                                        | Delegated |
| A flee-to-cover instinct is a later doc, only if reach is made and use is still absent | Habitat first: a reflex layered on cover prey cannot reach would be unmeasurable                                                                                   | Delegated |
| Priority 20                                                                            | Changes the map, so it re-pins the goldens; it queues behind the balance round and the other unbuilt docs                                                          | Delegated |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/`: new `refuge-habitat.js` (`placePatchRefuges` writes the ring rocks on the patch rims from the `obstacles` stream, called by `placeTerrain` in `terrain.js` when `refugeAnchor` is `patch`; `terrain.js` stays under the 300-line limit); `createWorld` in `spawn.js` runs `createPatches` before `placeTerrain`; `refugeProblem` learns the patch layout. `js/evo/`: new `scene-reach.js` (the three metrics, reading `refugeCentresOf`). No worker, renderer or UI change: the rings are rocks the renderer already draws                                                                    |
| Unit tests              | `test/sim/refuge-habitat.test.js` (every ring centre is `foodPatchRadius` from its patch centre; rocks clear of the wall, the world edge and each other; `refugePerPatch` 2 rings half a turn apart; the layout check refuses a count that is not `foodPatchCount x refugePerPatch`; same seed and config give the same rocks); `test/evo/scene-reach.test.js` (scripted positions give known distance, share and patch share; hunters excluded; no rings gives `null`); a default-world test that `placeTerrain` with `refugeAnchor` `random` and `createPatches` run first leave `worldHash` unchanged |
| Headless e2e            | Phases 1 and 2 leave the four golden cases in `test/sim/golden.json` unchanged (the keys default off and the default order is hash-neutral); T12 re-pins them in Node and Chromium (`npm run browser:hash`) in one commit when a default moves. `eval-smoke` reports the three metrics                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | The `patch` placement runs once at world creation; the per-tick path is unchanged, so `bench.step_ms@500` and `bench.phase_ms.*@500` stay inside the `bench-check` threshold (run under the CPU lock). `scene-reach.js` runs in the eval observer only and allocates nothing per sample                                                                                                                                                                                                                                                                                                                  |
| Evolution metrics       | Phase 1: the three metrics on 32 floor-on seeds, 200,000 ticks, and `eval:power`. Phase 2: the Targets, screened on 8 seeds and confirmed with `npm run eval:compare` on 32 matched floor-on seeds against the arm's own `random` control; done is `eval.refuge_use_under_threat` up by 0.02 or more with the interval excluding 0, reach up, and the keep rule held. Phase 3: the same on the adopted default                                                                                                                                                                                           |
| Determinism             | `placePatchRefuges` draws one angle per ring from the `obstacles` stream (`world.rng.obstacles`), after the wall; patch centres come from the `food` stream as today, so the two streams do not interact and `random` draws are unchanged. A world replays bit-for-bit from seed and config                                                                                                                                                                                                                                                                                                              |
| Config and persistence  | `refugeAnchor` enum `random` or `patch` (default `random`) and `refugePerPatch` integer 1 to 2 (default 1) in `createConfig`, validated in `config-rules.js` with the count check. Flag-ledger entry for `refugeAnchor` (plan `docs/designs/habitat-cover.md`, task T12). No change to the genome, archive, champion files or IndexedDB schema: the layout is not saved state                                                                                                                                                                                                                            |
| Logging and diagnostics | `CoverConfig` (info, once, from `log-cover.js`) carries `refugeAnchor` and `refugePerPatch` beside the ring count; an out-of-range key or a count that does not fit throws from config validation with the key named. Reproduce a world with `npm run replay -- --seed <n> --ticks <n> --config <file.json>` and read `CoverConfig`; reach per sample is an eval metric, not a per-tick log                                                                                                                                                                                                              |
| Browser compatibility   | N/A - the keys run in the sim core and the detectors in the eval observer; no new browser API; T12 checks the re-pinned hashes in Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Docs                    | This doc (as-built once `Implemented`); [principles.md](../principles.md) Refuge row; [evolution-evals.md](evolution-evals.md) Metrics table; [refuge.md](refuge.md) and [realistic-keepers.md](realistic-keepers.md) status lines when `refugeSense`, `coverFoodFree` and `coverConceals` get a verdict here; [sim-notes.md](sim-notes.md) entries for the diagnostic and the verdict; the index regenerated                                                                                                                                                                                            |
| Verification            | `scripts/check.sh` green per chunk PR; the manual browser walk below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Task breakdown

### Phase 1 - Reach instruments and baseline

| #   | Task                                                                                                                                                     | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-reach.js` with `eval.prey_cover_distance`, `eval.prey_within_dash_share` and `eval.prey_in_patch_share`, its test and the Metrics rows | [mechanical] | -          |
| T2  | Run 32 floor-on seeds at 200,000 ticks (`E-D-2`), `eval:power` the three metrics, write the baseline into `sim-notes.md`                                 | [mechanical] | T1         |
| T3  | Conformance review of Phase 1: a fresh agent checks every Delivery requirements row against the diff, in parallel with `scripts/check.sh`                | [judgement]  | T2         |

### Phase 2 - Habitat on the patch rims

| #   | Task                                                                                                                                                              | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Add `refugeAnchor` and `refugePerPatch` to `createConfig` and `config-rules.js`, the flag-ledger entry and the count validation                                   | [mechanical] | T3         |
| T5  | Add `refuge-habitat.js` `placePatchRefuges`, call it from `placeTerrain`, move `createPatches` before `placeTerrain` in `createWorld`, with the hash-neutral test | [judgement]  | T4         |
| T6  | Teach `refugeProblem` the patch layout: rings clear of the wall, the edge and each other, or a named refusal                                                      | [judgement]  | T5         |
| T7  | Carry `refugeAnchor` and `refugePerPatch` in `CoverConfig` and the log                                                                                            | [mechanical] | T5         |
| T8  | Write `evals/screens/habitat-cover.grid.json` with the six arms and the prediction in `E-D-3`                                                                     | [mechanical] | T6, T7     |
| T9  | Run the 8-seed screen (`npm run screen -- --grid evals/screens/habitat-cover.grid.json`), floor on, and record the table                                          | [mechanical] | T8         |
| T10 | Confirm the best arm and its control on 32 matched floor-on seeds with `eval:compare`, plus the floor-off watch run (`E-D-4`)                                     | [mechanical] | T9         |
| T11 | Conformance review of Phase 2: a fresh agent checks every Delivery requirements row against the diff, in parallel with `scripts/check.sh`                         | [judgement]  | T10        |

### Phase 3 - Adopt and close

| #   | Task                                                                                                                                                                                                      | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T12 | Verdict: set the winning arm's values as defaults, delete `refugeAnchor` and the losing paths and keys with their ledger entries, re-pin the goldens in Node and Chromium; or write the flee-to-cover doc | [judgement]  | T11        |
| T13 | Update `sim-notes.md`, the Refuge row of `principles.md`, the Metrics table, the status lines of `refuge.md` and `realistic-keepers.md`, and the index                                                    | [mechanical] | T12        |
| T14 | Conformance review of Phase 3: a fresh agent checks every Delivery requirements row against the diff, in parallel with `scripts/check.sh`                                                                 | [judgement]  | T13        |

## Verification

- `scripts/check.sh` is green on each chunk PR; `scripts/check.sh --fix --docs` on a docs-only change.
- Manual browser walk after Phase 2: `npm run dev`, start a world with `refugeAnchor` `patch`; each food patch shows a ring of
  rocks on its rim; prey enter a ring when a hunter closes in, leave it to feed, and the hunters still hunt.
- Replay: `npm run replay -- --seed 1 --ticks 20000 --config <patch.json>` logs `CoverConfig` with the anchor and the ring count.
- Done for Phase 2 is the `eval:compare` output for each Target on 32 matched seeds in the PR body, and the keep rule.
