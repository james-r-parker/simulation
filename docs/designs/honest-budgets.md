# Honest budgets

**Status:** In progress - Phase 1 (patch stock pays for plant food) and Phase 2 (the kill is the body) and Phase 4 (the edge breeds) built in season 10; Phase 3 (impacts, not contact) is parked on E176; Phase 5 (a call changes the bite) is parked on E178; Phase 6 is in progress: its diagnostics (T33 to T33b) are built, the screen (T35) and the 64-seed keep rule (T36) are recorded (E179), and on 2026-11-16 the user adopted `killGorgeShare` 0.4 as a narrow T37 (season 10, unreleased) despite the unmet Done-when row; the T39 screen of the juvenile, territory and split-energy levers (E189, 2026-11-18) names no finalist and T36a is not run; the E190 diagnosis found hunters die of strikes at nothing, and T40 (E192, a diagnosis; the strike-price screen was withdrawn as a rescue) found the cause is a birth reflex that never silences `BITE` and clones that copy it, so T41 proposes a silent bite at birth.
**Validated:** 390acd9a (2026-11-18)
**Priority:** 3 - the 128-seed read of [review-2026-11-11.md](../review-2026-11-11.md): most seeds boom to the cap and fall under 40 while food never runs short, so every scene that needs a standing prey population is tuned on top of the crash; food, the kill and the rocks come before any skill, refuge or call work
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

### Phase 1 - Patch stock pays for plant food (built)

**Targets:** eval.density_starve_slope, eval.patch_leave_depleted, eval.chance_food_energy_per_1k, eval.deliberate_food_share

