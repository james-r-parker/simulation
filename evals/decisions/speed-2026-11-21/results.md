# Speed 2026-11-21 - where today's step time went

Profiles of the bench world behind the speed tasks of [status-effects.md](../../../docs/designs/status-effects.md) Phase 5 and
[body-genes.md](../../../docs/designs/body-genes.md) Phase 7, scheduled by [throughput.md](../../../docs/designs/throughput.md)
"Order". No sim code changed.

- Trees: `day` ab0b1833 (before PR 583), `pre` 4e56979d (body-genes Phase 1 in, before the effect registry), `main`
  e2660086 (PR 600 and the body-genes lane readers in), `p2` cbf8d981 (`feat/status-effects-p2`, PR 613, before its builder's
  trims). `git archive` copies with `node_modules` linked; origin/main moved to b2aaa46c (PRs 609, 610) during the run and one
  profile of it matched `main` within noise.
- World: the bench's world (`createConfig` defaults, 500 agents held fixed, `cloneWithNoisePolicy`), 500 warm-up ticks,
  3000 step ticks, then 1000 ticks of the bench's phase pass, under `node --cpu-prof --cpu-prof-interval 200`. Three runs a
  tree (two at `worldWidth` 7680), the trees run side by side so each round shares the machine's load.
- The machine was busy (load 21 on 32 cores): read the microseconds below as relative. They are self time a tick from the
  profile, inflated by the profiler and the load; the shares and the before/after ratios are what carry. A script folded
  each sample's self time into its function and into the nearest `STEP_PHASES` frame of `js/sim/step.js`.

## The phases (default world, profile microseconds a tick)

| Phase                   | day   | pre   | main  | p2    | main / pre | p2 / main |
| ----------------------- | ----- | ----- | ----- | ----- | ---------- | --------- |
| lifecycle               | 350.4 | 325.5 | 463.0 | 544.7 | +42%       | +18%      |
| - of it in `effect*.js` | 0     | 0     | 111.3 | 189.1 |            |           |
| physics                 | 429.7 | 417.5 | 486.1 | 562.7 | +16%       | +16%      |
| - of it in `effect*.js` | 0     | 0     | 94.9  | 167.7 |            |           |
| signal                  | 46.7  | 46.3  | 49.7  | 68.0  | +7%        | +37%      |
| - of it in `effect*.js` | 0     | 0     | 1.2   | 18.2  |            |           |
| effects (`fadeEffects`) | -     | -     | 0.4   | 25.0  |            |           |
| sense                   | 1199  | 1206  | 1207  | 1183  | flat       | flat      |

Outside `effect*.js` lifecycle grew 8% from pre to main (`tryEat`, `tickCost` and `stepTemperature`, which hold the
inlined callers) and physics shrank 6% (`thrustOf` moved its work into `liveOf`). The whole growth of both phases is the
registry. The bench medians of the same runs agree: lifecycle 0.12 to 0.165 to 0.207 ms, physics 0.205 to 0.230 to 0.265 ms.

## The hot functions (default world)

