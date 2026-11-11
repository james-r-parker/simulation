# Eat choice

**Status:** Proposed - eating becomes a choice with a cost: a forager eats only while it holds the bite, grazing slows it, a full store slows it, and a hunter senses only food it can eat and pays for a strike at nothing. Phase 1 (the detectors and the reference) is first.
**Validated:** e2455f2f (2026-11-11)
**Priority:** 1 - after low-density-edge.md T13 (its 16-seed heat pass): 58% of the food energy on the defaults is eaten with no closing approach, and passive eating changes the heat and edge pictures, so it comes before low-density-edge.md's 64-seed pass and switch
**Depends on:** [metric-trust.md](metric-trust.md), [low-density-edge.md](low-density-edge.md) (T12, the purpose guard `scripts/heat-guard.mjs`)

The rules this doc enforces ([principles.md](../principles.md)): selection rule 1 (skill, not luck, feeds a line), the
trait **Senses are local and lossy** and the scene **Condition changes the walk** (a fat blob is slower, a grazing blob
is slower, a hungry one ranges). The refusal it removes: food that a body takes without deciding to.

## Principle - eating is a choice with a cost

In nature an animal eats by biting: a grazer crops, a browser chews, a scavenger tears. Grazing holds an animal's head
down, so it moves slowly while it eats, and it can stop when full. A body that stores more fat is heavier and slower
(small birds carrying fat take off slower and are caught more). Here:

| Rule                                                                                  | What it does today                                                                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eatAround` and `tryEat` in `js/sim/feeding.js` eat every food item an agent overlaps | A non-hunter eats on contact whatever its brain does; only `canEatNow` (sickness, `satiationShare`, `digestTicks`) stops it                                    |
| A non-hunter's `BITE` output                                                          | Does nothing: `lunge` and `bites` need `canBite` (which needs `canHunt`), and `recoil` returns early for a non-hunter                                          |
| `updateSize` in `js/sim/energy.js` grows `size` with stored energy                    | A full agent pays more at rest, but the thrust and turn lines of `actAll` in `js/sim/physics.js` ignore the store                                              |
| `writeRay` in `js/sim/ray-march.js` sets the food channel for every food item         | A hunter (`plantFoodValue` 0) sees plants and carcasses on one channel, told apart only by `rayHue`, and steers to plant patches it cannot eat                 |
| A hunter's `BITE` with nothing in its jaws                                            | Costs nothing: on E155 a hunter holds `BITE` on 72% of the ticks its jaws are empty (`eval.bite_idle` 0.72), so it looks like it strikes at whatever it passes |

## Baseline

The defaults, 128 seeds, floor on, 200000 ticks, policy live (`evals/decisions/E155/defaults-floor-on.json`).
`eval.chance_food_energy_per_1k` counts meals with no closing approach (`isDeliberate` in `js/sim/merit-state.js`, read by
`creditMeal` in `js/evo/observer-intent.js`); it does not read the `BITE` output.

| Reading                              | Value | Registry           |
| ------------------------------------ | ----- | ------------------ |
| `eval.food_energy_per_1k`            | 539   | verified, 16 seeds |
| `eval.chance_food_energy_per_1k`     | 313   | verified, 16 seeds |
| `eval.deliberate_food_energy_per_1k` | 226   | verified, 32 seeds |
| `eval.deliberate_food_share`         | 0.42  | verified, 16 seeds |
| `eval.heat_stress_share`             | 0.41  | E155               |

## What changes

| Id  | Change                                                                                                                                                                                                                                  | Lands                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| G1  | `tryEat` eats a food item only while the agent's `BITE` output is above 0, for an agent that cannot hunt (`canHunt` false); a hunter's carcass meals are unchanged                                                                      | Phase 3, when no keep-rule guard reads worse |
| G1b | `grazeThrust` (new number, default 1): while a non-hunter holds `BITE` above 0, its thrust is multiplied by `grazeThrust`, after `thrustEfficiency` and before `handlingThrust`                                                         | Phase 3, at the screen's value               |
| G2  | `fatSlowShare` (new number, default 0): thrust and turn rate are multiplied by `1 - fatSlowShare x energy / maxEnergyBySpec[spec]`, so a full store slows an agent the same at any store size                                           | Phase 3, at the screen's value               |
| G3  | `writeRay` sets the food channel only for food the caster can eat (`plantFoodBySpec` for a plant, `meatFoodBySpec` for meat, above 0); food it cannot eat leaves the ray empty, as a carnivore ignores grass. A forager still sees both | Phase 3, when no keep-rule guard reads worse |
| G4  | `strikeMissCost` (new number, default 0): a hunter holding `BITE` above 0 with nothing in its jaws loses this much energy that tick, as a lunge at nothing costs effort                                                                 | Phase 3, at the screen's value               |

No flag is added. At their defaults `grazeThrust` 1, `fatSlowShare` 0 and `strikeMissCost` 0 change nothing and are skipped; G3 has no key and is screened from its commit. Every change
here is a rules change (`rulesHash` hashes the whole config, sim-notes 2026-11-11), so the screen runs from an unmerged
branch and the switch targets `season/next`, in the same season line as the low-density-edge.md switch.

G1 alone costs a forager nothing, so a genome that holds `BITE` on restores eating on contact. G1b prices the hold:
always biting means always moving slowly. A forager that holds `BITE` can now refuse toxic food, which it cannot today.

## Detectors

Registered in `js/evo/metric-registry/world-3.js`, with arithmetic and source tests, liveness and power. They come from
the scene `js/evo/scene-eat.js` (new). At the 1000-tick checkpoint in `observeScenes`, after the step (feeding has run),
it scans each alive non-hunter against the alive food items. That is O(agents x food) once per 1000 ticks; it uses
the contact test of `tryEat` (`sqrt(dx*dx + dy*dy) < size + foodRadius`) and counts food the agent's spec can eat
(`plantFoodBySpec` or `meatFoodBySpec` above 0) while `canEatNow` holds. The scene keeps fixed per-spec accumulators,
so nothing is allocated.

| Detector                       | Meaning                                                                                                                             | Unit, better | `nullWhen`                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------ |
| `eval.food_contact_bite_share` | Of non-hunters in contact with edible food at a checkpoint, the share whose `BITE` output is above 0                                | share, watch | no non-hunter in contact on any checkpoint |
| `eval.full_contact_bite_share` | The same among those whose store is in the band 0.8 to `satiationShare` (0.95) of `maxEnergyBySpec`, where eating is still possible | share, lower | no such agent in contact on any checkpoint |
| `eval.fat_speed_ratio`         | Per spec, mean speed of moving agents above the mean store fraction over mean speed of those below, averaged over specs             | ratio, watch | no spec with moving agents on both sides   |

`BITE` also feeds `responds` and `active` in `js/evo/observer-intent.js`, so a grazing forager counts as responding.
`eval.evasion_response_share` is reported for the arms but kept out of the keep-rule guards. The BITE readers in the reflex
and drill tools and the BITE gene case in `js/evo/crossover.js` read hunters only and are unchanged.

## Phases

### Phase 1 - Detectors and the reference

**Targets:** none - detectors and a reference run; no sim behaviour changes, and `worldHash` and the goldens stay as they are

- The three detectors are built, registered and tested.
- One 128-seed floor-on reference of the defaults carries them, its report committed under `evals/decisions/`;
  liveness and power fill their rows through `metric-power-write --merge`.
- Done when each detector is `verified` or the sim-notes entry says why not.

| Chunk | Tasks    | Contents                                       |
| ----- | -------- | ---------------------------------------------- |
| A     | T1, T2   | The detectors (code)                           |
| B     | T3 to T5 | The reference, the readings, the review (runs) |

### Phase 2 - Screen the eat choice and fat

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, eval.median_lifespan, eval.bite_idle

The screen runs from an unmerged branch carrying G1, G1b and G2 as one commit each. It uses floor on, policy live, and
seeds 1 to 16 of `evals/seeds.json` for the first pass. Brains have never needed to bite to eat, so every arm runs
400000 ticks, reads its metrics after tick 200000, and lists `eval.floor_episodes`.

| Arm              | Code and config                                                             |
| ---------------- | --------------------------------------------------------------------------- |
| `defaults`       | the parent of G1                                                            |
| `bite`           | G1, `grazeThrust` 1                                                         |
| `bite-graze-5`   | G1, `grazeThrust` 0.5                                                       |
| `bite-graze-3`   | G1, `grazeThrust` 0.3                                                       |
| `fat-3`          | the parent of G1, `fatSlowShare` 0.3                                        |
| `fat-5`          | the parent of G1, `fatSlowShare` 0.5                                        |
| `bite-graze-fat` | G1, the leading `grazeThrust`, the leading `fatSlowShare` of the first pass |
| `sense-edible`   | G3 on the parent of G1                                                      |
| `strike-2`       | the parent of G1, `strikeMissCost` 2                                        |
| `strike-5`       | the parent of G1, `strikeMissCost` 5                                        |

- `bite-graze-*` and `fat-*` arms first pass the purpose guard (`scripts/heat-guard.mjs`, low-density-edge.md T12) on
  their config: a sitter still dies of cold and a rusher of heat.
- An arm whose floor episodes exceed twice the defaults' is reported and is not ranked.
- The first pass ranks by `held`, then `alive`, then `eval.full_contact_bite_share` (lower). `bite-graze-fat` takes its
  values from that ranking and is recorded with its prediction before it runs.
- The second pass runs seeds 1 to 64 for `defaults`, the leading `bite-graze-*` arm, the leading `fat-*` arm and
  `bite-graze-fat`, `sense-edible` and the leading `strike-*` arm. Each is compared with `defaults` by `npm run eval:compare -- --keep-rule --allow-config-diff <keys>`.
  The guards include hunters alive. The reports are committed under `evals/decisions/`.
- G3 lands when `sense-edible` reads no keep-rule guard worse. G4 lands at the leading `strikeMissCost` when its arm reads no guard worse and `eval.bite_idle` lower than the defaults' by the sign test.
- G1 and G1b land together when the `bite-graze-*` arm reads no guard worse and `eval.food_contact_bite_share` below
  `bite`'s. G2 lands at the leading `fatSlowShare` when its arm reads no guard worse. When G1 reads a guard `WORSE`, the
  record says which, and the plan stops before Phase 3.
- Done when the landing changes are named with their keep-rule output at 64 seeds, or the record says why none lands.

| Chunk | Tasks      | Contents                                 |
| ----- | ---------- | ---------------------------------------- |
| C     | T6 to T7c  | G1 to G4 on the screen branch (code)     |
| D     | T8 to T11a | The grid, the passes, the landing (runs) |

### Phase 3 - The switch

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, bench.step_ms@500

One PR, a breaking commit (`feat!`) to `season/next`, beside the low-density-edge.md switch.

- G1 to G4 land as Phase 2 named them; an unused `grazeThrust`, `fatSlowShare` or `strikeMissCost` is deleted with its code.
- The goldens are re-pinned in Node and Chromium, and `bench/baseline.json` is re-recorded on a quiet machine under the
  CPU lock, each in its own commit.
- low-density-edge.md's 64-seed pass (its T14) and finalist are run on the switched world.

Done criteria, on seeds 65 to 128 of `evals/seeds.json`, head against `origin/main`:

| Criterion                                         | Bar                                                           | 128-seed reference |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `alive`, `held` and under-80 guards               | not worse                                                     | 0.74, 0.23, -      |
| `eval.full_contact_bite_share`                    | lower than G1 alone, by the sign test                         | read in Phase 1    |
| `eval.deliberate_food_share`                      | `eval:compare` not `worse`; `better` is the hope, not the bar | 0.42               |
| `eval.food_energy_per_1k`, `eval.median_lifespan` | `eval:compare` not `worse`                                    | 539, -             |
| `bench.step_ms@500`                               | within the budget of `bench-check`                            | -                  |

| Chunk | Tasks      | Contents                                |
| ----- | ---------- | --------------------------------------- |
| E     | T12 to T15 | The landing, the re-pins (code)         |
| F     | T16, T17   | The paired check and its verdict (runs) |

## Experiments

| Label    | Prediction, written before the run                                                                                                                              | Falsified when                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `E-EC-1` | With `grazeThrust` below 1, `eval.food_contact_bite_share` falls below `bite`'s: foragers bite at food and lift the bite to move, with no keep-rule guard worse | The share does not fall below `bite`'s, or a guard reads `WORSE`                                   |
| `E-EC-2` | With `fatSlowShare` above 0 as well, `eval.full_contact_bite_share` falls: agents near a full store stop eating once a full store costs speed                   | `bite-graze-fat` reads no lower `eval.full_contact_bite_share` than the leading `bite-graze-*` arm |
| `E-EC-3` | On the switched world `eval.heat_stress_share` falls, since only chosen meals warm a body                                                                       | It does not fall                                                                                   |
| `E-EC-4` | With G3 and G4, `eval.bite_idle` falls below the defaults', with `eval.chase_catch_share` not worse                                                             | `eval.bite_idle` does not fall, or `eval.chase_catch_share` reads `worse`                          |

## Decisions

| Decision                      | Choice                                                                                                        | If it fails                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The eat act                   | The existing `BITE` output, for non-hunters (user, 2026-11-11)                                                | A separate `EAT` output, which changes the brain layout and costs the champions                                                                    |
| The price of holding the bite | Grazing slows thrust (`grazeThrust`), as a grazing animal moves slowly                                        | An energy cost per tick of holding `BITE`                                                                                                          |
| Fatness                       | The store fraction, so a hunter's 5x store slows it no more than a forager's full store                       | -                                                                                                                                                  |
| Fat in the same plan          | G2 beside G1 (user, 2026-11-11)                                                                               | -                                                                                                                                                  |
| Hunters                       | Unchanged: a hunter already bites prey with `BITE` and eats carcasses on contact                              | -                                                                                                                                                  |
| A hunter's food sense         | Only food it can eat lights its food channel (user, 2026-11-11: a hunter seemed to attack food patches)       | The `rayHue` cue stays the only plant-or-meat signal                                                                                               |
| A strike at nothing           | Costs `strikeMissCost` energy                                                                                 | -                                                                                                                                                  |
| Learning to bite from scratch | 400000-tick arms read after tick 200000, floor episodes listed; an arm over twice the defaults' is not ranked | When every `bite-*` arm is unranked, a run with each initial genome's `BITE` bias set positive separates the transition cost from the steady state |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/scene-eat.js` (new, the detectors) and its rows in `js/evo/metric-registry/world-3.js`; `tryEat` in `js/sim/feeding.js` (G1); the thrust and turn lines of `actAll` in `js/sim/physics.js` (G1b, G2); `writeRay` in `js/sim/ray-march.js` and `wasm/src/sense.rs` (G3); the feed phase in `js/sim/feeding.js` (G4); `grazeThrust` and `fatSlowShare` in `js/sim/config-defaults.js` and `js/sim/config-validate.js`; `js/evo/observer-intent.js` untouched (its BITE readings are noted above); nothing in the worker or the app                                                                       |
| Unit tests              | `test/evo/scene-eat.test.js` and `test/evo/metric-source-eat.test.js`: each detector on a hand-built sample and on a scripted world, the 0.8 to 0.95 band, each `nullWhen`. `test/sim/feeding.test.js`: a non-hunter in contact with food eats only with `BITE` above 0; a hunter's carcass meal is unchanged; a holding forager can decline a toxic item. `test/sim/physics.test.js`: at `grazeThrust` 1 and `fatSlowShare` 0 thrust and turn are unchanged; a holding forager's thrust is scaled by `grazeThrust`; a full store slows thrust and turn by `1 - fatSlowShare` for a forager and a hunter alike |
| Headless e2e            | Phase 1 changes no `worldHash`; the golden cases in `test/sim/golden.json` are re-pinned in Phase 3 with the Chromium hashes (`npm run browser:hash`); `eval-smoke` passes on the new defaults                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin; G1 adds one output read per food overlap, G1b and G2 one multiply per moving agent per tick; the detector scan runs once per 1000 ticks; the baseline is re-recorded in Phase 3                                                                                                                                                                                                                                                                                                                                                                           |
| Evolution metrics       | Phase 2's landing rule and Phase 3's Done criteria: `keepRule` at 64 matched seeds with hunters alive, and `eval:compare` on the verified Targets                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Determinism             | No new RNG stream; G1, G1b and G2 read existing state and multiply, with no power function; replay from seed and config holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Config and persistence  | New keys `grazeThrust` (number, 0 to 1, default 1 until Phase 3), `fatSlowShare` (number, 0 to under 1, default 0 until Phase 3) and `strikeMissCost` (number, at least 0, default 0 until Phase 3). `rulesHash` changes with G1, G1b and G2, so archives of the old rules are refused by `js/evo/archive-codec.js`; the brain layout is unchanged                                                                                                                                                                                                                                                             |
| Logging and diagnostics | No new sim log event. A failure reads as the guards and the bite shares in the keep-rule output; `npm run replay -- --seed <n> --ticks 400000 --level debug` reproduces a seed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Docs                    | `docs/designs/metrics.md` regenerated; README.md (how blobs eat); body-temperature.md (eating warms only what is chosen); sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 3                                                                                                                                                                                                                                                                                                                                                                                                         |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 3's Done criteria table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Task breakdown