| Rule                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foodPatchCapacity` (83000) is the full stock of a patch in energy, and every reader that takes stock as a share of `foodPatchCapacity` (`stepPatchLife`, `ageBank`, `pollination.js`, `flora-state.js`, `snapshot.js`, `scene-patch.js`) keeps that reading                                                                       |
| `world.patchReserved` (per patch) holds the energy of the patch's standing items, by `foodPatch`; `js/sim/patch-reserve.js` keeps it (`reserveItem`, `releaseItem`, `spendItem`, `canPay`, `livePatchOf`)                                                                                                                          |
| `spawnFloraItem` in `js/sim/flora-spawn.js` takes the patch and its species from `patchSource` and `pickPatch`, then refuses the attempt, before `placeInDisc`, when `patchStock - patchReserved` minus the item's energy falls under the floor (`PATCH_FLOOR_SHARE` x capacity); a placed item adds its energy to `patchReserved` |
| A plant meal (`consumeFood`, and a herd's in `js/sim/herd-graze.js`) takes the eaten energy from its item's patch stock and reservation through `eatFromPatch` (`js/sim/food-patches.js`)                                                                                                                                          |
| A plant item that rots (`ageFood`) or is removed returns its energy to its patch's reservation; the stock keeps it                                                                                                                                                                                                                 |
| `regrowPatches` keeps its logistic form and floor; a patch grazed to the floor for `patchDieTicks` dies into its seed bank as today, and sprouts at `seedStock` x capacity                                                                                                                                                         |
| `areaExpected` in `js/sim/food.js` has no season scarcity: the attempt count is a ceiling, and the season acts through `patchRegrowFactor` (`winterRegrow` 0.2, summer 1.5)                                                                                                                                                        |
| `foodBackgroundShare` is 0.02; `maxFood`, `maxAgents` and `fillFloor` stay as guards                                                                                                                                                                                                                                               |

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

As built, E174 met neither Done-when row: no arm put the slope above 0. The keep rule read no harm, so `y1-b2` was
adopted as a realistic mechanism; the slope target carries to Phases 2 to 5.

#### Chunks

| Chunk | Tasks    | Contents                                                  |
| ----- | -------- | --------------------------------------------------------- |
| A     | T1 to T3 | The energy stock, its tests and the grid (code, unmerged) |
| B     | T4, T5   | The 16-seed screen and the 64-seed keep-rule pass (runs)  |
| C     | T6, T7   | The switch and the conformance review                     |

### Phase 2 - The kill is the body (built)

**Targets:** eval.hunter_income_share.carcass, eval.hunter_catches_per_1k, eval.hunter_zero_kill_carcass_share

| Rule                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `killShare` (share, 0 is today's kill at an empty store): a bite in `applyBite` is fatal when it leaves the victim at or under `killShare` x its maximum energy. The killer then takes the victim's remaining energy up to `killGorgeCap` and its own headroom (`transferEnergy`), and the rest is removed from the victim as `LOSS_CAUSE.BITE` and held for its carcass, so the victim's store is 0 |
| `fatal`, `noteFatalBiteObservation`, `noteBiteLedger` and the rest timer use that condition; the predator's `REWARD_SOURCE.KILL` counts the energy moved                                                                                                                                                                                                                                             |
| `predatorKillEnergy` is 0 in every non-control arm and deleted at the switch: a fatal bite mints nothing                                                                                                                                                                                                                                                                                             |
| `leaveCarcass` stores `carcassShare` x the energy the body held at death: on a kill, the remainder the killer did not take; on a starvation or collision death, about 0; on old age, the store. Like plant food, the carcass enters the ledger when eaten, and the death books the same energy out                                                                                                   |
| A blob carcass's value falls linearly from its stored value to 0 over `carcassFadeTicks`, which replaces `carcassTicks` (`ageFood`, `consumeFood`, `snapshot.js`, `scene-carcass.js`); a meal takes the value at that tick. Herd carcasses keep their own life                                                                                                                                       |
| The `foodEnergy` and `biteEnergy` counters stay as ledgers and price nothing                                                                                                                                                                                                                                                                                                                         |
| `carcassBody` (boolean, default false) switched the carcass rule and the fade on in the arms of the table below, with `predatorKillEnergy` 0; the switch (T13) made the body the default and deleted `carcassBody`, `predatorKillEnergy` and `carcassTicks`                                                                                                                                          |

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

As built, E175 met Done-when: `body-k25r` is the default (`killShare` 0.25, `killGorgeCap` 2000, `carcassFadeTicks` 1500,
predator `passiveLossMultiplier` 0.2). On 64 matched seeds the keep rule read no guard `WORSE`: `eval.hunter_income_share.carcass`
fell 0.479 to 0.008, `eval.hunter_income_share.kill` rose 0.092 to 0.254, `eval.hunter_catches_per_1k` rose 0.389 to 1.347 and
`eval.hunter_zero_kill_carcass_share` fell 0.108 to 0.084 (the interval includes 0). Hunters stay alive on 46 of 64 seeds
against 53, which the guard does not call harm; juvenile hunter deaths rose (`eval.hunter_juvenile_death_share` 0.52 to
0.76) and the next balance pass watches hunter recruitment.

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

### Phase 4 - The edge breeds, and splits carry the gene (built)

**Targets:** eval.edge_starve_per_prey, eval.childshare_by_condition

| Rule                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No clonal cap (in the grid, `splitClonalMax` 1000000, out of reach): `mateScarce` alone gates a split in `splitKeysAllow`, so the tick a mate is in reach the next birth has to be a mating. At the switch `splitClonalMax`, `clonalDepth`, `noteClonalBirth` and the clonal gate share (`scene-edge-gates.js`, `metric-registry/world-3.js`) were deleted |
| `splitGiftGene` (boolean, off): `giftOf` gave `childShareOf` for a split as for a mating when on, half when off; the switch made the gene the rule and deleted the flag                                                                                                                                                                                    |
| `birthReserve` (energy, 0 is off; 300 at the switch): `giveBirth` blocks a birth that would leave the mother under `birthReserve`                                                                                                                                                                                                                          |

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

E177 ([results](../../evals/decisions/E177/results.md)): the 16-seed screen named `nocap-g-r` (edge starvation 0.107
against 0.112, `eval.childshare_by_condition` above 0, fewer seeds under the specialisation cap). On 64 matched seeds
the keep rule reads no harm: no guard `WORSE` (alive 18 harmed against 12 recovered, under80 4 against 3, held 7 against
2, `eval.hunter_catches_per_1k` -0.028 [-0.102, 0.045]; smallest losses detected 25, 12 and 10 seeds and 0.073), and
`eval.childshare_by_condition` rises to 0.0005. The Done-when row is met, so T26 made the switch: `birthReserve` 300 is the default, a split always gives the `childShare` gene's share, and `splitClonalMax`, `splitGiftGene`, `clonalDepth` and `eval.edge_split_blocked_share.clonal` are deleted (season 10's `rulesHash` moved in place to `e280f7fe28ab36fa`; `docs/designs/metrics.md` regenerated). Open, for the next
balance pass: hunters alive at the last tick fall from about 46 to 40 of 64 seeds (a net loss the alive guard cannot see under 25 seeds), hunter births are 92% splits and juvenile hunter deaths rise (0.76 to 0.86).

### Phase 5 - A call changes the bite (parked)

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

E178 ([results](../../evals/decisions/E178/results.md)): the 16-seed screen names no finalist. `eval.alarm_rate` is above 0 on 4 of 16 seeds and `a75` and `a50` are bit-identical to `control` on every metric: no bite lands on a seen caller while its timer runs, so the bite share never acts. The liar clause is not triggered. T30 is not run and T31 is parked: `alarmBiteShare` stays 1 and the code and tests stay. Open: calls are too rare for a bite rule to matter; selection must first produce calls on sight.

#### Chunks

| Chunk | Tasks    | Contents                                 |
| ----- | -------- | ---------------------------------------- |
| M     | T28      | The seen call, the bite share, tests     |
| N     | T29, T30 | The screen and the keep-rule pass (runs) |
| O     | T31, T32 | The switch and the conformance review    |

### Phase 6 - Predator recruitment and juvenile survival

**Targets:** eval.hunter_juvenile_death_share, eval.hunter_catches_per_1k, eval.hunter_income_share.carcass, eval.boom_bust_count

In E175 (`carcassBody`, `killGorgeCap` 2000), predators moved onto kills, but `eval.hunter_juvenile_death_share` rose from 0.52 to 0.76 and median predator headcount fell from 10 to 1. Four structural bottlenecks suppress predator recruitment even when hunting brains exist:

- Newborn predators (`size` ~26) cannot clear `huntSizeRatio` 0.8 against full-grown foragers (`size` ~31 to 33), `plantFoodValue` is 0, `provisionEnabled` was deleted in E138 (before E175 removed free carcasses), and `killGorgeCap` 2000 lets a killer swallow a whole prey body and leave no carcass.
- `territoryAllows` (`territoryRadius` 600, `territoryMax` 1) blocks breeding whenever mature hunters cluster in a prey patch, directly conflicting with `kinPullWeight` 0.5 and **Pack, or loner**—and blocking recovery when the few surviving hunters on a map share one patch.
- `predator.splitMinEnergyMultiplier` 0.6 (`540` energy, 5.4% of `maxEnergy` 10,000) lets a predator split a `~270`-energy child that burns through its birth gift in a few `biteCost` 8 / `recoilEnergy` 20 contacts.
- `specMutationRate` 0.02 spawns predator-labelled children carrying forager hidden weights (`applyBirthReflex` seeds only the skip block), and `eval.boom_bust_count` reads 0 on 101 of 128 seeds despite population crashes.

| Rule                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix `eval.boom_bust_count` to detect total-population troughs alongside hunter troughs so boom-and-bust dynamics are readable                                                                     |
| Leave real carcasses after kills: cap the immediate kill gorge as a share of the victim's energy (`killGorgeShare`, or lower `killGorgeCap`) so juveniles and scavengers find food                |
| Juvenile ontogenetic diet or size parity: screen `juvenilePlantShare` (a small `plantFoodValue` while `ageTicks < juvenileTicks`) vs lowering `huntSizeRatio` / raising predator `baseSize`       |
| Relax `territoryAllows` (`territoryMax` / `territoryRadius` arms) and raise `predator.splitMinEnergyMultiplier` (e.g. `0.8`–`1.0`) so surviving hunters in a patch can breed and fund viable cubs |
| Stop `specMutationRate` from seeding forager hidden weights into predators (`specMutationRate` 0 for `canHunt` flips, or keep `specMutationRate` 0 during hunter balance screens)                 |

| Done when                                                                                                                                               | Stop when                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `eval.hunter_juvenile_death_share` falls below 0.55, predators stay alive on at least 48 of 64 seeds, and `keepRule` on 64 seeds reads no guard `WORSE` | Every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE` |

