# Eat choice

**Status:** In progress - Phases 1 to 3 are built: the eat choice is the default on `season/next` (E159 to E162; keep rule no harm on seeds 1 to 64 and 65 to 128); two Done bars missed, see the Phase 3 record, and the Chromium golden hashes are open. Phase 4 is built: the graze hold sees in-place grazing (E163), the Done bar on `eval.deliberate_food_share` is still missed (0.43 to 0.35), and G1b is reopened (T26). Eating becomes a choice with a cost: a forager eats only while it holds the bite, grazing slows it, a full store slows it, and a hunter senses only food it can eat and pays for a strike at nothing.
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

| Id  | Change                                                                                                                                                                                                                                                                 | Lands                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| G1  | `tryEat` eats a food item only while the agent's `BITE` output is above 0, for an agent that cannot hunt (`canHunt` false); a hunter's carcass meals are unchanged                                                                                                     | Phase 3, when no keep-rule guard reads worse |
| G1b | `grazeThrust` (new number, default 1): while a non-hunter holds `BITE` above 0, its thrust is multiplied by `grazeThrust`, after `thrustEfficiency` and before `handlingThrust`                                                                                        | Phase 3, at the screen's value               |
| G2  | `fatSlowShare` (new number, default 0): thrust and turn rate are multiplied by `1 - fatSlowShare x energy / maxEnergyBySpec[spec]`, so a full store slows an agent the same at any store size                                                                          | Phase 3, at the screen's value               |
| G3  | `writeRay` sets the food channel only for food the caster can eat (`plantFoodBySpec` for a plant, `meatFoodBySpec` for meat, above 0); food it cannot eat leaves the ray empty, as a carnivore ignores grass. A forager still sees both                                | Phase 3, when no keep-rule guard reads worse |
| G4  | `strikeMissCost` (new number, default 0): a hunter holding `BITE` above 0 with nothing in its jaws loses this much energy that tick, as a lunge at nothing costs effort                                                                                                | Phase 3, at the screen's value               |
| G4b | (deleted in T12: E159 falsified it) `grazeMissCost` (new number, default 0): a non-hunter holding `BITE` above 0 with no edible food in contact (the `tryEat` contact rule, food its spec can eat) loses this much energy that tick, as a bite at nothing costs effort | Phase 3, at the screen's value               |

No flag is added. At the screen's defaults `grazeThrust` 1, `fatSlowShare` 0 and `strikeMissCost` 0 (and `grazeMissCost` 0, since deleted) changed nothing and were skipped; G3 has no key and is screened from its commit. Every change
here is a rules change (`rulesHash` hashes the whole config, sim-notes 2026-11-11), so the screen runs from an unmerged
branch and the switch targets `season/next`, in the same season line as the low-density-edge.md switch.

G1 alone costs a forager nothing, so a genome that holds `BITE` on restores eating on contact. G1b prices the hold:
always biting means always moving slowly. A forager can now refuse toxic food, which it cannot today, but only by releasing `BITE`: one that bites eats every edible item it overlaps, toxic ones included.

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

### Phase 1 - Detectors and the reference (built)

**Targets:** none - detectors and a reference run; no sim behaviour changes, and `worldHash` and the goldens stay as they are

- The three detectors are built, registered and tested.
- One 128-seed floor-on reference of the defaults carries them, its report committed under `evals/decisions/`;
  liveness and power fill their rows through `metric-power-write --merge`.
- Done when each detector is `verified` or the sim-notes entry says why not.

| Chunk | Tasks    | Contents                                       |
| ----- | -------- | ---------------------------------------------- |
| A     | T1, T2   | The detectors (code)                           |
| B     | T3 to T5 | The reference, the readings, the review (runs) |

### Phase 2 - Screen the eat choice and fat (built)

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, eval.median_lifespan, eval.bite_idle

The screen runs from an unmerged branch carrying G1, G1b and G2 as one commit each. It uses floor on, policy live, and
seeds 1 to 16 of `evals/seeds.json` for the first pass. Brains have never needed to bite to eat, so every arm runs
400000 ticks, reads its metrics after tick 200000, and lists `eval.floor_episodes`.

