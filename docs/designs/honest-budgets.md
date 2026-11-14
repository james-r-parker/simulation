# Honest budgets

**Status:** Proposed - five phases, each a change to world physics screened alone and landed with its season; Phase 1 (patch stock pays for plant food) is first.
**Validated:** 20857091 (2026-11-14)
**Priority:** 2 - the 128-seed read of [review-2026-11-11.md](../review-2026-11-11.md): most seeds boom to the cap and fall under 40 while food never runs short, so every scene that needs a standing prey population is tuned on top of the crash; food, the kill and the rocks come before any skill, refuge or call work
**Depends on:** [metric-trust.md](metric-trust.md)

The rules this doc enforces ([principles.md](../principles.md)): selection rule 1 (luck is not skill), rule 3 (mating
breaks the genome bag), rule 6 (a kill that costs more than it returns is a failed gene) and rule 8 (a signal that
pays the liar is switched off). The scenes it serves: **leave a dying patch**, **scavenge**, **parent spends** and
**call, or don't**. It adds no fitness term, no brain input, no restock and no headcount rule.

## Principle - three budgets that are not budgets

Energy enters the world in `addEnergy` (`js/sim/energy.js`) and leaves through `removeEnergy`. Three sources mint
energy that no body or patch pays for, and one hazard deletes bodies faster than any predator:

| Rule today                                                                                                                                                                                           | What it does                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spawnFood` in `js/sim/food.js` requests `foodRegrowPerArea` x area x `foodScarcity` items a tick (about 10.5 in summer, 4.2 in winter), each about `foodEnergy` 100, clipped only by `maxFood` 3600 | A patch's `patchStock` is a roulette weight in [0.05, 1] (`foodPatchCapacity` 1); `depletePatchAt` takes 0.02 per meal. The item's energy is created whatever the stock. On the E173 reference the blobs eat about 123 energy a tick against about 890 requested, and starvation per prey falls as the population rises (`eval.density_starve_slope` -0.46) |
| `patchSource` in `js/sim/flora-spawn.js` sends `foodBackgroundShare` 0.2 of spawns to the background                                                                                                 | A fifth of the rain ignores the patches, so a forager orbiting a dead patch still eats; chance food (`eval.chance_food_energy_per_1k` 256) outweighs deliberate food (`eval.deliberate_food_energy_per_1k` 147)                                                                                                                                             |
| `applyBite` in `js/sim/feeding.js` adds `predatorKillEnergy` 600 on a fatal bite                                                                                                                     | The prize is the same for a thin juvenile and a fat defender, so the body never enters the hunter's sums                                                                                                                                                                                                                                                    |
| `leaveCarcass` in `js/sim/carcass.js` stores `carcassShare` 0.8 x (`foodEnergy` + `biteEnergy`), the lifetime intake, for `carcassTicks` 300                                                         | A death prints a second copy of every meal the body ate; hunters take 0.46 of their income from carcasses (`eval.hunter_income_share.carcass`), and the carcass is gone before a second hunter can arrive                                                                                                                                                   |
| `wallAxis` and `bounceObstacles` in `js/sim/physics.js` charge `wallDamage` and `obstacleDamage` 50 on every tick a body moves into a wall or rock                                                   | A body thrusting against a rock dies in a few ticks: 0.26 of deaths are collisions (`eval.collision_death_share`), and refuge rings, which are rocks, are a trap                                                                                                                                                                                            |

Two birth rules hide the life history the genome carries:

| Rule today                                                                                               | What it does                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `splitKeysAllow` in `js/sim/split-gate.js` needs `mateScarce` and `clonalDepth` below `splitClonalMax` 3 | A split is allowed only while no mate is in reach, so the cap acts only in that state: a line that has split three times with no mate in reach cannot breed at all |
| `giftOf` in `js/sim/reproduction.js` gives `childShareOf` for a mating birth and a fixed 0.5 for a split | Most edge births are splits, so the `childShare` gene is invisible (`eval.childshare_by_condition` about 0)                                                        |

And one signal changes nothing:

| Rule today                                                                                 | What it does                                                                                 |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `alarm` in `js/sim/calls.js` spends `alarmCost` 5, sets `alarmTimer` and lays danger scent | No bite, chase or survival odds depend on it, so `eval.alarm_rate` is 0 on almost every seed |

The changes, one per phase, in nature's terms:

| Phase | Change                                                                                                                                                                                                | In nature                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1     | A patch holds energy. Its standing items reserve that energy, a meal spends it and a rotted item returns it. A spawn the free stock cannot pay is refused. The background is a trickle                | A stand of plants yields what it regrows; a grazed-out meadow is empty                    |
| 2     | No energy is minted on a kill. A kill is a bite that leaves the victim at or under a share of its maximum store; the killer takes the rest up to a gorge cap, and the carcass is what remains, fading | A lion gorges on what the zebra carried; hyenas arriving late find less                   |
| 3     | Collision damage scales with the speed into the surface, above a deadband, once per impact                                                                                                            | Walking into a rock bruises; resting against one does not                                 |
| 4     | No clonal cap. A split gives the `childShare` gene's gift, and a birth waits while the mother would fall under a reserve                                                                              | Parthenogenesis runs while no mate is found; a poor mother delays                         |
| 5     | A bite on a prey whose call began while a hunter was on its threat rays moves `alarmBiteShare` of the energy                                                                                          | Pursuit deterrence: a prey that has announced it has seen the hunter is the harder target |

Background, dung-zone and fungus items spend no patch stock: they stay the only plant energy without a source, as a
trickle a body may blunder into.

> Note: Adding a config key changes `rulesHash`. A phase's keys reach `main` only with its switch, which sets the
> winning value as the default, deletes the old path and opens a season.

The snowline that replaces `energyDrain`, `temperatureModifier` and the all-year `coldMarginWidth` is Phase 2 of
[seasonal-movement.md](seasonal-movement.md), and cover on the patch rims is Phase 2 of
[habitat-cover.md](habitat-cover.md); both are ranked directly behind this doc, the rims behind Phase 3 here.

## Phases

### Phase 1 - Patch stock pays for plant food

**Targets:** eval.density_starve_slope, eval.patch_leave_depleted, eval.chance_food_energy_per_1k, eval.deliberate_food_share

| Rule                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patchStockEnergy` (boolean, false is the weight model): `foodPatchCapacity` is the full stock of a patch in energy, and every reader that takes stock as a share of `foodPatchCapacity` (`stepPatchLife`, `ageBank`, `pollination.js`, `flora-state.js`, `snapshot.js`, `scene-patch.js`) keeps that reading                      |
| `world.patchReserved` (per patch) holds the energy of the patch's standing items, by `foodPatch`                                                                                                                                                                                                                                   |
| `spawnFloraItem` in `js/sim/flora-spawn.js` takes the patch and its species from `patchSource` and `pickPatch`, then refuses the attempt, before `placeInDisc`, when `patchStock - patchReserved` minus the item's energy falls under the floor (`PATCH_FLOOR_SHARE` x capacity); a placed item adds its energy to `patchReserved` |
| A plant meal (`consumeFood`, and a herd's in `js/sim/herd-graze.js`) takes the eaten energy from its item's patch stock and reservation; `depletePatchAt` and `foodPatchDepletion` are not used                                                                                                                                    |
| A plant item that rots (`ageFood`) or is removed returns its energy to its patch's reservation; the stock keeps it                                                                                                                                                                                                                 |
| `regrowPatches` keeps its logistic form and floor; a patch grazed to the floor for `patchDieTicks` dies into its seed bank as today, and sprouts at `seedStock` x capacity                                                                                                                                                         |
| `areaExpected` in `js/sim/food.js` drops `foodScarcity`: the attempt count is a ceiling, and the season acts through `patchRegrowFactor` (`winterRegrow` 0.2, summer 1.5)                                                                                                                                                          |
| `maxFood`, `maxAgents` and `fillFloor` stay as guards                                                                                                                                                                                                                                                                              |

The grid sets each arm's capacity from the full-map maximum sustainable yield, `0.25 x foodPatchRegrow x
mean(patchRegrow) x season mean of patchRegrowFactor x foodPatchCapacity x foodPatchCount`, against the plant energy
eaten a tick (blobs plus herds) on the E173 reference:

| Arm       | Yield against today's intake | `foodBackgroundShare` |
| --------- | ---------------------------- | --------------------- |
| `control` | weight model                 | 0.2                   |
| `y1-b5`   | 1x                           | 0.05                  |
| `y15-b5`  | 1.5x                         | 0.05                  |
| `y25-b5`  | 2.5x                         | 0.05                  |
| `y1-b2`   | 1x                           | 0.02                  |
| `y15-b2`  | 1.5x                         | 0.02                  |
| `y25-b2`  | 2.5x                         | 0.02                  |

| Done when                                                                                                                                                              | Stop when                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The finalist reads `eval.density_starve_slope` above 0 and `better` on `eval.patch_leave_depleted`, and `keepRule` on 64 matched floor-on seeds reads no guard `WORSE` | Every arm keeps `eval.density_starve_slope` at or under 0  |
| `eval.chance_food_energy_per_1k` falls below `eval.deliberate_food_energy_per_1k` on the finalist                                                                      | Every arm reads `held` or `alive` `WORSE` in the keep rule |

#### Chunks

| Chunk | Tasks    | Contents                                                  |
| ----- | -------- | --------------------------------------------------------- |
| A     | T1 to T3 | The energy stock, its tests and the grid (code, unmerged) |
| B     | T4, T5   | The 16-seed screen and the 64-seed keep-rule pass (runs)  |
| C     | T6, T7   | The switch and the conformance review                     |

### Phase 2 - The kill is the body

**Targets:** eval.hunter_income_share.carcass, eval.hunter_catches_per_1k, eval.hunter_zero_kill_carcass_share

| Rule                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `killShare` (share, 0 is today's kill at an empty store): a bite in `applyBite` is fatal when it leaves the victim at or under `killShare` x its maximum energy. The killer then takes the victim's remaining energy up to `killGorgeCap` and its own headroom (`transferEnergy`), and the rest is removed from the victim as `LOSS_CAUSE.BITE` and held for its carcass, so the victim's store is 0 |
| `fatal`, `noteFatalBiteObservation`, `noteBiteLedger` and the rest timer use that condition; the predator's `REWARD_SOURCE.KILL` counts the energy moved                                                                                                                                                                                                                                             |
| `predatorKillEnergy` is 0 in every non-control arm and deleted at the switch: a fatal bite mints nothing                                                                                                                                                                                                                                                                                             |
| `leaveCarcass` stores `carcassShare` x the energy the body held at death: on a kill, the remainder the killer did not take; on a starvation or collision death, about 0; on old age, the store. Like plant food, the carcass enters the ledger when eaten, and the death books the same energy out                                                                                                   |
| A blob carcass's value falls linearly from its stored value to 0 over `carcassFadeTicks`, which replaces `carcassTicks` (`ageFood`, `consumeFood`, `snapshot.js`, `scene-carcass.js`); a meal takes the value at that tick. Herd carcasses keep their own life                                                                                                                                       |
| The `foodEnergy` and `biteEnergy` counters stay as ledgers and price nothing                                                                                                                                                                                                                                                                                                                         |

| Arm         | `killShare` | `killGorgeCap` | `carcassFadeTicks` | Predator `passiveLossMultiplier` |
| ----------- | ----------- | -------------- | ------------------ | -------------------------------- |
| `control`   | today       | -              | - (300 fixed)      | 0.3                              |
| `body`      | 0           | 2000           | 1500               | 0.3                              |
| `body-k25`  | 0.25        | 2000           | 1500               | 0.3                              |
| `body-k25r` | 0.25        | 2000           | 1500               | 0.2                              |
| `body-k25g` | 0.25        | 4000           | 2500               | 0.3                              |

| Done when                                                                                                                       | Stop when                              |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `keepRule` on 64 matched seeds reads no guard `WORSE`, hunter catches included, and `eval.hunter_zero_kill_carcass_share` falls | Every arm reads hunter catches `WORSE` |

#### Chunks

| Chunk | Tasks     | Contents                                                |
| ----- | --------- | ------------------------------------------------------- |
| D     | T8 to T10 | Kill, carcass and fade, their tests and the grid (code) |
| E     | T11, T12  | The screen and the keep-rule pass (runs)                |
| F     | T13, T14  | The switch and the conformance review                   |

### Phase 3 - Impacts, not contact

**Targets:** eval.collision_death_share, eval.refuge_episode_entry

| Rule                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wallAxis` reports the speed into the wall before the reflection; `bounce_rocks` in `wasm/src/physics.rs` writes the speed along the rock's normal for each impact to a new output, read by `bounceRocksKernel` |
| An impact costs `impactDamage` x (speed into the surface - `impactDeadband`) when that is above 0, else nothing; walls and rocks share the rule                                                                 |
| `obstacleDamage` and `wallDamage` are 0 in every non-control arm and deleted at the switch                                                                                                                      |

| Arm       | `impactDeadband` | `impactDamage` | Full-speed hit (speed 8) |
| --------- | ---------------- | -------------- | ------------------------ |
| `control` | -                | -              | 50 every tick            |
| `d2-x8`   | 2                | 8              | 48                       |
| `d4-x12`  | 4                | 12             | 48                       |
| `d4-x25`  | 4                | 25             | 100                      |

| Done when                                                                                        | Stop when                                                  |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `eval.collision_death_share` `better`, and `keepRule` on 64 matched seeds reads no guard `WORSE` | `eval.collision_death_share` stays above 0.15 on every arm |

#### Chunks

| Chunk | Tasks      | Contents                                                     |
| ----- | ---------- | ------------------------------------------------------------ |
| G     | T15 to T17 | The kernel and wall speeds, the damage rule, the grid (code) |
| H     | T18, T19   | The screen and the keep-rule pass (runs)                     |
| I     | T20, T21   | The switch and the conformance review                        |

### Phase 4 - The edge breeds, and splits carry the gene

**Targets:** eval.edge_starve_per_prey, eval.childshare_by_condition

| Rule                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No clonal cap: `mateScarce` alone gates a split in `splitKeysAllow`, so the tick a mate is in reach the next birth has to be a mating. At the switch `splitClonalMax`, `clonalDepth`, `noteClonalBirth` and the clonal gate share (`scene-edge-gates.js`, `metric-registry/world-3.js`) are deleted |
| `giftOf` gives `childShareOf` for a split as for a mating                                                                                                                                                                                                                                           |
| `birthReserve` (energy, 0 is off): `giveBirth` blocks a birth that would leave the mother under `birthReserve`                                                                                                                                                                                      |

| Arm         | Clonal cap | Split gift | `birthReserve` |
| ----------- | ---------- | ---------- | -------------- |
| `control`   | 3          | 0.5        | 0              |
| `nocap`     | none       | 0.5        | 0              |
| `nocap-g`   | none       | gene       | 0              |
| `nocap-g-r` | none       | gene       | 300            |

| Done when                                                                                                          | Stop when                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `keepRule` on 64 matched seeds reads `held` not worse and no guard `WORSE`; `eval.childshare_by_condition` above 0 | `eval.edge_starve_per_prey` `WORSE` on every arm |

#### Chunks

| Chunk | Tasks    | Contents                                  |
| ----- | -------- | ----------------------------------------- |
| J     | T22, T23 | The gate, the gift and the reserve (code) |
| K     | T24, T25 | The screen and the keep-rule pass (runs)  |
| L     | T26, T27 | The switch and the conformance review     |

### Phase 5 - A call changes the bite

**Targets:** eval.alarm_rate, eval.alarm_lift, eval.alarm_calls_with_threat_per_1k

| Rule                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alarm` in `js/sim/calls.js` records in `world.alarmSeen` (per slot) whether any of the caller's threat ray inputs was above 0 on the tick it called           |
| `alarmBiteShare` (share, 1 is off): `applyBite` scales the energy a bite moves by `alarmBiteShare` while the victim's `alarmTimer` runs and `alarmSeen` is set |
| A call with no hunter on the caller's rays costs `alarmCost`, lays danger scent and protects nothing; hearing a call stays an input                            |

| Arm       | `alarmBiteShare` |
| --------- | ---------------- |
| `control` | 1                |
| `a75`     | 0.75             |
| `a50`     | 0.5              |

| Done when                                                                                                                                                    | Stop when                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `eval.alarm_rate` above 0 on most seeds with `eval.alarm_calls_with_threat_per_1k` rising with it, and `keepRule` on 64 matched seeds reads no guard `WORSE` | Calls with no threat rise faster than calls with one |

#### Chunks

| Chunk | Tasks    | Contents                                 |
| ----- | -------- | ---------------------------------------- |
| M     | T28      | The seen call, the bite share, tests     |
| N     | T29, T30 | The screen and the keep-rule pass (runs) |
| O     | T31, T32 | The switch and the conformance review    |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | All in `js/sim/`, `js/evo/` readers and `wasm/src/`. Phase 1: `spawnFloraItem` and `patchSource` (`js/sim/flora-spawn.js`), `createPatches`, `depletePatchAt` and `regrowPatches` (`js/sim/food-patches.js`), `areaExpected` and `ageFood` (`js/sim/food.js`), `consumeFood` (`js/sim/feeding.js`), `js/sim/herd-graze.js`, `world.patchReserved` (`js/sim/world.js`); at the switch `foodScarcity` leaves `config.seasons`, `SEASON_KEYS` in `js/sim/config-validate.js` and `scripts/lib/food-ratio.mjs`. Phase 2: `applyBite` (`js/sim/feeding.js`), `leaveCarcass` (`js/sim/carcass.js`), `ageFood`, `consumeFood`, `js/sim/snapshot.js`, `js/evo/scene-carcass.js`. Phase 3: `wallAxis`, `bounceObstacles` and `integrate` (`js/sim/physics.js`), `bounce_rocks` (`wasm/src/physics.rs`) and `bounceRocksKernel` (`js/sim/wasm-physics.js`). Phase 4: `splitKeysAllow` and `noteClonalBirth` (`js/sim/split-gate.js`), `giftOf` and `giveBirth` (`js/sim/reproduction.js`), `js/evo/scene-edge-gates.js`, `js/evo/metric-registry/world-3.js`. Phase 5: `alarm` (`js/sim/calls.js`), `applyBite`. No new module unless a file passes 300 lines                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Unit tests              | Phase 1 `test/sim/food-patches.test.js` and `test/sim/flora-spawn.test.js`: a placed patch item reserves its energy; an attempt the free stock cannot pay above the floor is refused before placement; a meal takes the eaten energy from the item's patch; a rotted item returns its reservation and leaves the stock; an unvisited patch stays full; the weight model is unchanged with `patchStockEnergy` false. Phase 2 `test/sim/feeding.test.js` and `test/sim/carcass.test.js`: no energy is minted on a kill; a bite that leaves the victim under `killShare` kills it with a store of 0; the killer's take stops at `killGorgeCap` and its headroom; the carcass holds `carcassShare` of the remainder; a starved body leaves none; the value fades linearly to 0 at `carcassFadeTicks`; the energy ledger balances across a kill. Phase 3 `test/sim/physics.test.js` and new `#[test]` cases in `wasm/src/physics.rs`: a hit under the deadband costs nothing; a body resting against a rock pays nothing across 100 ticks; damage scales with the speed into the surface; JS and WASM speeds agree. Phase 4 `test/sim/split-gate.test.js` and `test/sim/reproduction.test.js`: a line with four splits behind it splits while no mate is in reach; a split's gift is the gene's share; a birth under the reserve is blocked. Phase 5 `test/sim/calls.test.js` and `test/sim/feeding.test.js`: a call with a threat on the rays is seen, one without is not; a bite on a seen caller moves `alarmBiteShare` of the energy, on an unseen caller or a silent prey the full bite |
| Headless e2e            | `test/sim/golden.json` (default, busy, disease) and `BUSY_EFFECT_HASH` in `test/worker/sim-host.slow.test.js` are re-pinned in each phase's switch task, in their own commit, with the five WASM fixtures where the physics changes (Phase 3) and `npm run browser:hash`; `eval-smoke` passes on each branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin of `bench/baseline.json`. Phase 1 adds one comparison per patch spawn and one subtraction per plant meal or rotted item; Phase 2 one multiply per meat meal; Phase 3 one product per impact; Phases 4 and 5 one comparison per birth, call or bite. No per-tick allocation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evolution metrics       | Each phase: a 16-seed screen of its grid (`npm run screen`, 400000 ticks, floor on), then the finalist against the control on 64 matched seeds with `npm run eval:compare -- <control> <finalist> --keep-rule`; the phase's Targets by `eval:compare` at their registry seed counts; the record in `evals/decisions/E<n>/` and `evals/experiments.json` with the prediction written before the run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Determinism             | No new RNG stream. Phase 1 refuses an attempt after the `patchSource` and `pickPatch` draws and before `placeInDisc`, so in the energy model the `food` stream draws fewer floats; replay from seed and config holds. Phases 2 to 5 draw nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Config and persistence  | New keys with rules in `js/sim/config-rules.js`: `patchStockEnergy` (boolean, with its `scripts/flag-ledger.json` entry naming T6), `killShare` (share in [0, 1)), `killGorgeCap` (number, above 0), `carcassFadeTicks` (integer, at least 1), `impactDeadband` (number, at least 0), `impactDamage` (number, at least 0), `birthReserve` (number, at least 0), `alarmBiteShare` (share in [0, 1]). Deleted at each switch: `patchStockEnergy`, `foodPatchDepletion` and `foodScarcity` (Phase 1); `predatorKillEnergy` and `carcassTicks` (Phase 2); `obstacleDamage` and `wallDamage` (Phase 3); `splitClonalMax` (Phase 4). Each switch is a breaking commit with a new season in `library/seasons.json`; saved genomes and the brain layout are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Logging and diagnostics | No new sim log event. A failure reads as a keep-rule guard `WORSE` or a Target unchanged; `npm run replay -- --seed <n> --ticks 400000 --config <arm.json> --level debug` reproduces a seed with its births, deaths, kills and patch deaths (`PatchDied`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes (`npm run browser:hash`) cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Docs                    | README.md (the food, carcass, collision, birth and alarm rows), `docs/designs/sim-notes.md` (a learning per phase), [world-balance.md](world-balance.md) (the carcass and collision rows it describes), [seasonal-movement.md](seasonal-movement.md) (its `foodScarcity` text and the `foodBackgroundShare` and `maxFood` arms of its Phase 2, at the Phase 1 switch), `docs/designs/metrics.md` regenerated when a detector is added, deleted or moves trust. This doc becomes `Implemented` once Phase 5 is built or falsified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Verification            | `scripts/check.sh` green under the CPU lock at each switch; each phase's Done criteria table; a clip of the season with one of its scenes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Task breakdown

### Phase 1 - Patch stock pays for plant food

| #   | Task                                                                                                                                                                                                                                    | Nature      | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | `patchStockEnergy` with its rule and flag-ledger entry; `world.patchReserved`; meals take from the item's patch, rotted items return their reservation; `areaExpected` without `foodScarcity` in the energy model; tests                | [judgement] | -          |
| T2  | `spawnFloraItem` refuses an attempt the free stock cannot pay above the floor, before placement, and reserves a placed item's energy; tests                                                                                             | [judgement] | T1         |
| T3  | The grid: the E173 plant intake (blobs plus herds) measured, the arm capacities computed, `evals/screens/honest-food.grid.json` and the E-record prediction                                                                             | [judgement] | T2         |
| T4  | The 16-seed screen of T3 from the branch tree; `table.md` and `verdicts.json` committed; the finalist named                                                                                                                             | [judgement] | T3         |
| T5  | The finalist and the control on seeds 1 to 64 with `--keep-rule`; the verdict recorded                                                                                                                                                  | [judgement] | T4         |
| T6  | The switch: the finalist as the default, the weight model, `patchStockEnergy`, `foodPatchDepletion` and `foodScarcity` deleted, seasonal-movement.md updated, a new season, goldens and Chromium hashes re-pinned; or the branch parked | [judgement] | T5         |
| T7  | Conformance review of Phase 1, in parallel with `scripts/check.sh`; status line moved                                                                                                                                                   | [judgement] | T6         |

### Phase 2 - The kill is the body

| #   | Task                                                                                                                                 | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T8  | `killShare` and `killGorgeCap` in `applyBite`: the fatal condition, the gorge take, the remainder held for the carcass; tests        | [judgement]  | T7         |
| T9  | `leaveCarcass` prices the body at death; `carcassFadeTicks` in `ageFood`, `consumeFood`, `snapshot.js` and `scene-carcass.js`; tests | [judgement]  | T8         |
| T10 | The grid `evals/screens/honest-kill.grid.json` and the E-record prediction                                                           | [mechanical] | T9         |
| T11 | The 16-seed screen; the finalist named                                                                                               | [judgement]  | T10        |
| T12 | The finalist and the control on 64 matched seeds with `--keep-rule`; the verdict recorded                                            | [judgement]  | T11        |
| T13 | The switch: defaults, `predatorKillEnergy` and `carcassTicks` deleted, a new season, re-pins; or the branch parked                   | [mechanical] | T12        |
| T14 | Conformance review of Phase 2, in parallel with `scripts/check.sh`; status line moved                                                | [judgement]  | T13        |

### Phase 3 - Impacts, not contact

| #   | Task                                                                                                                                | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T15 | `bounce_rocks` writes the speed along the normal per impact; `scripts/build-wasm.sh`; new Rust tests (Opus)                         | [judgement]  | T14        |
| T16 | `impactDeadband` and `impactDamage` in `wallAxis`, `bounceObstacles` and `integrate`; tests                                         | [judgement]  | T15        |
| T17 | The grid `evals/screens/honest-impact.grid.json` and the E-record prediction                                                        | [mechanical] | T16        |
| T18 | The 16-seed screen; the finalist named                                                                                              | [judgement]  | T17        |
| T19 | The finalist and the control on 64 matched seeds with `--keep-rule`; the verdict recorded                                           | [judgement]  | T18        |
| T20 | The switch: defaults, `obstacleDamage` and `wallDamage` deleted, a new season, re-pins with the WASM fixtures; or the branch parked | [mechanical] | T19        |
| T21 | Conformance review of Phase 3, in parallel with `scripts/check.sh`; status line moved                                               | [judgement]  | T20        |

### Phase 4 - The edge breeds, and splits carry the gene

| #   | Task                                                                                                                                                           | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T22 | The clonal cap off in the grid's arms, the split gift from the gene and `birthReserve` in `giveBirth`; tests                                                   | [judgement]  | T21        |
| T23 | The grid `evals/screens/honest-birth.grid.json` and the E-record prediction                                                                                    | [mechanical] | T22        |
| T24 | The 16-seed screen; the finalist named                                                                                                                         | [judgement]  | T23        |
| T25 | The finalist and the control on 64 matched seeds with `--keep-rule`; the verdict recorded                                                                      | [judgement]  | T24        |
| T26 | The switch: defaults, `splitClonalMax`, `clonalDepth` and the clonal gate share deleted, `metrics.md` regenerated, a new season, re-pins; or the branch parked | [judgement]  | T25        |
| T27 | Conformance review of Phase 4, in parallel with `scripts/check.sh`; status line moved                                                                          | [judgement]  | T26        |

### Phase 5 - A call changes the bite

| #   | Task                                                                                                          | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T28 | `world.alarmSeen` in `alarm`, `alarmBiteShare` in `applyBite`; tests                                          | [mechanical] | T27        |
| T29 | The grid `evals/screens/honest-alarm.grid.json`, the prediction and the 16-seed screen; the finalist named    | [judgement]  | T28        |
| T30 | The finalist and the control on 64 matched seeds with `--keep-rule`; the liar check on calls without a threat | [judgement]  | T29        |
| T31 | The switch: the default and a new season, re-pins; or the branch parked                                       | [mechanical] | T30        |
| T32 | Conformance review of Phase 5, in parallel with `scripts/check.sh`; status line moved                         | [judgement]  | T31        |

## Verification

1. `scripts/check.sh` is green at each switch.
2. Each phase's grid, screen reports, keep-rule output and E-record are under `evals/decisions/` and
   `evals/screens/results/`, with the prediction committed before the run.
3. After Phase 1, `eval.density_starve_slope` is above 0 on the default and the population stops below `maxAgents`
   on most seeds.
4. After Phase 2, no code path calls `addEnergy` with `ENERGY_SOURCE.KILL`, and a carcass never holds more than the
   body it came from.
5. After Phase 3, a body resting against a rock for 1000 ticks in a test world loses only its metabolism.
6. After each switch, the season clip shows the phase's scene: a forager leaving an empty disc, a late scavenger
   finding less, a prey resting in a ring, a thin basin keeping a family, a caller and a silent neighbour.