#### Recruitment evidence before adoption

T33a follows newborn cohorts through maturity, first deliberate kill, first birth and a reproducing child. Reports separate split, mating and specialisation-flip births, and separate local extinction from global extinction. Living juveniles at the run boundary are censored, not counted as survivors or deaths. Report denominators, time to starvation, territory-blocked eligible births and net chase energy, including failed chases. These are observer diagnostics, never fitness rewards.

T33b audits `leaveCarcass` in [carcass.js](../../js/sim/carcass.js): a full food pool currently leaves no carcass. Fixtures cover a full pool, simultaneous deaths, zero-value bodies and the last free slot; report lost carcass energy separately from decay and consumption. Only measured material loss opens a bounded carcass-capacity experiment, with explicit energy accounting and no free replacement food.

#### As built: the recruitment diagnostics (T33a, T33b)

Observer state only, outside `worldHash`; no fitness term and no sim behaviour changed. `js/evo/scene-recruit.js` follows the
hunters born after burn-in by genome id (never by slot, which the sim reuses) and reports `eval.recruit_cohort`,
`eval.recruit_matured_hunters`, `eval.recruit_censored_share`, `eval.recruit_matured_share`,
`eval.recruit_first_kill_share`, `eval.recruit_lineage_share` (a hunter child that itself bred),
`eval.recruit_replaced_share.<source>` (mate-hunter-parent, split-hunter-parent, spec-flip, floor; an immigrant counts with
the floor), `eval.hunter_starve_age_median`, `eval.hunter_lineage_extinctions` (a lineage loses its last hunter while hunters
of another lineage live) and `eval.hunter_global_extinctions` (`LastHunterDied`). A hunter alive and under `maturityTicks`
at the last tick is censored and counted in neither the survivors nor the deaths. `js/evo/scene-recruit-budget.js` reports
`eval.chase_net_energy` and `eval.chase_failed_energy` (the hunter's energy change from the tick a chase opened to the tick it
resolved, failed chases included) and `eval.hunter_territory_blocked_share` (of the mature, rested, not-pregnant hunters
above their split energy at a 1000-tick checkpoint, the share `territoryAllows` refuses). Founders are not in the cohort;
labelling them apart from descendants under a no-floor run is T36a. Baseline and detector power are in
[sim-notes.md](sim-notes.md) (2026-11-16, the recruitment diagnostics).