| Arm                | Code and config                                                             |
| ------------------ | --------------------------------------------------------------------------- |
| `defaults`         | the parent of G1                                                            |
| `bite`             | G1, `grazeThrust` 1                                                         |
| `bite-graze-5`     | G1, `grazeThrust` 0.5                                                       |
| `bite-graze-3`     | G1, `grazeThrust` 0.3                                                       |
| `bite-graze-fat`   | G1, the leading `grazeThrust`, the leading `fatSlowShare` of the first pass |
| `sense-edible`     | G3 on the parent of G1                                                      |
| `strike-2`         | the parent of G1, `strikeMissCost` 2                                        |
| `strike-5`         | the parent of G1, `strikeMissCost` 5                                        |
| `bite-grazemiss-1` | G1, `grazeMissCost` 1                                                       |

**The grid on the screen branch** (`evals/screens/eat-choice.grid.json`, E159, recorded before the run). The branch carries G1
and G3 as code, so every arm in the grid runs with both on; the grid holds the config-only arms: `bite` (the reference,
the defaults with G1 and G3), `bite-graze-5`, `bite-graze-3`, `bite-fat-3`, `bite-fat-5`, `bite-strike-2`,
`bite-strike-5` and `bite-grazemiss-1`, floor on, policy live, 400000 ticks, seeds 1 to 16. Two consequences:

- The plan's `defaults` arm (the parent of G1, without G1 or G3) is one separate eval on main's code (`origin/main`,
  `defaults`), also 400000 ticks and seeds 1 to 16, read against the grid's `bite` arm (G1 and G3 together against
  main). There are no `fat-*` arms without G1: `fatSlowShare` exists only after G2 on this branch, so the `bite-fat-*`
  arms are read against `bite`. `strike-*` and `bite-graze-fat` are read from the grid's `bite-strike-*` arms and from
  the second pass.
- `sense-edible` is G1 and G3 against main's `defaults`; G3 alone is not separable on this branch (it has no key, so no
  arm can switch it off). A G3-off arm would need a new config key, a flag-ledger row and a deletion task, which is not
  cheap, so the deviation is recorded in Decisions.

- `bite-graze-*`, `bite-fat-*`, `bite-strike-*` and `bite-grazemiss-*` arms first pass the purpose guard (`scripts/heat-guard.mjs`, low-density-edge.md T12) on
  their config: a sitter still dies of cold and a rusher of heat.
- An arm whose floor episodes exceed twice the defaults' is reported and is not ranked.
- The first pass ranks by `held`, then `alive`, then `eval.full_contact_bite_share` (lower). `bite-graze-fat` takes its
  values from that ranking and is recorded with its prediction before it runs.
- The second pass runs seeds 1 to 64 for `defaults`, the leading `bite-graze-*` arm, the leading `bite-fat-*` arm and
  `bite-graze-fat`, `sense-edible` and the leading `strike-*` arm. Each is compared with `defaults` by `npm run eval:compare -- --keep-rule --allow-config-diff <keys>`.
  The guards include hunters alive. The reports are committed under `evals/decisions/`.
- G3 lands when `sense-edible` reads no keep-rule guard worse. G4 lands at the leading `strikeMissCost` when its arm reads no guard worse and `eval.bite_idle` lower than the defaults' by the sign test.
- G1 and G1b land together when the `bite-graze-*` arm reads no guard worse and `eval.food_contact_bite_share` below
  `bite`'s. G2 lands at the leading `fatSlowShare` when its arm reads no guard worse. When G1 reads a guard `WORSE`, the
  record says which, and the plan stops before Phase 3.
- Done when the landing changes are named with their keep-rule output at 64 seeds, or the record says why none lands.

| Chunk | Tasks      | Contents                                 |
| ----- | ---------- | ---------------------------------------- |
| C     | T6 to T7e  | G1 to G4b on the screen branch (code)    |
| D     | T8 to T11a | The grid, the passes, the landing (runs) |

### Phase 3 - The switch (built)

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, bench.step_ms@500

One PR, a breaking commit (`feat!`) to `season/next`, beside the low-density-edge.md switch.

- G1 to G4 land as Phase 2 named them; `grazeMissCost` (G4b) was falsified and is deleted with its code (T12).
- The goldens are re-pinned in Node (the Chromium hashes are open: `npm run browser:hash` needs a machine with the
  Playwright browser), and `bench/baseline.json` is re-recorded on a quiet machine under the
  CPU lock, each in its own commit.
- low-density-edge.md's 64-seed pass (its T14) and finalist run on the switched world, under that doc's tasks.

Done criteria, on seeds 65 to 128 of `evals/seeds.json`, head against `origin/main`:

| Criterion                                         | Bar                                                           | 128-seed reference |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| `alive`, `held` and under-80 guards               | not worse                                                     | 0.74, 0.23, -      |
| `eval.full_contact_bite_share`                    | lower than G1 alone, by the sign test                         | read in Phase 1    |
| `eval.deliberate_food_share`                      | `eval:compare` not `worse`; `better` is the hope, not the bar | 0.42               |
| `eval.food_energy_per_1k`, `eval.median_lifespan` | `eval:compare` not `worse`                                    | 539, -             |
| `bench.step_ms@500`                               | within the budget of `bench-check`                            | -                  |

**Record (E162, seeds 65 to 128).** The keep rule reads no harm, and the hunters-alive caveat of E161 does not replicate
(13 seeds harmed, 14 recovered). Met: the guards, `eval.full_contact_bite_share` (0.19 against main's 0.53; 0.199 against
G1 alone's 0.260 on seeds 1 to 64), `eval.median_lifespan` and the bench. Missed: `eval.deliberate_food_share` (0.43 to
0.31) and `eval.food_energy_per_1k` (-29%). The first is the detector: `isDeliberate` needs the eater to be closing on the
food, so bites taken while grazing in place count as chance (deliberate energy -48%, chance -14%). The second is the
intended satiety effect: full foragers stop biting, and the fed median life and the population mean each rise 9%. The
mechanisms stay under the keep rule (principles.md); Phase 4 fixes the detector and re-reads the bar. E-EC-3 holds
(`eval.heat_stress_share` 0.40 to 0.19); E-EC-4 does not (`eval.bite_idle` -6%, interval crosses 0). Outside the guards,
`eval.diversity` and `eval.lineages_alive` fall 18%. Record: `evals/decisions/E162/results.md`.

| Chunk | Tasks      | Contents                                |
| ----- | ---------- | --------------------------------------- |
| E     | T12 to T15 | The landing, the re-pins (code)         |
| F     | T16, T17   | The paired check and its verdict (runs) |

### Phase 4 - The deliberate-meal detector sees grazing

**Targets:** eval.deliberate_food_share

`isDeliberate` counts a meal only while the eater closes on the food, so a forager grazing in place under G1b scores its
later bites as chance. A meal also counts as deliberate when the eater holds `BITE` on food it reached by a deliberate
approach in the same contact, without leaving it. `isDeliberate` lives in js/sim/merit-state.js; if merit or fitness reads it, the change moves the
hash and goes to `season/next`. The bar is re-read on seeds 65 to 128 with the new detector.

| Chunk | Tasks    | Contents                            |
| ----- | -------- | ----------------------------------- |
| G     | T18, T19 | The detector change and the re-read |

**Record (E163, 2026-11-12).** T18 adds the graze hold (`js/sim/graze-hold.js`): after a deliberate meal, meals stay
deliberate while the eater holds `BITE` and eats again within `HOLD_WINDOW` ticks. Merit reads it, so the goldens moved.
On seeds 65 to 128 the share reads 0.35 against main's 0.43 (worse) and the unheld switch's 0.31 (better): the hold closes
about a quarter of the gap, and the rest is foragers eating without a closing approach. The hold is kept on its own
merits: against the unheld switch the alive and under-80 guards read better (5 vs 18, 7 vs 23), the population mean
rises 34%, and diversity and toxic avoidance recover part of E162's loss; `eval.lineages_alive` falls 10%. As the
Decisions row says, G1b is reopened (T26).

### Phase 5 - The detectors the switch lacked

**Targets:** none - detectors and a reference run; no sim behaviour changes, and `worldHash` and the goldens stay as they are

E162 left four mechanisms with no detector, or one too weak to give a verdict (user, 2026-11-12: fix them all):

- **G1, weak.** `eval.food_contact_bite_share` and `eval.full_contact_bite_share` are `unverified` on power: at 64
  seeds they detect a change of 0.10, and a share needs 0.05 (`MAX_SHARE_MDE`). They sample once per 1000-tick
  checkpoint, so few agents are in contact at each. `js/evo/scene-eat.js` samples every `EAT_SAMPLE_TICKS` (100) ticks
  instead; the contact scan reads the food once per sample through a per-sample food cell index built from fixed
  arrays, so the scan is near O(agents) and nothing is allocated. If the 64-seed power still misses the bar, the
  sim-notes entry says so and the two stay `watch`.
