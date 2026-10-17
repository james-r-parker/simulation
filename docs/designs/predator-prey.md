# Predator and prey

**Status:** In progress - Phases 1 and 2 built: scent, calls, smoke, jaws and the tuned economy in the sim core (E19, E20), and the five combat metrics with the hunter, fleer and spammer controllers (T17 figures in sim-notes); Phase 3 (fitnessV2 on the D1 to D8 intent counters, niches and map-elites-v2) is next after world-balance.md Phase 1.
**Validated:** 830e60a (2026-10-17)
**Priority:** 2 - Phase 3 (`fitnessV2`) is built on the intent counters of world-balance.md Phase 1; tuning nights and the trainer build on it
**Depends on:** [headless-sim-core.md](headless-sim-core.md), [evolution-evals.md](evolution-evals.md), [evolution-rework.md](evolution-rework.md), [body-temperature.md](body-temperature.md)

Hunters follow and kill prey; prey flee, raise alarms and hide in smoke. Nothing here scripts a behaviour: the sim core
supplies senses, actions and costs, and evolution finds the use.

- Agents sense the danger, attack and hunt pheromone grids with two antennae, and hear alarm and hunt calls.
- An agent can call an alarm, call a hunt, or release a smoke cloud that blocks rays. Each costs energy.
- Only specialisations with `canHunt` bite. Catching is retuned: a hunter lands bites more easily and sprints faster,
  and prey turn tighter.
- Phase 1 builds the rules in `js/sim/`. Phase 2 measures them with five metrics and four scripted controllers.
  Phase 3 adds selection pressure: capped fitness terms, a hunter-versus-evader archive descriptor and the
  `map-elites-v2` policy.
- Drawing clouds, calls and scent belongs to [worker-and-renderer.md](worker-and-renderer.md).

The brain layout changes, so every saved genome, archive and champion from the earlier layout is rejected by the
existing layout checks (`assertGenomeFits`, `validateChampion` and the archive codec).

## Modules

| Module                                       | Exports                                                        | Does                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `js/sim/brain-layout.js`                     | `OUTPUT_COUNT`, `OUTPUT_INDEX`, `RAY_CHANNELS`, `EXTRA_INPUTS` | Layout constants; every other module imports its layout constants from here (changed)                                     |
| `js/sim/scent-inputs.js`                     | `writeScentInputs`                                             | Body inputs at offsets 19 to 31: antenna samples, hunt scent and heard calls                                              |
| `js/sim/calls.js`                            | `signalAll`                                                    | The `signal` phase: timers, alarm and hunt calls, smoke releases, then hearing                                            |
| `js/sim/smoke.js`                            | `releaseSmoke`, `ageSmoke`                                     | The preallocated cloud pool                                                                                               |
| `js/sim/ray-march.js`                        | `castRays`                                                     | Imports `RAY_CHANNELS` from `brain-layout.js` and drops its own export; adds `testClouds` and the smoke channel (changed) |
| `js/sim/feeding.js`                          | `feed`                                                         | `BITE_OUTPUT` becomes `OUTPUT_INDEX.BITE`; bite size by specialisation; `prevBiter` bookkeeping (changed)                 |
| `js/sim/physics.js`                          | `actAll`, `integrate`                                          | `THRUST_OUT`, `TURN_OUT`, `SPRINT_OUT` become `OUTPUT_INDEX`; turn and sprint by specialisation (changed)                 |
| `js/sim/energy.js`, `js/sim/reproduction.js` | `applyCosts`, `mate`                                           | `SPRINT_OUT` and `MATE_OUT` become `OUTPUT_INDEX` (changed)                                                               |
| `js/sim/body-inputs.js`                      | `writeBodyInputs`                                              | `rayCount * 8` becomes `rayCount * RAY_CHANNELS`; the "nineteen body inputs" comment follows the new count (changed)      |
| `js/evo/observer-combat.js`                  | `createCombatCounters`, `observeCombat`                        | Bite episodes, hunter agent-ticks, call and smoke follow-ups                                                              |
| `js/evo/metrics-combat.js`                   | `combatMetrics`                                                | The five metrics below                                                                                                    |
| `js/evo/scripted-combat.js`                  | `COMBAT_CONTROLLERS`                                           | `hunter`, `fleer`, `alarmSpammer`, `smokeSpammer`, merged into `SCRIPTED_CONTROLLERS`                                     |
| `js/evo/descriptors.js`                      | `descriptorV1`, `descriptorV2`                                 | Archive cell coordinates from the life and intent counters                                                                |
| `js/evo/fitness.js`                          | `fitnessV2`, `FITNESS_V2`, `createFitnessV2`                   | Deliberate intake, capped credits and waste charges from the intent counters (changed)                                    |
| `js/evo/policies/map-elites-v2.js`           | `createMapElitesV2`                                            | `map-elites-v1q` with `fitnessV2` and `descriptorV2`                                                                      |

## Brain layout

`brainLayout(config)` gives `inputCount = rayCount x RAY_CHANNELS + EXTRA_INPUTS` and `OUTPUT_COUNT` outputs.

| Constant       | Before | After |
| -------------- | ------ | ----- |
| `RAY_CHANNELS` | 8      | 9     |
| `EXTRA_INPUTS` | 19     | 32    |
| `OUTPUT_COUNT` | 5      | 8     |

At the defaults (`rayCount` 16, `brainHidden` 32) `inputCount` goes from 147 to 176 and `weightCount` from 5925 to 6952.

**Ray channels.** Channel 0 is proximity, 1 food, 2 bigger, 3 smaller, 4 similar, 5 kin, 6 wall, 7 obstacle, and the
new 8 smoke.

**Body inputs** (offset `rayCount x RAY_CHANNELS`). Offsets 0 to 18 are unchanged (offsets 15 to 18 are the temperature inputs of [body-temperature.md](body-temperature.md)); offsets 19 to 31 are new.