T33b: `leaveCarcass` now books `world.carcassLoss` (energy placed, energy lost, bodies lost), outside `worldHash` and the
snapshot, and `js/evo/scene-carcass-loss.js` reports `eval.carcass_loss_share.<lost|eaten|faded>` and
`eval.carcass_lost_per_1k` from burn-in. The loss is **not material** on the defaults: on seeds 1 to 16 at 100000 ticks the
lost share of the carcass energy offered is 0.040 on average and 0.001 at the median, above 0.10 on 2 of 16 seeds (0.377 and
0.107). The rule written before the read: material means a lost share of at least 0.10 on at least 4 of 16 seeds. So no
bounded carcass-capacity arm is specified; most carcass energy (0.71 on average) fades before anyone eats it, which is a
different lever (`carcassFadeTicks`, scavenger reach), left to the carcass work in [world-balance.md](world-balance.md).

**Result (E179, [results](../../evals/decisions/E179/results.md)).** The 16-seed screen falsified the three named finalists
(`recruit`, `cub-plant`, `cub-size`): their shared `specFlipNoHunt` leaves no hunter alive on any seed. `killGorgeShare` 0.4
alone (`gorge`) is the finalist, and on 64 matched seeds (65 to 128) the keep rule reads no harm (alive 13 harmed and 14
recovered, smallest loss detected 28 seeds). It makes carcasses real food (`eval.hunter_income_share.carcass` 0.005 to
0.152, carcass energy eaten 0.16 to 0.57) but leaves `eval.hunter_juvenile_death_share` at 0.86 and hunters alive on
41 of 64, so the Done-when row is not met. The recommendation (adopt the one lever, keep Phase 6 open for the juvenile and
territory levers, or park) went to the user, who adopted the narrow switch on 2026-11-16 (below); T36a is not run.