| Function                                          | pre  | main | p2    | share of all samples pre / main / p2 | Why it is slow                                                                                                                                                                                         |
| ------------------------------------------------- | ---- | ---- | ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fold` (effects.js)                               | 0    | 51.1 | 171.2 | 0 / 1.14% / 3.79%                    | a loop over every rule of a lane, each calling `level` then `numberInto`; on p2 `maxThrust` has 13 rules (7 on main) and `passiveLoss` 6 (3), most of them effects at level 0 or numbers at 0          |
| `liveOf` (effects.js, with inlined `level`)       | 0    | 90.7 | 47.7  | 0 / 2.03% / 1.06%                    | `rule.read(world, slot)` is one call site seeing every reader (22 on main, 33 on p2): megamorphic, never inlined, the share passed back through `SHARE[0]`                                             |
| `(anon)` (effects.js)                             | 0    | 0.1  | 55.9  | 0 / 0 / 1.24%                        | the closure `createEffects` builds per stored row to read `effectStacks[row][slot]`: 10 distinct closures on p2, each a megamorphic call, for stacks that are 0 at neutral numbers                     |
| `gateOpen` (effects.js)                           | 0    | 23.2 | 20.3  | 0 / 0.52% / 0.45%                    | the `mate` gate reads 4 effects and the `eat` gate 3 through the same megamorphic `level`, 3.2 gate calls a body a tick (from `writeBodyInputs`, `canEatNow`, the mate and split tests)                |
| `fade` (effects.js)                               | 0    | 0    | 23.1  | 0 / 0 / 0.51%                        | every stored row (10 on p2) walks all `maxAgents` slots each tick though no stack is ever raised at neutral numbers                                                                                    |
| the level readers (effect-levels.js)              | 0    | 69.0 | 83.6  | 0 / 1.54% / 1.85%                    | each reads `world.lanes.<name>[slot]` through two property loads; the five temperature effects read `temperature[slot]` and the band lanes five times over; `juvenile` is read 4.2 times a body a tick |
| `stepTemperature` (temperature.js)                | 3.7  | 1.2  | 34.1  | 0.09% / 0.03% / 0.75%                | p2 reads two new lanes (`temperatureGainMove`, `temperatureLossPassive`) through `liveOf` outside the slot's pinned window, so every temperature level is read again                                   |
| `tickCost` (energy.js)                            | 32.3 | 34.6 | 41.6  | 0.75% / 0.77% / 0.92%                | six `liveOf` lanes in one pinned window; the memo saves 6 of 22 level reads a body a tick                                                                                                              |
| `signalAll` + huddle (calls.js, effect-huddle.js) | 1.7  | 4.3  | 22.1  | -                                    | PR 613's call-hearing bookkeeping and the huddle pass (`countWarmth`, `huddlePass`) at neutral numbers                                                                                                 |
| `numberInto` (effect-refs.js)                     | 0    | 0.2  | 2.7   | -                                    | a branch on the reference kind a rule factor, now out of line on p2                                                                                                                                    |
| `thrustOf` (physics.js)                           | 12.8 | 3.8  | 3.2   | 0.4% / 0.1% / 0.1%                   | its work moved into `liveOf` and `fold` (the `maxThrust` and `maxTurn` lanes)                                                                                                                          |

All `effect*.js` files: 0% of samples before, 5.3% on main, 9.5% on p2.

Not regressions, though they show in a function table: `territoryAllows` reads 0.3 to 29 microseconds a tick from pre to
main, yet it is called 0.32 times a tick on both trees (counted on scratch copies) and the sense phase that holds it is
flat; the samples moved there from `isReadyToMate` (39 to 2), which the profiler attributes to its inlined callee once
`isReadyToMate` calls `gateOpen`. `noteMatesSeen` moves the same way between day and pre.

## Effect-registry calls a body a tick (200 ticks after 300)

| Call                             | main           | p2              |
| -------------------------------- | -------------- | --------------- |
| level reads                      | 21.78          | 33.91           |
| of them answered by the pin memo | 6.03           | 6.03            |
| `juvenile` read                  | 4.17           | 4.17            |
| `gateOpen(MATE)` (4 effects)     | 1.83           | 1.83            |
| `gateOpen(EAT)` (3 effects)      | 1.37           | 1.37            |
| `fold maxThrust`                 | 0.93 (7 rules) | 0.93 (13 rules) |
| `fold passiveLoss`               | 0.93 (3 rules) | 0.93 (6 rules)  |
| effects, stored rows, rules      | 22, 0, 22      | 33, 10, 41      |

## Body-genes (the lane readers, the body sense)

Default world: no phase moved from day to pre (sense 1199 to 1206, lifecycle 350 to 326, physics 430 to 418). New self time
is small: `bodySenseOf` 28 microseconds a tick (0.65% of samples) and `temperatureInputs` 4.5 to 14.4, which now reads six
per-slot lane arrays in place of five config numbers.

Wide world (`worldWidth` 7680, `worldHeight` 4320), two runs a tree:

| Phase / function            | day    | pre    | main   |
| --------------------------- | ------ | ------ | ------ |
| sense                       | 1379.0 | 1472.7 | 1617.2 |
| - `writeRay` (ray-march.js) | 117.8  | 193.0  | 216.0  |
| - `agentChannel`            | 15.1   | 48.4   | 47.5   |
| - `writeBodyInputs`         | 34.4   | 41.8   | 49.1   |
| signal                      | 60.2   | 66.7   | 60.6   |
| merit                       | 102.8  | 105.4  | 110.7  |
| field                       | 184.8  | 196.4  | 202.1  |

The sense phase grows 7% at w7680 from day to pre: `writeRay` zeroes three body lanes on every ray and calls `bodySenseOf`
(a `detTanh`, two square roots and a division) on every agent hit, re-reading the caster's size and velocity per ray. The
signal, merit and field rows are within this machine's noise. This is the CI phase red of PRs 585 and 596.

## What it means

1. The registry's cost is the dispatch, not the arithmetic: 22 to 34 level reads a body a tick through one megamorphic
   call site, then a second loop over rules most of which are at level 0 or carry numbers at 0. The fixes are structural
   (status-effects.md Phase 5): read stored stacks by row, drop the rules that are neutral at the current config, dispatch
   levels through a switch the compiler can inline, read each slot's levels once for a group of lanes.
2. PR 613's increment is mostly rules and rows at neutral numbers (`fold` +120, the stacks closures +56, `fade` +23,
   `stepTemperature` +33, huddle and hearing +18): the neutral-rule skip and the per-row live count remove it without
   touching the numbers.
3. Not proposed for the WASM kernel: the readers touch about twenty per-slot arrays and the config; the JS fixes reach the
   target first. The body sense is the exception (body-genes.md T53, Rust by Opus), since the sense kernel already holds
   the hit.