| Offset | Input         | Value                                                            |
| ------ | ------------- | ---------------------------------------------------------------- |
| 19     | `dangerLeft`  | `samplePheromone` of `world.danger` at the left antenna          |
| 20     | `dangerRight` | The same at the right antenna                                    |
| 21     | `attackLeft`  | `samplePheromone` of `world.attack` at the left antenna          |
| 22     | `attackRight` | The same at the right antenna                                    |
| 23     | `huntHere`    | `samplePheromone` of `world.hunt` at the agent                   |
| 24     | `huntLeft`    | `samplePheromone` of `world.hunt` at the left antenna            |
| 25     | `huntRight`   | The same at the right antenna                                    |
| 26     | `alarmLoud`   | Loudest heard alarm, 0 to 1                                      |
| 27     | `alarmAhead`  | Direction of that alarm along the heading, -1 to 1; 0 when none  |
| 28     | `alarmSide`   | Direction of that alarm across the heading, -1 to 1; 0 when none |
| 29     | `huntLoud`    | Loudest heard hunt call, 0 to 1                                  |
| 30     | `huntAhead`   | As `alarmAhead`, for the hunt call                               |
| 31     | `huntSide`    | As `alarmSide`, for the hunt call                                |

**Antennae.** The left antenna is at `(x, y) + antennaReach x (cos(a + antennaAngle), sin(a + antennaAngle))` and the
right at `a - antennaAngle`, where `a` is the heading; a positive `turnRate` turns towards the left. The offsets use
`detCos` and `detSin` of the heading and a table of `antennaAngle`'s `detCos` and `detSin` built in `allocateWorld`
(like `rayCos`), so nothing is allocated per tick. `samplePheromone` clamps a point to the grid.

**Outputs.** `OUTPUT_INDEX` names them; an action fires when its output is above 0, like sprint and bite.

| Index | Name     | Action                |
| ----- | -------- | --------------------- |
| 0     | `THRUST` | Unchanged             |
| 1     | `TURN`   | Unchanged             |
| 2     | `SPRINT` | Unchanged             |
| 3     | `MATE`   | Unchanged             |
| 4     | `BITE`   | Unchanged             |
| 5     | `ALARM`  | Call an alarm         |
| 6     | `SMOKE`  | Release a smoke cloud |
| 7     | `HUNT`   | Call a hunt           |

`physics.js` (`THRUST_OUT`, `TURN_OUT`, `SPRINT_OUT`), `energy.js` (`SPRINT_OUT`), `feeding.js` (`BITE_OUTPUT`) and
`reproduction.js` (`MATE_OUT`) import `OUTPUT_INDEX` in place of their private indices. `ray-march.js` imports
`RAY_CHANNELS` and no longer exports it; `body-inputs.js` uses it in place of `rayCount * 8`. `js/evo/scripted.js`,
`observer-tick.js` and `life-counters.js` import `RAY_CHANNELS` and `OUTPUT_COUNT` in place of their private `8` and
`5`.

## Rules

### Scent

- `world.hunt` is a third pheromone grid, `Float32Array`, the size of `danger`, hashed after `attack`.
  `updatePheromones` decays and diffuses it with the same `pheromoneDecay` and `pheromoneDiffusion`; deposits use
  `depositPheromone` and `pheromoneDeposit`.
- A bite already deposits on `attack` at the biter and `danger` at the victim. An alarm deposits on `danger` at the
  caller; a hunt call deposits on `hunt` at the caller.

### Calls

`signalAll` runs in the new `signal` phase between `brain` and `physics`, in this order:

1. For each alive slot ascending, `alarmTimer`, `huntTimer` and `smokeTimer` each decrease by 1 while above 0.
2. For each alive slot ascending, each action fires when its output is above 0, its timer is 0 and the agent's energy
   exceeds its cost:
    - **Alarm**: only when the specialisation lacks `canHunt`. Pays `alarmCost` with `removeEnergy` (cause `cost`),
      sets `alarmTimer` to `callTicks`, deposits on `danger` at the agent and pushes `AlarmCalled`.
    - **Hunt call**: only when the specialisation has `canHunt`. Pays `huntCallCost`, sets `huntTimer` to
      `callTicks`, deposits on `hunt` and pushes `PackCalled`.
    - **Smoke**: any specialisation, when its output is above `smokeThreshold` (0.8). Sets `smokeTimer` to `smokeCooldown`. When `cloudCount < maxClouds` it pays
      `smokeCost`, calls `releaseSmoke` and pushes `SmokeReleased`; with a full pool nothing is paid and
      `SmokeRefused` is pushed.