**Adopted (user, 2026-11-16): `killGorgeShare` 0.4 only.** The user read the recommendation in the E179 results and adopted
the one lever as a narrow T37, with Phase 6 kept open. The Done-when row (`eval.hunter_juvenile_death_share` below 0.55,
hunters alive on 48 of 64) is not met and stays the Phase 6 bar; the adoption rests on the keep rule ("A realistic mechanism
stays", [principles.md](../principles.md)) and on the scavenge scene (`eval.hunter_income_share.carcass` 0.005 to 0.152).
`killGorgeShare` stays a config key (no flag to delete; it is a share, not a switch). Season 10 is unreleased, so its
`rulesHash` moves in place to `38be2908ad820c86`; the goldens, the busy effect stream and the five WASM fixtures were
re-pinned in their own commit. T36a (no-rescue, held-out confirmation with lever ablations) is **not run** for this
adoption: it exists to confirm a recruitment finalist, and this lever does not claim to fix recruitment (the juvenile death
share does not move), so there is nothing for it to confirm; it is owed by whatever finalist T39 names. T39 is the next step:
a new recruitment screen without `specFlipNoHunt`, on the new defaults. The shared baseline was re-recorded on the 0.4 defaults as E188 (`evals/power/defaults-floor-on-E188.json`, `npm run baseline:status` current at 390acd9a), so T39 writes its prediction against it without a re-record. The T38 review of this narrow adoption was run on the PR.

**Result (E189, [results](../../evals/decisions/E189/results.md)): T39 names no finalist.** The 16-seed screen without
`specFlipNoHunt` on the 0.4 defaults (`evals/screens/honest-recruit-2.grid.json`; one lever per arm) leaves
`eval.hunter_juvenile_death_share` at 0.78 to 0.86 (control 0.864, lowest `cub-plant` 0.776, bar 0.55) and hunters alive at
the end on 11 of 16 seeds for the control against 12 (`split`), 10 (`territory`), 9 (`cub-plant`), 7 (`cub-size`) and 6
(`recruit-all`). The keep rule reads no harm on every arm (its `alive` guard sees only a loss of 8 to 10 seeds), so no arm is
falsified outright, but none gets near the Done-when row, and the arms that lower the juvenile death share most hold the
fewest hunters. T36a has nothing to confirm. Recommendation, for the user to read: park the recruitment levers (they stay
config keys) and diagnose how juveniles die (`--level debug` replays of the control and `cub-plant`) before any further lever.

**Diagnosis (E190, [results](../../evals/decisions/E190/results.md)): the 0.86 is a hunter lifespan, drained by strikes at nothing.**
`eval.hunter_juvenile_death_share` is the share of hunter deaths under `juvenileTicks` (3000), not newborns dying before
`maturityTicks`; only 15% of control hunters reach 3000 ticks (seeds 1 to 6, 100000 ticks, `node scripts/juvenile-deaths.mjs`,
built for this) and their deaths spread evenly over the window, so a lever on a cub's first hundred ticks (E189) cannot move
it. Juvenile hunters hold `BITE` on 70% of ticks and on 61% have no body in their jaws; strike misses are 48% and recoil on
kin 42% of a juvenile's bite cost, and 45% of juvenile deaths have no income at all, starving at about 390 ticks from about 720
birth energy with the bite cost at 57% of it. A lead, one run per seed: `strikeMissCost` 0 gives 0.63 and 40% of hunters
reaching 3000 ticks, `cub-plant` 0.74 and 27%. Nothing is deleted: `strikeMissCost` and `recoilEnergy` are realistic costs and
stay keys. The strike-price screen this pointed to (T40 as first written: `strikeMissCost` 0.5, 0.25 and 0.25 with
`recoilEnergy` 10) was **withdrawn by the user on 2026-11-18 as a rescue**: under Selection rules 1, 4 and 6 a hunter that
bites at nothing should starve and its genes die out, so cheapening the miss keeps a failed behaviour alive. `strikeMissCost` stays 1.

**Diagnosis (E192, [results](../../evals/decisions/E192/results.md)): blind biting is never refilled, it never leaves.**
12 control seeds, 100000 ticks, a tracker on every hunter every tick (`node scripts/blind-biters.mjs`, built for this): 2254
hunters born after burn-in are 94.5% split clones, 5.0% spec-flips and 0.4% matings, with no floor or immigrant hunter, so no
outside source refills the map. A clone's blind share follows its mother's (correlation 0.47) and the share of ticks it strikes
with no prey in view rises from parent to child (0.26 to 0.35) and with hunter generation depth (0.25 to 0.37, confounded by
birth tick); selection removes only the worst fifth by that share (parent share 0.33 against 0.68, reach 3000 ticks 0.11 against
0.28) and is flat across the other four. The cause is the birth reflex: `applyInstinct` silences the `ALARM`, `HUNT` and `SMOKE`
biases and leaves `BITE` at 0, so 75% of hunters hold it on 72% of ticks and strike at air on 33%, against 61% and 21% for the 11%
born with a negative bias, and mutation moves that bias and the prey-to-`BITE` skip weight by 0.006 a birth. Natural analogue:
a predator's strike is released by a target (a toad's innate releasing mechanism, cubs led to a kill and trained on play prey);
the sim opens the jaws by default and leaves selection to close them. T41 proposes the lever that removes that default.