### Phase 1 - Detectors and the reference

| #   | Task                                                                                                                                                                                                             | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | (built: 2026-11-11) `js/evo/scene-eat.js`: the three detectors, registered in `world-3.js`, with arithmetic and source tests; `docs/designs/metrics.md` regenerated                                              | [judgement]  | -          |
| T2  | (built: 2026-11-11, by the delegating review: T1 conforms; sampling after burn-in, per-spec mean splits and the intended directions accepted) Conformance review of chunk A, in parallel with `scripts/check.sh` | [judgement]  | T1         |
| T3  | Run the 128-seed floor-on defaults reference with the detectors; commit the report under `evals/decisions/`                                                                                                      | [mechanical] | T2         |
| T4  | Liveness and power for the detectors, merged into the registry; a sim-notes entry                                                                                                                                | [mechanical] | T3         |
| T5  | Conformance review of Phase 1                                                                                                                                                                                    | [judgement]  | T4         |

### Phase 2 - Screen the eat choice and fat

| #    | Task                                                                                                                                                                                                       | Nature       | Depends on |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T6   | G1 on an unmerged branch: `tryEat` eats for a non-hunter only while `BITE` is above 0, with the feeding tests                                                                                              | [judgement]  | T5         |
| T7   | G1b on the same branch: `grazeThrust` in `actAll`, skipped at 1, with the physics tests                                                                                                                    | [judgement]  | T6         |
| T7a  | G2 on the same branch: `fatSlowShare` in `actAll`, skipped at 0, with the physics tests                                                                                                                    | [judgement]  | T7         |
| T7b  | G3 on the same branch: `writeRay` and the WASM sense kernel (`wasm/src/sense.rs`, rebuilt with `scripts/build-wasm.sh`, Rust work by Opus) set the food channel only for edible food, with the sense tests | [judgement]  | T7a        |
| T7c  | G4 on the same branch: `strikeMissCost` charged in the feed phase, skipped at 0, with the feeding tests                                                                                                    | [judgement]  | T7b        |
| T8   | The grid, the purpose guard on its arms, and `E-EC-1` recorded before the run                                                                                                                              | [judgement]  | T7c        |
| T9   | First pass on seeds 1 to 16 for 400000 ticks; ranked; `bite-graze-fat` and `E-EC-2` recorded, then run                                                                                                     | [mechanical] | T8         |
| T10  | Second pass on seeds 1 to 64 with `--keep-rule`; reports committed                                                                                                                                         | [mechanical] | T9         |
| T11  | Name what lands, or why nothing does; the verdicts; a sim-notes entry                                                                                                                                      | [judgement]  | T10        |
| T11a | Conformance review of Phase 2                                                                                                                                                                              | [judgement]  | T11        |

### Phase 3 - The switch

| #   | Task                                                                                                                                      | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T12 | G1 to G4 as Phase 2 named them; an unused key and its code deleted; the config, feeding and physics tests                                 | [judgement]  | T11a       |
| T13 | Re-pin the goldens in Node and Chromium                                                                                                   | [mechanical] | T12        |
| T14 | Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                                     | [mechanical] | T13        |
| T15 | README.md and body-temperature.md describe the eat choice and fat                                                                         | [mechanical] | T12        |
| T16 | Run the paired check on seeds 65 to 128 at the head against `origin/main`; reports committed                                              | [mechanical] | T14        |
| T17 | Read the Done criteria; `E-EC-3`; a sim-notes entry; conformance review of Phase 3 in parallel with `scripts/check.sh`; status line moved | [judgement]  | T15, T16   |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, each detector is `verified` or the sim-notes entry says why not.
3. After Phase 2, both passes' reports and the keep-rule output are under `evals/decisions/`, and the record names what
   lands.
4. After Phase 3, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads no
   guard worse and `eval.full_contact_bite_share` lower than G1 alone.