- **G1b, none.** `eval.graze_speed_ratio` (ratio, watch lower): per specialisation, the mean speed of moving
  non-hunters holding `BITE` above 0 over the mean speed of those not holding it, pooled over the samples, then the
  mean over the specialisations with both. `eval.graze_time_share` (share, watch): of the non-hunter samples, the share
  holding `BITE` above 0. Both in `js/evo/scene-eat.js`.
- **G3, none.** `eval.hunter_plant_linger_share` (share, watch lower): of the hunter samples, the share in contact
  with plant food (the `tryEat` contact test, `FOOD_KIND.PLANT`, any spec) while moving below `CLOSING_SPEED` x
  `maxVelocity`, as a hunter that sensed grass and stopped on it. G3 itself is a ray rule with its own unit test; this
  reads its effect.
- **G4, weak and missing.** `eval.bite_idle` (the share of hunter ticks biting air) is `unverified` on power, and
  nothing prices the strike cost. `eval.strike_miss_energy_share` (share, lower): over the run, the energy hunters are
  charged for strikes at nothing (each tick a hunter holds `BITE` above 0 with no body in its jaws, `jawsStamp` not this
  tick, priced at `strikeMissCost`), over the food and bite energy hunters gained. It is read by the observer after the
  step; it is 0 with `strikeMissCost` 0 and null with no hunter income. `bite_idle` keeps its definition; its power is
  re-measured on the new reference.

Each new metric is registered with arithmetic and source tests, liveness and power, like Phase 1's. The reference is
the defaults on `main` (the eat choice), 64 floor-on seeds at 400000 ticks, policy live, committed under
`evals/decisions/`; `eval:power` and `metric-power-write --merge` fill the rows.

The pass also names readings the keep rule does not guard and E162 moved: `eval.diversity` and `eval.lineages_alive`
(both `worse`, -18%) and `eval.toxic_avoidance` (0.94 to 0.89, interval below 0). They are read beside the guards in
T19, in low-density-edge.md's 64-seed pass, and in every later eat-choice run; none becomes a keep-rule guard here,
since the keep rule belongs to principles.md.

| Chunk | Tasks      | Contents                               |
| ----- | ---------- | -------------------------------------- |
| H     | T20 to T23 | The detectors (code)                   |
| I     | T24, T25   | The reference, the power, the readings |

## Experiments

| Label    | Prediction, written before the run                                                                                                                              | Falsified when                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `E-EC-1` | With `grazeThrust` below 1, `eval.food_contact_bite_share` falls below `bite`'s: foragers bite at food and lift the bite to move, with no keep-rule guard worse | The share does not fall below `bite`'s, or a guard reads `WORSE`                                   |
| `E-EC-2` | With `fatSlowShare` above 0 as well, `eval.full_contact_bite_share` falls: agents near a full store stop eating once a full store costs speed                   | `bite-graze-fat` reads no lower `eval.full_contact_bite_share` than the leading `bite-graze-*` arm |
| `E-EC-3` | On the switched world `eval.heat_stress_share` falls, since only chosen meals warm a body                                                                       | It does not fall                                                                                   |
| `E-EC-4` | With G3 and G4, `eval.bite_idle` falls below the defaults', with `eval.chase_catch_share` not worse                                                             | `eval.bite_idle` does not fall, or `eval.chase_catch_share` reads `worse`                          |

## Decisions