T36a confirms recruitment with floor/reseeding disabled and initial founders labelled separately, on held-out seeds for at least two full seasons and two descendant generations where present. An extinct run remains a failure, not a censored success. Compare the finalist, control and single-lever ablations; preserve the existing 64-seed keep rule. A hunter that lives longer without replacing itself does not establish a sustainable lineage. Record clips of a first kill, a surviving family and an unsuccessful chase abandoned; absent scenes remain open findings.

#### Chunks

| Chunk | Tasks                  | Contents                                                    |
| ----- | ---------------------- | ----------------------------------------------------------- |
| P     | T33 to T35, T33a, T33b | `eval.boom_bust_count` fix, gorge share and juvenile screen |
| Q     | T36 to T38, T36a       | 64-seed keep-rule pass, switch and conformance review       |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | All in `js/sim/`, `js/evo/` readers and `wasm/src/`. Phase 1: `spawnFloraItem` and `patchSource` (`js/sim/flora-spawn.js`), `createPatches`, `eatFromPatch` and `regrowPatches` (`js/sim/food-patches.js`), `js/sim/patch-reserve.js`, `areaExpected` and `ageFood` (`js/sim/food.js`), `consumeFood` (`js/sim/feeding.js`), `js/sim/herd-graze.js`, `world.patchReserved` (`js/sim/world.js`); at the switch `foodScarcity` leaves `config.seasons`, `SEASON_KEYS` in `js/sim/config-validate.js` and `scripts/lib/food-ratio.mjs`. Phase 2: `applyBite` (`js/sim/feeding.js`), `leaveCarcass` (`js/sim/carcass.js`), `ageFood`, `consumeFood`, `js/sim/snapshot.js`, `js/evo/scene-carcass.js`. Phase 3: `wallAxis`, `bounceObstacles` and `integrate` (`js/sim/physics.js`), `bounce_rocks` (`wasm/src/physics.rs`) and `bounceRocksKernel` (`js/sim/wasm-physics.js`). Phase 4: `splitKeysAllow` and `noteClonalBirth` (`js/sim/split-gate.js`), `giftOf` and `giveBirth` (`js/sim/reproduction.js`), `js/evo/scene-edge-gates.js`, `js/evo/metric-registry/world-3.js`. Phase 5: `alarm` (`js/sim/calls.js`), `applyBite`. No new module unless a file passes 300 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit tests              | Phase 1 `test/sim/patch-reserve.test.js`, `test/sim/patch-reserve-spawn.test.js` and `test/sim/patch-reserve.slow.test.js`: a placed patch item reserves its energy; an attempt the free stock cannot pay above the floor is refused before placement; a meal takes the eaten energy from the item's patch; a rotted item returns its reservation and leaves the stock; an unvisited patch stays full; the area food rate is the same in every season. Phase 2 `test/sim/kill-body.test.js` and `test/sim/carcass.test.js`: no energy is minted on a kill; a bite that leaves the victim under `killShare` kills it with a store of 0; the killer's take stops at `killGorgeCap` and its headroom; the carcass holds `carcassShare` of the remainder; a starved body leaves none; the value fades linearly to 0 at `carcassFadeTicks`; the energy ledger balances across a kill. Phase 3 `test/sim/physics-impact.test.js` and new `#[test]` cases in `wasm/src/physics.rs`: a hit under the deadband costs nothing; a body resting against a rock pays nothing across 100 ticks; damage scales with the speed into the surface; JS and WASM speeds agree. Phase 4 `test/sim/split-gate.test.js` and `test/sim/reproduction.test.js`: a line with four splits behind it splits while no mate is in reach; a split's gift is the gene's share; a birth under the reserve is blocked. Phase 5 `test/sim/calls-seen.test.js` and `test/sim/feeding-alarm.test.js`: a call with a threat on the rays is seen, one without is not; a bite on a seen caller moves `alarmBiteShare` of the energy, on an unseen caller or a silent prey the full bite |
| Headless e2e            | `test/sim/golden.json` (default, busy, disease) and `BUSY_EFFECT_HASH` in `test/worker/sim-host.slow.test.js` are re-pinned in each phase's switch task, in their own commit, with the five WASM fixtures where the physics changes (Phase 3) and `npm run browser:hash`; `eval-smoke` passes on each branch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin of `bench/baseline.json`. Phase 1 adds one comparison per patch spawn and one subtraction per plant meal or rotted item; Phase 2 one multiply per meat meal; Phase 3 one product per impact; Phases 4 and 5 one comparison per birth, call or bite. No per-tick allocation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Evolution metrics       | Each phase: a 16-seed screen of its grid (`npm run screen`, 400000 ticks, floor on), then the finalist against the control on 64 matched seeds with `npm run eval:compare -- <control> <finalist> --keep-rule`; the phase's Targets by `eval:compare` at their registry seed counts; the record in `evals/decisions/E<n>/` and `evals/experiments.json` with the prediction written before the run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Determinism             | No new RNG stream. Phase 1 refuses an attempt after the `patchSource` and `pickPatch` draws and before `placeInDisc`, so in the energy model the `food` stream draws fewer floats; replay from seed and config holds. Phases 2 to 5 draw nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Config and persistence  | New keys with rules in `js/sim/config-rules.js`: `patchStockEnergy` (boolean, with its `scripts/flag-ledger.json` entry naming T6), `killShare` (share in [0, 1)), `killGorgeCap` (number, above 0), `carcassFadeTicks` (integer, at least 1), `impactDeadband` (number, at least 0), `impactDamage` (number, at least 0), `birthReserve` (number, at least 0), `alarmBiteShare` (share in [0, 1]). Deleted at each switch: `patchStockEnergy`, `foodPatchDepletion` and `foodScarcity` (Phase 1); `predatorKillEnergy` and `carcassTicks` (Phase 2); `obstacleDamage` and `wallDamage` (Phase 3); `splitClonalMax` and `splitGiftGene` (Phase 4). Each switch is a breaking commit with a new season in `library/seasons.json`, or the open season's `rulesHash` moved while it is unreleased; saved genomes and the brain layout are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Logging and diagnostics | No new sim log event. A failure reads as a keep-rule guard `WORSE` or a Target unchanged; `npm run replay -- --seed <n> --ticks 400000 --config <arm.json> --level debug` reproduces a seed with its births, deaths, kills and patch deaths (`PatchDied`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes (`npm run browser:hash`) cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Docs                    | README.md (the food, carcass, collision, birth and alarm rows), `docs/designs/sim-notes.md` (a learning per phase), [world-balance.md](world-balance.md) (the carcass and collision rows it describes), [seasonal-movement.md](seasonal-movement.md) (its `foodScarcity` text and the `foodBackgroundShare` and `maxFood` arms of its Phase 2, at the Phase 1 switch), `docs/designs/metrics.md` regenerated when a detector is added, deleted or moves trust. This doc becomes `Implemented` once Phase 5 is built or falsified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Verification            | `scripts/check.sh` green under the CPU lock at each switch; each phase's Done criteria table; a clip of the season with one of its scenes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

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
| T23 | The grid `evals/screens/honest-edge.grid.json` and the E-record prediction                                                                                     | [mechanical] | T22        |
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