3. `heard` is zeroed. For each alive slot ascending whose `alarmTimer` is above 0, every other alive agent within
   `callRadius` (found with `cellRange` over the tick's hash) takes loudness
   `(1 - d / callRadius) x alarmTimer / callTicks` when that exceeds the loudness already stored for it, so ties keep
   the lower caller slot. Its `heard` row holds the loudness and the world-frame unit vector from the hearer to the
   caller (0, 0 at distance 0). The same pass runs for `huntTimer`. A newborn is not in the hash, so its `heard` row is zero until the next
   `signal` phase.

`heard` is a `Float32Array` of 6 floats per slot: alarm loudness, `ux`, `uy`, hunt loudness, `ux`, `uy`.
`writeScentInputs` rotates the unit vector into the hearer's frame: ahead is `ux x cH + uy x sH` and side is
`-ux x sH + uy x cH`, with `cH` and `sH` the heading's `detCos` and `detSin`.

A call lasts `callTicks`, and the agent cannot call that kind again until its timer is 0, so each kind fires at most
once per `callTicks`. Smoke does not block sound.

### Smoke

- The pool is `cloudX`, `cloudY` (`Float32Array`) and `cloudTtl` (`Uint16Array`) of `maxClouds` entries, plus the
  scalar `cloudCount`. Live clouds occupy indices `0 .. cloudCount - 1`.
- `releaseSmoke(world, slot)` appends a cloud of radius `smokeRadius` and `cloudTtl` `smokeTicks` centred
  `size + smokeRadius` behind the agent along its heading, clamped to the world. The agent stands just outside it.
- `ageSmoke` (in the `field` phase) decreases every `cloudTtl`; a cloud reaching 0 is removed by moving the last live
  cloud into its index, scanning from index 0 upwards.
- `testClouds(world)` in `ray-march.js` returns at once when `cloudCount` is 0; otherwise each ray tests the live
  clouds with `rayCircle` and offers the hit to `consider` with the new kind `SMOKE`, ranked after `WALL`, which matters only at equal distance. A ray that
  starts inside a cloud hits it at distance 0. A smoke hit writes proximity and the smoke flag; the ray sees nothing
  behind it.
- Smoke does not affect contacts, bites, scent or hearing.

### Catching

- A hunter must be bigger than its victim by `huntSizeRatio`, and `size = baseSize + energy / energyToSize`, so it carries more
  energy than its prey.
- `applyBite` keeps three `Uint32Array`s per agent: `lastBiteTick`, `prevBiter` and `prevBiteTick`. On a bite by a
  biter other than `lastBiter` it sets `prevBiter` to the old `lastBiter` and `prevBiteTick` to the old
  `lastBiteTick`; it then sets `lastBiter` to the biter and `lastBiteTick` to the tick. `AgentDied` gains field 11,
  `prevBiter`, when the death is `eaten`, `prevBiter` is not 0 and the tick is at most `packWindow` ticks after
  `prevBiteTick`; otherwise 0. The three arrays are hashed with the agent arrays.
- `huntSizeRatio` is 1.01 (tuned in E20 from 1.05 and then with the jaws from 1.03, with `alarmCost` and `huntCallCost` 0.5, `maxFood` 1600 and
  `foodTargetPerAgent` 12). A hunter bites a victim when `size[biter] > huntSizeRatio x size[victim]`, and the same
  ratio classes a ray hit as bigger, smaller or similar, and bounds the size band of a mating pair in `canMatePair`.
- Jaws: a bite lands only when the victim's centre lies within `biteArc` (radians, half-angle) of the biter's heading:
  `cos(bearing - angle[biter]) >= cos(biteArc)`, with `cos(biteArc)` computed once per tick and the bearing taken from
  the positions already in the contact list. `biteArc` is PI / 4, so a hunter must face its prey and a prey that turns
  across the hunter's path slips past.
- Per-specialisation multipliers are held in `Float64Array` tables built in `allocateWorld` (like `visionBySpec`):
  `biteMultiplier` scales `biteEnergy` in `applyBite`; `turnMultiplier` scales `maxTurn` in `actAll`;
  `sprintBoost` scales `sprintMultiplier` in `actAll` and in the speed cap of `integrate`.
- The predator has `biteMultiplier` 4, `turnMultiplier` 0.7 and `sprintBoost` 1.6; every other specialisation has 1.
  A sprinting predator reaches `maxVelocity x (1 + sprintMultiplier x sprintBoost)` = 14.4 against 12 for a sprinting
  forager, and turns at most 0.14 rad per tick against 0.2. Sprint and speed still cost `sprintCost` and
  `movementCost x speed^2` per tick, which ends a burst.

## World state

Added to the World state table:

| Group   | Arrays (type)                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| Calls   | `alarmTimer`, `huntTimer`, `smokeTimer` (`Uint16`, per agent); `heard` (`Float32`, 6 per agent)                       |
| Bites   | `lastBiteTick`, `prevBiter`, `prevBiteTick` (`Uint32`, per agent)                                                     |
| Smoke   | `cloudX`, `cloudY` (`Float32`), `cloudTtl` (`Uint16`), `maxClouds` entries each                                       |
| Scent   | `hunt` (`Float32`, `cols x rows` like `danger`)                                                                       |
| Scalars | `cloudCount`, appended to the scalar block of `hashWorld`                                                             |
| Tables  | `antennaCos`, `antennaSin` (one entry each), `biteBySpec`, `turnBySpec`, `sprintBySpec` (`Float64Array`; none hashed) |

The agent arrays are listed in `agentSpecs`, so `freeAgent` zeroes them. `hashWorld` hashes the three timers and
`heard` with the agent arrays, and `hunt`, `cloudX`, `cloudY` and `cloudTtl` with the field arrays. `snapshot.js`
gains a cloud section (header word 4 is the cloud count; `snapshotLayout` adds `maxClouds x 3` words; each cloud is `x`, `y`, `cloudTtl / smokeTicks` as
`Float32`). `assertInvariants` gains the invariant `calls`: `cloudCount <= maxClouds`, `cloudTtl` above 0 below
`cloudCount` and 0 from `cloudCount`, timers within `callTicks` and `smokeCooldown`, `heard` loudness within 0 to 1.

## Events

New `EVENT_TYPE` codes appended to `events.js`; fields 2 and up:

| Type            | Code | Fields                                        | Log level |
| --------------- | ---- | --------------------------------------------- | --------- |
| `AlarmCalled`   | 5    | `slot`, `genomeId`, `spec`, `x`, `y`          | debug     |
| `SmokeReleased` | 6    | `slot`, `genomeId`, `spec`, `x`, `y`, `cloud` | debug     |
| `PackCalled`    | 7    | `slot`, `genomeId`, `spec`, `x`, `y`          | debug     |
| `SmokeRefused`  | 8    | `slot`, `genomeId`                            | debug     |

`drainEvents` in `log.js` gains one emitter each. A slot adds at most 3 call, release or refuse events, 1 death and
1 birth to a tick, so `createConfig` requires `eventCapacity >= 6 x maxAgents` (3000 at the defaults, under the
default 4096). The check runs after the weight-float check and throws `eventCapacity: <value> is below 6 x maxAgents (<n>)`.

## Config

New keys in `createConfig`; the Source column names the legacy constant, as `config-defaults.js` does.

| Key                                  | Type   | Default         | Source and rule                                                          |
| ------------------------------------ | ------ | --------------- | ------------------------------------------------------------------------ |
| `antennaAngle`                       | number | 0.8             | new; 0 to `PI`                                                           |
| `antennaReach`                       | number | 150             | new; above 0 (1.5 pheromone cells)                                       |
| `callRadius`                         | number | 300             | from `SHOUT_BASE_RANGE` (200); above 0                                   |
| `callTicks`                          | int    | 60              | `SHOUT_DURATION_FRAMES`; 1 to 65535                                      |
| `alarmCost`                          | number | 0.5             | new; 0 or more; tuned (E20), was 4                                       |
| `huntCallCost`                       | number | 0.5             | new; 0 or more; tuned (E20), was 4                                       |
| `smokeCost`                          | number | 20              | new; 0 or more                                                           |
| `smokeRadius`                        | number | 80              | new; above 0                                                             |
| `smokeTicks`                         | int    | 180             | new; 1 to 65535                                                          |
| `smokeCooldown`                      | int    | 600             | new; 0 to 65535                                                          |
| `smokeThreshold`                     | number | 0.8             | new; 0 to 1                                                              |
| `packWindow`                         | int    | 120             | new; 1 or more                                                           |
| `maxClouds`                          | int    | 32              | new; 0 to 256                                                            |
| `huntSizeRatio`                      | number | 1.01            | from `PREDATOR_SIZE_RATIO_THRESHOLD` (1.1); 1 or more; tuned (E20, jaws) |
| `biteArc`                            | number | PI / 4 (0.7854) | new: half-angle of the forward bite arc; above 0, at most PI             |
| `specialisations.<s>.biteMultiplier` | number | 1               | new; above 0; predator 4                                                 |
| `specialisations.<s>.turnMultiplier` | number | 1               | new; above 0; predator 0.7                                               |
| `specialisations.<s>.sprintBoost`    | number | 1               | from `PREDATOR_ADRENALINE_SPEED_MULT` (1.3); above 0; predator 1.6       |

The three specialisation fields join `SPECIALISATION_FIELDS` in `config-validate.js`, so each specialisation must
carry them. All keys are in `rulesHash`. T8b sets the predator multipliers and
`huntSizeRatio` so the Phase 1 pursuit tests pass, and the table lists the values that land.

## Metrics

Defined in the Metrics table of [evolution-evals.md](evolution-evals.md) (marked as defined by this doc):
`eval.catch_rate`, `eval.escape_rate`, `eval.pack_kill_share`, `eval.alarm_response`, `eval.smoke_escapes`. All are
"higher is better" and computed in `metrics-combat.js` from `observer-combat.js` state. `computeMetrics` merges
them; `validateReport` accepts them accepts them when present, with the usual `null` and `reason` rules. Reports without them stay valid, and `eval:compare` compares only metrics present in both reports, so earlier baselines and experiments are unchanged.

| Counter            | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bite episode       | A bite on an agent without `canHunt`, seen as `bittenTimer === 1` after `step` (as `life-counters.js` does), opens an episode for the victim's `genomeId`; each further bite extends it; it resolves `ESCAPE_TICKS` after the last bite, `escaped` when the victim is alive, otherwise `caught`                                                                                                                                                                                                                                               |
| Hunter agent-ticks | The per-tick count of alive agents whose specialisation has `canHunt`; the denominator of `eval.catch_rate`. A seed with none makes `eval.catch_rate` `null` with reason `no hunters`: the run is reported, not compared                                                                                                                                                                                                                                                                                                                      |
| Pack kill          | An `AgentDied` with cause `eaten` whose `by` (field 5) and `prevBiter` (field 11, non-zero) both name `canHunt` agents of the same `lineageId` (looked up from the observer's `AgentBorn` cache); `eval.pack_kill_share` is their share of `eaten` deaths                                                                                                                                                                                                                                                                                     |
| Alarm follow-up    | On `AlarmCalled` at tick `t`: the speeds at `t` of the hearers (alarm loudness above 0 in `heard`, no `canHunt`) and of controls, which are alive agents without `canHunt` outside `callRadius` whose distance to the nearest `canHunt` agent is in the same 100 px band as the hearer's; then the speeds of the same agents at `t + ALARM_RESPONSE_TICKS`. Only agents alive at both times count. The metric is the mean hearer change minus the mean control change, over `maxVelocity`, averaged over calls. It is a correlational measure |
| Smoke follow-up    | On `SmokeReleased`: whether the releaser was bitten within the last 30 ticks (`bittenTimer` below 30), and whether it is alive `ESCAPE_TICKS` later; releases within `ESCAPE_TICKS` of the run end are excluded                                                                                                                                                                                                                                                                                                                               |

`ESCAPE_TICKS` (300) and `ALARM_RESPONSE_TICKS` (10) are named exports of `observer-combat.js`.

## Scripted controllers

Added to `SCRIPTED_CONTROLLERS` from `scripted-combat.js`; they write all `OUTPUT_COUNT` outputs, zeroing the row first.

| Controller     | Behaviour                                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hunter`       | Turns towards the nearest smaller-class ray hit, thrusts, sprints and bites; with no hit it turns towards the higher of `attackLeft` and `attackRight`; calls a hunt when it first sees prey                                                       |
| `fleer`        | Turns away from the nearest bigger-class ray hit and from the higher of `attackLeft` and `attackRight`, sprints while a bigger agent is in sight, calls an alarm when it first sees one, and releases smoke when its bite-timer input shows a bite |
| `alarmSpammer` | Seeks food and sets the `ALARM` output every tick                                                                                                                                                                                                  |
| `smokeSpammer` | Seeks food and sets the `SMOKE` output every tick                                                                                                                                                                                                  |

`evals/predator-world.json` is `evals/micro-world.json` plus `initialEnergy` 3000 (the micro-world's 800 lets foragers starve
while sprinting before any survives the 300 ticks that count as an escape), with a test policy whose `initSpec` gives the predator
specialisation to even slots and the forager to odd slots; `hunter` runs on the predators and `fleer` on the foragers.

## Fitness v2

`fitnessV2(observer, counters, slot, config)` (`fitnessName` `v2`) pays for deliberate behaviour from the intent
counters of [world-balance.md](world-balance.md) Phase 1 (`observer.intent`), discounts chance intake and charges
waste. With `deliberate = deliberateFood + deliberateBite` and
`intake = deliberate + CHANCE_WEIGHT x (chanceFood + chanceBite)`:

`fitnessV2 = max(0, intake + OFFSPRING x children + gated - IDLE_SIGNAL x idleSignal - UNDEFENDED x undefendedBite)`

`gated` is 0 until `deliberate` reaches `GATE`; from then it is `SURVIVAL_RATE x min(ageTicks, SURVIVAL_CAP)` plus the
specialisation term of `fitnessV1` capped at `intake` (the predator's counts `deliberateKills`, not `kills`) plus the
four credits below, each capped at `CREDIT_CAP x intake`.

| Term             | Value                                                                                                                                                                                                          | Behaviour |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Escape           | `ESCAPE x respondedEscape`: this agent's bite episodes that resolved `escaped` with a response                                                                                                                 | D4        |
| Converged kill   | `CONVERGED_KILL x convergedKills`: `eaten` deaths counted by `eval.pack_convergence` in which this agent is the killer or the previous biter                                                                   | D3        |
| Alarm credit     | `ALARM x alarmCredits`: this agent's precise `AlarmCalled` events after which an agent of its lineage within `callRadius` of the caller is bitten within `packWindow` ticks and the episode resolves `escaped` | D5, D6    |
| Hunt-call credit | `HUNT_CALL x huntCredits`: this agent's precise `PackCalled` events counted as answered by `eval.hunt_call_answer`                                                                                             | D3, D6    |

| Constant        | Value | Constant         | Value |
| --------------- | ----- | ---------------- | ----- |
| `CHANCE_WEIGHT` | 0.25  | `ESCAPE`         | 60    |
| `OFFSPRING`     | 300   | `CONVERGED_KILL` | 50    |
| `GATE`          | 500   | `ALARM`          | 40    |
| `SURVIVAL_RATE` | 0.5   | `HUNT_CALL`      | 40    |
| `SURVIVAL_CAP`  | 30000 | `IDLE_SIGNAL`    | 20    |
| `CREDIT_CAP`    | 0.25  | `UNDEFENDED`     | 40    |

`FITNESS_V2` holds them. `noteIntentDeath` and `noteIntentEvents` in `js/evo/observer-intent-events.js` add four
per-slot counters to the intent counters: `deliberateKills` (`eaten` deaths of a victim with `lastBiteDeliberate` in
which this agent is the killer), `convergedKills`, `alarmCredits` and `huntCredits`. A death whose victim's biter is
gone credits nobody. Unseen bites (`unseenBite`) cost nothing. Grouping (D5) is paid only through the alarm credit.

## Archive niches

`descriptorV1(counters, slot)` returns `[speedMean, crowdingMean]`, the descriptor of
[evolution-rework.md](evolution-rework.md) Phase 2. `descriptorV2` returns `[biteShare, fleeShare]`, each 0 to 1:

- `biteShare = biteEnergy / (foodEnergy + biteEnergy)`, 0 when both are 0.
- `fleeShare`: of the grouping samples (every `GROUP_SAMPLE_TICKS` ticks in `observer-intent.js`) on which the agent
  is threatened (a bigger-class hit at proximity above `THREAT_PROXIMITY`, or `alarmLoud` above 0.2), the share on
  which its speed exceeds `0.5 x maxVelocity`; 0 with no threatened sample. The intent state counts `threatSamples`
  and `fleeSamples` per slot.

`createArchive` takes the descriptor as an option, and the archive JSON stores its name as `descriptor`;
`decodeArchive` throws naming `descriptor` when it differs from the running policy's.

## Live policy

`createMapElitesV2({ config, log, archive? })` is the live policy `map-elites-v1q` (the four-draw cell tournament,
`QUALITY_CELL_DRAWS`) with `fitnessV2` and `descriptorV2`; its `fitnessName` is `v2`. `LIVE_POLICY` becomes
`map-elites-v2` when its comparison with `map-elites-v1q` meets the Phase 3 done criteria.

## Decisions

Choices made while re-planning Phase 3, with their reasons, for the user to review (user, 2026-10-17: "document
choices and reasons within the plans").

| Decision                                                                                     | Reason                                                                                                     | By      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| Fitness pays deliberate intake in full and chance intake at 0.25                             | Chance intake still keeps an agent alive, so it is not worthless, but skill must pay four times as much    | Manager |
| The 500 gate counts deliberate intake only                                                   | A sitter or drifter that eats by contact must not unlock the survival and credit terms (the FIT-8 exploit) | Manager |
| Idle calls and smoke cost 20 each, undefended bites 40, uncapped, fitness floored at 0       | Waste is charged as the user asked; the floor keeps fitness a valid selection weight                       | Manager |
| Unseen bites cost nothing                                                                    | A bite from a hunter the agent never saw is luck (D8 table)                                                | Manager |
| Grouping (D5) is paid only through the alarm credit                                          | A per-agent cohesion term would pay crowding around food, the D5 chance column                             | Manager |
| The predator's specialisation term counts `deliberateKills`                                  | A kill from a jaw-sitting ambush is the D2 chance column                                                   | Manager |
| Done criteria move from the combat metrics to the D metrics, with food and fed lifespan held | The combat metrics count outcomes, which chance also produces; the D metrics count intent                  | Manager |
| `life-counters-combat.js` is dropped; its counters join the intent counters                  | One per-slot store for D1 to D8 serves fitness, descriptors and metrics                                    | Manager |

## Phases

### Phase 1 - Senses, actions and catching in the sim core (built)

**Targets:** bench.step_ms@500, bench.phase_ms.signal@500, eval.predation_per_1k

Layout, rules, events, snapshot, hashing, invariants and config as above. The world changes, so every baseline moves and T10 re-records them. Done when `bench.step_ms@500` is within
`bench-check`'s 15% of the committed `bench/baseline.json`, `bench.phase_ms.signal@500` is recorded in it,
`eval.predation_per_1k` is reported for `baseline-v5` on the new world (a `watch` metric: no verdict), the live policy
`map-elites-v1q` on the new world (`E20`, 16 seeds x 200000 ticks) is `worse` on none of `eval.fed_median_lifespan`,
`eval.food_energy_per_1k` and `eval.births_per_1k` against `evals/experiments/E17-map-elites-v1q.json` (when it is,
the phase stays unbuilt and the user is asked), and
`test/sim/predator-prey.test.js` shows a scripted hunter killing a stationary prey and a sprinting prey escaping a
hunter in the same arena.

**Outcome.** `bench.phase_ms.signal@100`, `@250` and `@500` (0.0315, 0.0898 and 0.2238 ms) are in `bench/baseline.json` and
`bench-check` passes without raising the step entry. `eval.predation_per_1k` is 0.00118 for `baseline-v5` on seeds 1-16
(0.00069 on seeds 17-32) and 0.00086 for `map-elites-v1q` (E17: 0.00023, 3.8x). The calibration `E19` gives no verdict on
any Target. The live policy `E20` is `better` than `E17` on all three: fed lifespan +19.4%, food +120%, births +74%
(population 101 to 270, `born_share` 0.31 to 0.86); off the Targets `floor_episodes` is -74% (better), `lineages_alive`
-59.3%, `lineage_turnover` -44.7% and `coverage` -8.8% (worse). Reading those off-Target verdicts needs care: E19
shows that with a self-sustaining population seed-set variance exceeds the 5% minimum effect for such metrics at 16 seeds.

The first E20 run at the original defaults was `worse` (fed lifespan -17.4%, births -14.5%, `floor_episodes` +44%): alarm
calls at `alarmCost` 4 were spammed. A sweep of 74 four-seed screens chose `alarmCost` and `huntCallCost` 0.5, `maxFood` 1600
(800 had capped `foodTargetPerAgent` x population), `foodTargetPerAgent` 12 and `huntSizeRatio` 1.03, confirmed at seeds
1-16 and 17-32. T8c's jaws (`biteArc` PI / 4) then halved catches, and `huntSizeRatio` 1.01 restored them. The final
defaults are in the Config table; [sim-notes.md](sim-notes.md) has the findings.

### Phase 2 - Combat metrics and scripted controllers (built)

**Targets:** none - instruments only; the new metrics are first recorded for `baseline-v5` and `map-elites-v1q` and Phase 3 moves them

`observer-combat.js`, `metrics-combat.js`, `scripted-combat.js`, `evals/predator-world.json` and the new anti-exploit
cases. Done when both policies' reports carry the five metrics, `hunter` against `fleer` gives `eval.catch_rate`
above 0 and `eval.escape_rate` above 0 on `evals/predator-world.json`, and the spammers stay within the anti-exploit
bound under `fitnessV1`.

### Phase 3 - Fitness terms, niches and the v2 policy

**Targets:** eval.deliberate_food_share, eval.pursuit_kill_share, eval.evasion_skill, eval.idle_signals_per_1k, eval.undefended_bite_share, eval.food_energy_per_1k, eval.fed_median_lifespan

Built after [world-balance.md](world-balance.md) Phase 1, whose intent counters it reads. The four new intent
counters, `fitnessV2`, `descriptors.js`, the archive descriptor option and `map-elites-v2`. Done when `map-elites-v2`
against `map-elites-v1q` at 16 seeds x 200000 ticks (`E21`) is `better` on at least one of
`eval.deliberate_food_share`, `eval.pursuit_kill_share` and `eval.evasion_skill`, `worse` on none of them, `worse` on
neither `eval.idle_signals_per_1k` nor `eval.undefended_bite_share`, and `worse` on neither
`eval.food_energy_per_1k` nor `eval.fed_median_lifespan`; every other metric, including the five combat metrics, is
recorded with its verdict, and the D metrics that `E23` or `E24` moved to `watch` are recorded only. `initSpec`'s least-populated rule keeps hunters present; a
seed with no hunter agent-ticks makes the run invalid, and it is reported, not compared. `fitnessV2` passes the anti-exploit suite with no expected failures.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | The rules, senses, actions, clouds and calls are in `js/sim/`; fitness terms, descriptors, metrics and policies are in `js/evo/` (Modules table). Both stay DOM-free and import only `js/sim/` and `js/evo/`. `STEP_PHASES` gains `signal` between `brain` and `physics`. Drawing clouds, call rings and the hunt scent belongs to [worker-and-renderer.md](worker-and-renderer.md), whose Renderer section and `field` message row name them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unit tests              | `test/sim/brain-layout.test.js` (counts 176 and 6952 at the defaults; `OUTPUT_INDEX` values). `test/sim/config.test.js` (each new key's bound; the specialisation fields required; the `eventCapacity` relation). `test/sim/scent-inputs.test.js` (each input on a hand-built world: antenna points for a rotated heading, clamped at the world edge, direction rotated into the hearer's frame). `test/sim/calls.test.js` (cost and timer for each action; no alarm from `canHunt`; no hunt call from a non-hunter; refused below cost; the loudest and lowest-slot rule; newborns hear nothing; at most one call per `callTicks`). `test/sim/smoke.test.js` (release position, full pool refuses and pushes `SmokeRefused`, removal order, ttl). `test/sim/ray-march.test.js` (a ray stops at a cloud, one starting inside hits at distance 0, rays beside it are unchanged, the smoke flag is channel 8). `test/sim/feeding.test.js` (`prevBiter` and `prevBiteTick` update only on a new biter; field 11 only within `packWindow`) and `physics.test.js` (multipliers of 1 reproduce the old numbers exactly; the predator's values change bite, turn and sprint cap). `test/sim/pheromones.test.js` (`hunt` decays and diffuses; total conserved apart from decay). `test/sim/world-hash.test.js`, `snapshot.test.js`, `invariants.test.js`, `log.test.js` and `events.test.js` for the additions. `test/sim/predator-prey.test.js` (a scripted hunter kills a stationary prey within 120 ticks; a sprinting prey turning away escapes; smoke released behind a fleeing prey cuts the hunter's rays). `test/evo/observer-combat.test.js` and `metrics-combat.test.js` (each metric on a hand-built event sequence, including its `null` cases). `test/evo/scripted.test.js` (the new controllers write valid outputs). `test/evo/anti-exploit.slow.test.js` (spammers, the bait case, `fitnessV2`). `test/evo/observer-intent-events.test.js` (the four new counters, including a death whose biter is gone), `fitness.test.js` (each v2 term and its cap, the 500 gate on deliberate intake only, chance intake at 0.25, the idle and undefended charges, the floor at 0, the predator term on `deliberateKills`), `descriptors.test.js`, `archive.test.js` and `archive-codec.test.js` (the descriptor option; a mismatch is rejected), `policies/map-elites-v2.test.js` |
| Headless e2e            | `test/sim/golden.slow.test.js`: both golden cases (default and `busy`, seed 1, 5000 ticks) are re-pinned in T2 (layout), T8a (signal phase and scent inputs), T8b (predator tuning), T8c (jaws) and the two tuning commits that set the final defaults (economy and call costs, then `huntSizeRatio` 1.01), each in its own commit whose body says why, and no other commit changes a `worldHash`. `npm run browser:hash` reproduces both in Chromium. `eval-smoke` runs `--policy live`. `test/sim/predator-prey.test.js` runs the pursuit scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Performance budget      | `bench.step_ms@500` stays within `bench-check`'s 15% of the committed `bench/baseline.json` (4.03 ms) with the 176-input layout and the smoke ray tests; the baseline's step entry is not raised. `bench.phase_ms.signal@500` is added to the baseline. Smoke clouds come from the preallocated `maxClouds` pool, `testClouds` returns at once with no live cloud, and `scripts/alloc-check.mjs` shows no per-tick allocation with calls and smoke active. `npm run bench -- --policy map-elites-v2` (the `--policy` option arrives with evolution-rework.md Phase 2) stays within 15% of the `map-elites-v1q` figure in Phase 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Evolution metrics       | Phase 1: `eval.predation_per_1k` reported for the re-recorded `baseline-v5`; `baseline-v5`, `baseline-v5-o16` and the calibration (`E19`) are re-recorded, and the calibration again gives no verdict on any Target; the live policy on the new world (`E20`) is `worse` on none of `eval.fed_median_lifespan`, `eval.food_energy_per_1k` and `eval.births_per_1k` against `evals/experiments/E17-map-elites-v1q.json`. Phase 2: the five new metrics recorded for `baseline-v5` and `map-elites-v1q`. Phase 3: `map-elites-v2` against `map-elites-v1q` (`E21`) at 16 seeds x 200000 ticks meets the Phase 3 done criteria above, recorded as an experiment in `evals/experiments.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Determinism             | No new RNG stream: calls, smoke, hearing and catching are pure functions of the world evaluated in slot order, and the observer, metrics and descriptors draw nothing. The `hashWorld` stream list is unchanged. A run replays bit-exact from seed, config and policy; `worldHash` covers the new arrays and `cloudCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Config and persistence  | The keys in the Config table, all in `rulesHash`. `test/sim/config-contract.test.js` and `test/sim/config-validate.test.js` move their weight-float limit cases (2^24) and the `maxAgents` 198, `rayCount` 64, `brainHidden` 128 case to the new layout counts, and test the `eventCapacity` check and its order after the weight-float check. `brainLayout` changes, so `rulesHash` and `layout` change: a genome, archive or champion written before is rejected by `assertGenomeFits`, `validateChampion` and the archive codec with the field named; no champion file exists yet. The archive JSON gains `descriptor`. No IndexedDB change: the browser store belongs to [worker-and-renderer.md](worker-and-renderer.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Logging and diagnostics | `AlarmCalled`, `SmokeReleased`, `PackCalled` (debug) and `SmokeRefused` (debug), with the fields in the Events table, through `drainEvents`; `assertInvariants` throws the `calls` invariant with tick, slot and value; `createArchive` or `decodeArchive` throws naming `descriptor` on a mismatch. Reproduce a chase with `npm run replay -- --seed <s> --ticks <t> --level debug --follow <genomeId>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Browser compatibility   | N/A - `js/sim/` and `js/evo/` are DOM-free and run unchanged in the worker; Chromium bit-exactness is checked by `npm run browser:hash`; drawing is [worker-and-renderer.md](worker-and-renderer.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Docs                    | [headless-sim-core-contracts.md](headless-sim-core-contracts.md) (World layout arrays, Events, Rays, Feeding, Motion and body inputs, Food zones and pheromones, `snapshot.js`) and [headless-sim-core.md](headless-sim-core.md) (phase list, config table); [evolution-evals.md](evolution-evals.md) Metrics table (rows added with this doc) and anti-exploit table; [evolution-rework.md](evolution-rework.md) Phase 3 names this doc; [worker-and-renderer.md](worker-and-renderer.md) draws the new state; the `run-evolution-loop` skill names `map-elites-v2` as an arm; [sim-notes.md](sim-notes.md) learnings per phase. This doc becomes `Implemented` when Phase 3 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Verification            | `scripts/check.sh` green; each phase's `bench` or `eval:compare` output attached to its PR; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Task breakdown

### Phase 1 - Senses, actions and catching in the sim core (built)

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Nature       | Depends on                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------- |
| T1  | Add the Config keys and the three specialisation fields (neutral values: multipliers 1, `huntSizeRatio` unchanged) to `config-defaults.js` and `config-validate.js`, with the `eventCapacity >= 6 x maxAgents` check (after the weight-float check); update the boundary cases in `test/sim/config-contract.test.js` and `test/sim/config-validate.test.js`                                                                                                                                                                                                                                                                                                                                                                                                                    | [mechanical] | -                                                       |
| T2  | Change `brain-layout.js` (`OUTPUT_INDEX`, `RAY_CHANNELS`, `EXTRA_INPUTS`, `OUTPUT_COUNT`); allocate the new arrays and tables in `allocateWorld`; hash them; extend `updatePheromones`, `snapshot.js`, `assertInvariants`, the event codes and `drainEvents`; move every hard-coded layout constant to `brain-layout.js` (`ray-march.js` `RAY_CHANNELS`, `body-inputs.js` `rayCount * 8` and its comment, `feeding.js` `BITE_OUTPUT`, `physics.js` and `energy.js` `THRUST_OUT`/`TURN_OUT`/`SPRINT_OUT`, `reproduction.js` `MATE_OUT`, and the `js/evo` copies); add `prevBiter` bookkeeping and `AgentDied` field 11; update the weight-float boundary cases in `test/sim/config-contract.test.js` and `config-validate.test.js` to the new counts; re-pin both golden hashes | [judgement]  | T1                                                      |
| T3  | Add `smoke.js`, `testClouds` and the smoke ray channel in `ray-march.js`, with tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [judgement]  | T2                                                      |
| T4  | Add `calls.js` with `signalAll` (timers, calls, hearing), with tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [judgement]  | T2, T3                                                  |
| T5  | Add `scent-inputs.js` with `writeScentInputs`, with tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [judgement]  | T2                                                      |
| T6  | Apply the specialisation tables in `applyBite`, `actAll` and `integrate`, with tests that multipliers of 1 change nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [mechanical] | T2                                                      |
| T7  | Write `test/sim/predator-prey.test.js` with hand-written chase and flee brains (`overrides.brain`) and its scenario helper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [judgement]  | T8a                                                     |
| T8a | Add `signal` to `STEP_PHASES`, `writeScentInputs` to `senseAll` and `ageSmoke` to `field` with the default tunables; re-pin both golden hashes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [judgement]  | T4, T5, T6                                              |
| T8b | Set the predator multipliers and `huntSizeRatio` 1.05 so the T7 tests pass; update the Config table; re-pin both golden hashes; run `npm run browser:hash`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [judgement]  | T7                                                      |
| T8c | Add `biteArc` to `config-defaults.js` and `config-validate.js` and the forward-arc test to `bites` in `js/sim/feeding.js`, with tests (a bite from behind and from the side outside the arc misses, inside it lands, `biteArc` PI restores any-direction contact) and the T7 pursuit tests still passing; re-pin both golden hashes; run `npm run browser:hash`                                                                                                                                                                                                                                                                                                                                                                                                                | [judgement]  | T8b                                                     |
| T9  | Run `npm run bench` and `scripts/alloc-check.mjs`; add `bench.phase_ms.signal` to `bench/baseline.json`; confirm `bench-check` passes without raising the step entry; when `bench.step_ms@500` exceeds the limit, profile and optimise (no baseline change)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [mechanical] | T8c                                                     |
| T10 | Re-record `baseline-v5` and `baseline-v5-o16`, rerun the calibration as `E19`, record `eval.predation_per_1k`, and run the live policy against `E17`'s report as `E20`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [mechanical] | T8c                                                     |
| T11 | Update [headless-sim-core-contracts.md](headless-sim-core-contracts.md), [headless-sim-core.md](headless-sim-core.md) and [sim-notes.md](sim-notes.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [mechanical] | T8b                                                     |
| T12 | Conformance review of Phase 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8a, T8b, T8c, T9, T10, T11 |

### Phase 2 - Combat metrics and scripted controllers (built)

| #   | Task                                                                                                                    | Nature       | Depends on              |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| T13 | Add `observer-combat.js` and wire it into `observe`, with tests                                                         | [judgement]  | T12                     |
| T14 | Add `metrics-combat.js`, merge it in `computeMetrics`, let `validateReport` accept the metrics when present, with tests | [judgement]  | T13                     |
| T15 | Add `scripted-combat.js` and merge `COMBAT_CONTROLLERS` into `SCRIPTED_CONTROLLERS`, with tests                         | [judgement]  | T12                     |
| T16 | Add `evals/predator-world.json` and the anti-exploit cases for the spammers, `hunter` and `fleer` under `fitnessV1`     | [judgement]  | T14, T15                |
| T17 | Run `baseline-v5` and `map-elites-v1q` for the new metrics and record the figures in [sim-notes.md](sim-notes.md)       | [mechanical] | T14                     |
| T18 | Conformance review of Phase 2                                                                                           | [judgement]  | T13, T14, T15, T16, T17 |

### Phase 3 - Fitness terms, niches and the v2 policy

| #   | Task                                                                                                                                                                                                                                                                                                                                                 | Nature       | Depends on                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------- |
| T19 | Add `deliberateKills`, `convergedKills`, `alarmCredits`, `huntCredits`, `threatSamples` and `fleeSamples` to the intent counters in `observer-intent.js` and `observer-intent-events.js`, with tests                                                                                                                                                 | [judgement]  | T18                               |
| T20 | Add `fitnessV2`, `FITNESS_V2` and `createFitnessV2` to `fitness.js`, with tests                                                                                                                                                                                                                                                                      | [judgement]  | T19                               |
| T21 | Add `descriptors.js`, the `descriptor` option of `createArchive` and the `descriptor` field of the archive JSON, with tests                                                                                                                                                                                                                          | [judgement]  | T19                               |
| T22 | Add `policies/map-elites-v2.js` and register it, with tests                                                                                                                                                                                                                                                                                          | [judgement]  | T20, T21                          |
| T23 | Add `fitnessV2` to the anti-exploit suite with no expected failures, the bait case (a controller that seeks bites, then flees) under both fitness functions, and the pair bounds under `fitnessV2` in `evals/predator-world.json`: `jawSitter` and `huntCallSpammer` at most 0.5 x `hunter`, `alarmSpammer` and `smokeSpammer` at most 0.5 x `fleer` | [judgement]  | T16, T20                          |
| T24 | Run `map-elites-v2` against `map-elites-v1q` at 16 seeds x 200000 ticks, record `E21`, run `npm run bench -- --policy map-elites-v2`, and set `LIVE_POLICY` when the verdicts hold                                                                                                                                                                   | [mechanical] | T22, T23                          |
| T25 | Update the `run-evolution-loop` skill, the world-balance.md Decisions table and [sim-notes.md](sim-notes.md)                                                                                                                                                                                                                                         | [mechanical] | T24                               |
| T26 | Conformance review of Phase 3                                                                                                                                                                                                                                                                                                                        | [judgement]  | T19, T20, T21, T22, T23, T24, T25 |

## Verification

1. `scripts/check.sh` is green, including `bench-check`, `eval-smoke` and the golden test, and
   `test/evo/anti-exploit.slow.test.js` passes with no expected failures for `fitnessV1` and `fitnessV2`.
2. `npm run browser:hash` prints both re-pinned golden hashes from a Chromium worker.
3. `npx vitest run test/sim/predator-prey.test.js` passes: the hunter catches the stationary prey, the sprinting
   prey escapes and smoke cuts the hunter's rays.
4. `npm run bench` shows `bench.step_ms@500` within 15% of `bench/baseline.json`, and `scripts/alloc-check.mjs`
   reports no per-tick allocation.
5. `npm run replay -- --seed 1 --ticks 20000 --level debug` with `--policy map-elites-v2` logs `AlarmCalled`,
   `PackCalled` or `SmokeReleased` events.
6. `npm run eval:compare -- <map-elites-v1q.json> <map-elites-v2.json>` meets the Phase 3 done criteria.
7. Loading an archive file written before the layout change stops with a layout mismatch naming `inputCount`.
8. Manual browser walk: none - drawing clouds, calls and scent is verified in worker-and-renderer.md.