| Decision                              | Choice                                                                                                                                                                                                                                    | If it fails                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The missed Done bars (E162)           | The switch lands with `eval.deliberate_food_share` and `eval.food_energy_per_1k` worse: the first is a detector that cannot see grazing in place, the second the satiety effect the plan wanted; the keep rule reads no harm on 128 seeds | Phase 4's re-read still reads `worse`: the eat choice makes foraging less deliberate, and the plan reopens G1b                                     |
| The fat arms                          | `fatSlowShare` exists only after G2 on this branch, so the fat arms run with G1 and G3 (`bite-fat-*`) and read against `bite`; the only main-code comparison is `defaults` at 400000 ticks (user, 2026-11-12)                             | A key-less fat switch on main, which is not worth a commit                                                                                         |
| Non-hunters pay for a bite at nothing | G4b `grazeMissCost`, the forager twin of G4 (user, 2026-11-12); dropped: at 1 it flooded the floor (E159, floor episodes 44, population mean 22) and was deleted in T12                                                                   | Drop the key when `bite-grazemiss-1` reads no guard worse and no change in the bite share                                                          |
| The eat act                           | The existing `BITE` output, for non-hunters (user, 2026-11-11)                                                                                                                                                                            | A separate `EAT` output, which changes the brain layout and costs the champions                                                                    |
| The price of holding the bite         | Grazing slows thrust (`grazeThrust`), as a grazing animal moves slowly                                                                                                                                                                    | An energy cost per tick of holding `BITE`                                                                                                          |
| Fatness                               | The store fraction, so a hunter's 5x store slows it no more than a forager's full store                                                                                                                                                   | -                                                                                                                                                  |
| Fat in the same plan                  | G2 beside G1 (user, 2026-11-11)                                                                                                                                                                                                           | -                                                                                                                                                  |
| Hunters                               | Unchanged: a hunter already bites prey with `BITE` and eats carcasses on contact                                                                                                                                                          | -                                                                                                                                                  |
| A hunter's food sense                 | Only food it can eat lights its food channel (user, 2026-11-11: a hunter seemed to attack food patches)                                                                                                                                   | The `rayHue` cue stays the only plant-or-meat signal                                                                                               |
| G3 on the screen branch               | G3 has no key, so no arm runs G1 without it; `sense-edible` reads as G1 and G3 against main's `defaults` (deviation, 2026-11-12)                                                                                                          | A `senseEdible` key with a flag-ledger row and a deletion task, then a `bite` arm with it off                                                      |
| A strike at nothing                   | Costs `strikeMissCost` energy                                                                                                                                                                                                             | -                                                                                                                                                  |
| Learning to bite from scratch         | 400000-tick arms read after tick 200000, floor episodes listed; an arm over twice the defaults' is not ranked                                                                                                                             | When every `bite-*` arm is unranked, a run with each initial genome's `BITE` bias set positive separates the transition cost from the steady state |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/scene-eat.js` (new, the detectors) and its rows in `js/evo/metric-registry/world-3.js`; `tryEat` in `js/sim/feeding.js` (G1); the thrust and turn lines of `actAll` in `js/sim/physics.js` (G1b, G2); `writeRay` in `js/sim/ray-march.js` and `wasm/src/sense.rs` (G3); the feed phase in `js/sim/feeding.js` (G4); `grazeThrust` and `fatSlowShare` in `js/sim/config-defaults.js` and `js/sim/config-validate.js`; `js/evo/observer-intent.js` untouched (its BITE readings are noted above); nothing in the worker or the app                                                                                                                                                      |
| Unit tests              | `test/evo/scene-eat.test.js` and `test/evo/metric-source-eat.test.js`: each detector on a hand-built sample and on a scripted world, the 0.8 to 0.95 band, each `nullWhen`. `test/sim/feeding.test.js`: a non-hunter in contact with food eats only with `BITE` above 0; a hunter's carcass meal is unchanged; a biting forager eats every edible item it overlaps, toxic ones included; it avoids a toxic item only by releasing `BITE`. `test/sim/physics.test.js`: at `grazeThrust` 1 and `fatSlowShare` 0 thrust and turn are unchanged; a holding forager's thrust is scaled by `grazeThrust`; a full store slows thrust and turn by `1 - fatSlowShare` for a forager and a hunter alike |
| Headless e2e            | Phase 1 changes no `worldHash`; the golden cases in `test/sim/golden.json` are re-pinned in Phase 3 with the Chromium hashes (`npm run browser:hash`); `eval-smoke` passes on the new defaults                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin; G1 adds one output read per food overlap, G1b and G2 one multiply per moving agent per tick; the detector scan runs once per 1000 ticks; the baseline is re-recorded in Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evolution metrics       | Phase 2's landing rule and Phase 3's Done criteria: `keepRule` at 64 matched seeds with hunters alive, and `eval:compare` on the verified Targets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Determinism             | No new RNG stream; G1, G1b and G2 read existing state and multiply, with no power function; replay from seed and config holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Config and persistence  | New keys `grazeThrust` (number, 0 to 1, default 1 until Phase 3), `fatSlowShare` (number, 0 to under 1, default 0 until Phase 3) and `strikeMissCost` (number, at least 0, default 0 until Phase 3). `rulesHash` changes with G1, G1b and G2, so archives of the old rules are refused by `js/evo/archive-codec.js`; the brain layout is unchanged                                                                                                                                                                                                                                                                                                                                            |
| Logging and diagnostics | No new sim log event. A failure reads as the guards and the bite shares in the keep-rule output; `npm run replay -- --seed <n> --ticks 400000 --level debug` reproduces a seed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Docs                    | `docs/designs/metrics.md` regenerated; README.md (how blobs eat); body-temperature.md (eating warms only what is chosen); sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 3's Done criteria table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

### Phase 1 - Detectors and the reference (built)

| #   | Task                                                                                                                                                                                                                           | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T1  | (built: 2026-11-11) `js/evo/scene-eat.js`: the three detectors, registered in `world-3.js`, with arithmetic and source tests; `docs/designs/metrics.md` regenerated                                                            | [judgement]  | -          |
| T2  | (built: 2026-11-11, by the delegating review: T1 conforms; sampling after burn-in, per-spec mean splits and the intended directions accepted) Conformance review of chunk A, in parallel with `scripts/check.sh`               | [judgement]  | T1         |
| T3  | (built: 2026-11-12, E158) Run the 128-seed floor-on defaults reference with the detectors; commit the report under `evals/decisions/`                                                                                          | [mechanical] | T2         |
| T4  | (built: 2026-11-12, E158: `eval.fat_speed_ratio` verified at 16 seeds; the two share detectors stay unverified on power, see sim-notes) Liveness and power for the detectors, merged into the registry; a sim-notes entry      | [mechanical] | T3         |
| T5  | (built: 2026-11-12, by the delegating review: Phase 1 conforms; the two bite shares are unverified (detectable 0.10 to 0.15 against the 0.05 share bar), so Phase 2 reads them by the sign test) Conformance review of Phase 1 | [judgement]  | T4         |

### Phase 2 - Screen the eat choice and fat (built)

| #    | Task                                                                                                                                                                                                                           | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T6   | (built: 2026-11-11) G1 on an unmerged branch: `tryEat` eats for a non-hunter only while `BITE` is above 0, with the feeding tests                                                                                              | [judgement]  | T5         |
| T7   | (built: 2026-11-11) G1b on the same branch: `grazeThrust` in `actAll`, skipped at 1, with the physics tests                                                                                                                    | [judgement]  | T6         |
| T7a  | (built: 2026-11-11) G2 on the same branch: `fatSlowShare` in `actAll`, skipped at 0, with the physics tests                                                                                                                    | [judgement]  | T7         |
| T7b  | (built: 2026-11-11) G3 on the same branch: `writeRay` and the WASM sense kernel (`wasm/src/sense.rs`, rebuilt with `scripts/build-wasm.sh`, Rust work by Opus) set the food channel only for edible food, with the sense tests | [judgement]  | T7a        |
| T7c  | (built: 2026-11-11) G4 on the same branch: `strikeMissCost` charged in the feed phase, skipped at 0, with the feeding tests                                                                                                    | [judgement]  | T7b        |
| T7d  | (built: 2026-11-11) Scripted controllers and the source fixtures bite when they mean to eat                                                                                                                                    | [judgement]  | T7c        |
| T7e  | (built: 2026-11-11, then deleted in T12: E159 falsified it) G4b on the same branch: `grazeMissCost` charged in the feed phase, skipped at 0, with the feeding tests                                                            | [judgement]  | T7d        |
| T8   | (built: 2026-11-12, E159; the guard passes on all eight arms, evals/decisions/E159/heat-guard.txt) The grid, the purpose guard on its arms, and `E-EC-1` recorded before the run                                               | [judgement]  | T7e        |
| T9   | (built: 2026-11-12, E159) First pass on seeds 1 to 16 for 400000 ticks; ranked; `bite-graze-fat` and `E-EC-2` recorded, then run                                                                                               | [mechanical] | T8         |
| T10  | (built: 2026-11-12, E160) Second pass on seeds 1 to 64 with `--keep-rule`; reports committed                                                                                                                                   | [mechanical] | T9         |
| T11  | (built: 2026-11-12, E161) Name what lands, or why nothing does; the verdicts; a sim-notes entry                                                                                                                                | [judgement]  | T10        |
| T11a | (built: 2026-11-12) Conformance review of Phase 2                                                                                                                                                                              | [judgement]  | T11        |

**Phase 2 record (built).** E159 ran the first pass on seeds 1 to 16, E160 the second pass on seeds 1 to 64 with `--keep-rule`, and E161 the chosen
bundle against main (reports and verdicts under `evals/decisions/E159/`, `E160/` and `E161/`). What lands is G1 (a
non-hunter eats only while `BITE` is above 0) and G3 (a hunter's food channel shows only edible food), both already
unconditional on the branch, with `grazeThrust` 0.5, `fatSlowShare` 0.5 and `strikeMissCost` 1 as the new defaults: the
bundle read no guard worse than main, and `E-EC-2` held (every arm alone read `WORSE` on the guards, the bundle did not).
G4b `grazeMissCost` was falsified in E159 (floor episodes 44, population mean 22), so its key, code and tests were
deleted in T12 rather than kept. Caveat for T16: the alive guard detects only 24 seeds at 64, so it must be read on the
fresh seeds 65 to 128 at the head, not taken from E161 alone.

### Phase 3 - The switch (built)

| #   | Task                                                                                                                                                                                                 | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T12 | (built: 2026-11-12) G1 to G4 as Phase 2 named them; an unused key and its code deleted; the config, feeding and physics tests                                                                        | [judgement]  | T11a       |
| T13 | (built: 2026-11-12, Node only; Chromium is not installed on the build machine, so `npm run browser:hash` is left to a machine that has it) Re-pin the goldens in Node and Chromium                   | [mechanical] | T12        |
| T14 | (built: 2026-11-12, 1.875 ms) Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                                                                  | [mechanical] | T13        |
| T15 | (built: 2026-11-12) README.md and body-temperature.md describe the eat choice and fat                                                                                                                | [mechanical] | T12        |
| T16 | (built: 2026-11-12, E162) Run the paired check on seeds 65 to 128 at the head against `origin/main`; reports committed                                                                               | [mechanical] | T14        |
| T17 | (built: 2026-11-12, E162; two bars missed, see the record) Read the Done criteria; `E-EC-3`; a sim-notes entry; conformance review of Phase 3 in parallel with `scripts/check.sh`; status line moved | [judgement]  | T15, T16   |

### Phase 4 - The deliberate-meal detector sees grazing

| #   | Task                                                                                                                                                                                                  | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T18 | (built: 2026-11-12, `js/sim/graze-hold.js`) `isDeliberate` and its observer count a held bite on food reached deliberately, in the same contact, as deliberate; a test against a naive reference      | [judgement] | T17        |
| T19 | (built: 2026-11-12, E163; bar missed, G1b reopened) Re-read the E162 reports' meals with the new detector (re-run if the reports cannot be re-read), and the Done bar on `eval.deliberate_food_share` | [judgement] | T18        |
| T26 | Reopen G1b with the hold on: screen `grazeThrust` at 0.5, 0.75 and 1 against the defaults on 64 seeds; adopt a value only on a keep-rule no-harm read that lifts `eval.deliberate_food_share`         | [judgement] | T19        |

### Phase 5 - The detectors the switch lacked

| #   | Task                                                                                                                                                                                                      | Nature       | Depends on    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| T20 | `js/evo/scene-eat.js` samples every `EAT_SAMPLE_TICKS` through a food cell index; the contact shares and `eval.fat_speed_ratio` read the denser samples; a test against the O(agents x food) scan         | [judgement]  | T17           |
| T21 | `eval.graze_speed_ratio` and `eval.graze_time_share` in `js/evo/scene-eat.js`, registered, with arithmetic and source tests                                                                               | [judgement]  | T20           |
| T22 | `eval.hunter_plant_linger_share`, registered, with arithmetic and source tests                                                                                                                            | [judgement]  | T20           |
| T23 | `eval.strike_miss_energy_share` read by the observer after the step, registered, with arithmetic and source tests; `docs/designs/metrics.md` regenerated                                                  | [judgement]  | T17           |
| T24 | The 64-seed reference of the defaults on `main` (seeds 1 to 64, 400000 ticks, floor on, policy live), report under `evals/decisions/`; `eval:power` at 16, 32 and 64 seeds; `metric-power-write --merge`  | [mechanical] | T21, T22, T23 |
| T25 | Read the reference: each detector `verified` or the sim-notes entry says why not; `eval.diversity`, `eval.lineages_alive` and `eval.toxic_avoidance` named as readings in T19 and low-density-edge.md T14 | [judgement]  | T24           |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, each detector is `verified` or the sim-notes entry says why not.
3. After Phase 2, both passes' reports and the keep-rule output are under `evals/decisions/`, and the record names what
   lands.
4. After Phase 3, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads no
   guard worse and `eval.full_contact_bite_share` lower than G1 alone.