### Phase 6 - Predator recruitment and juvenile survival

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Nature       | Depends on      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| T33  | Fix `eval.boom_bust_count` to scan total-population troughs alongside hunter troughs; tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T32             |
| T33a | Add cohort recruitment and failed-chase budget diagnostics with seeded observer tests (censoring, slot reuse and birth-source attribution); record baseline and detector power in sim-notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T33             |
| T33b | Audit food-pool carcass loss with full-pool fixtures and an energy-loss report; specify a bounded capacity arm only if the loss is material                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T33a            |
| T34  | Add `killGorgeShare` (leaving a real carcass), `territoryMax`/`territoryRadius`/`splitMinEnergyMultiplier` arms and the juvenile diet / `huntSizeRatio` / `childSpec` arms; tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [judgement]  | T33             |
| T35  | Write `evals/screens/honest-recruit.grid.json`, the E-record prediction and run the 16-seed screen; name the finalist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | [judgement]  | T34, T33a, T33b |
| T36  | Run the finalist against the control on 64 matched seeds with `--keep-rule`; record the verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [mechanical] | T35             |
| T36a | Run held-out, no-rescue recruitment confirmation and lever ablations; report descendant replacement, seasonal failure and replayable scene clips before adoption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | [judgement]  | T36             |
| T37  | The switch: adopt the winning defaults, delete replaced keys/switches, open a new season, re-pin goldens; or park the branch (built for `killGorgeShare` 0.4 only, 2026-11-16, season 10 in place)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [mechanical] | T36a            |
| T38  | Conformance review of Phase 6, in parallel with `scripts/check.sh`; move the Status line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | [judgement]  | T37             |
| T39  | Screen the juvenile, territory and split-energy levers again on the `killGorgeShare` 0.4 defaults, without `specFlipNoHunt` (it empties the hunters' world); then T36a on a finalist T39 waits for the user's go-ahead (2026-11-16). Built 2026-11-18 (E189): no finalist, T36a not owed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [judgement]  | T37             |
| T40  | Diagnose where blind-biting hunters come from, with no sim change (E192, built; the strike-price screen first written here was withdrawn by the user as a rescue, Selection rules 1, 4 and 6): a per-tick tracker and a `scripts/blind-biters.mjs` report over 12 control seeds. Finding: no outside refill (94.5% split clones), selection removes only the worst fifth, `applyInstinct` never silences `BITE`. Nature: a strike is released by a target, not open by default                                                                                                                                                                                                                                                                                                                                                                                                                                 | [judgement]  | T39             |
| T41  | Screen `hunterBiteBias` (new numeric key in [-4, 0], default 0: a hunter's `BITE` output bias at birth is `hunterBiteBias` x `instinctWeight`, written in `applyInstinct` and `applyBirthReflex`, so a prey in view still releases the jaws through the +2 prey skip weight): arms 0 (control), -0.5, -1 and -2, 16 seeds, 400000 ticks, no `specFlipNoHunt`; prediction written first in the E-record (`eval.strike_miss_energy_ratio`, `eval.bite_idle` and `eval.hunter_juvenile_death_share` fall below 0.70, hunters alive on at least 11 of 16, `eval.hunter_catches_per_1k` and `held` not WORSE; falsified when every arm reads catches or `held` WORSE, a bite that never opens); a finalist then runs 64 matched seeds (65 to 128) with `--keep-rule`, then T36a on it; a new key moves `rulesHash`, so a season branch if adopted. Serves Parent spends, Boom and bust and A real chase (the abort) | [judgement]  | T40             |

## Verification

1. `scripts/check.sh` is green at each switch.
2. Each phase's grid, screen reports, keep-rule output and E-record are under `evals/decisions/` and
   `evals/screens/results/`, with the prediction committed before the run.
3. After Phase 1, the patch stock balances: each patch's `patchReserved` equals the energy of its standing items
   (`test/sim/patch-reserve.slow.test.js`). After Phase 5, `eval.density_starve_slope` is above 0 on the default and
   the population stops below `maxAgents` on most seeds.
4. After Phase 2, no code path calls `addEnergy` with `ENERGY_SOURCE.KILL`, and a carcass never holds more than the
   body it came from.
5. After Phase 3, a body resting against a rock for 1000 ticks in a test world loses only its metabolism.
6. After each switch, the season clip shows the phase's scene: a forager leaving an empty disc, a late scavenger
   finding less, a prey resting in a ring, a thin basin keeping a family, a caller and a silent neighbour.
