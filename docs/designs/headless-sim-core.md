# Headless sim core

**Status:** Implemented - the deterministic sim core in `js/sim/` (Phases 1 and 2) and its diagnostics: the sim log, `npm run replay` and opt-in OpenTelemetry (Phase 3).
**Depends on:** [dev-workflow-and-gate.md](dev-workflow-and-gate.md), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)

> Companion: [headless-sim-core-contracts.md](headless-sim-core-contracts.md) fixes the layouts, update orders and edge
> cases every task builds against. Read it before building any task here.

`js/sim/` is the simulation: a deterministic, DOM-free, struct-of-arrays world advanced one fixed tick at a time.
It runs unchanged in Node (tests, bench, evals, trainer, replay) and in a Web Worker ([worker-and-renderer.md](worker-and-renderer.md)).

- Same seed and config give the same `hashWorld` result after any number of ticks in Node and in Chromium. Other
  engines replay statistically, not bit-for-bit.
- A tick is the only unit of time. Nothing in `js/sim/` reads a clock.
- Per-tick code allocates nothing: state, scratch buffers and the contact list are typed arrays sized at
  `createWorld`.
- `js/sim/` imports nothing outside `js/sim/`. Defaults copied from `js/constants/` name their source constant.
- It replaces the legacy defects recorded in [legacy-audit.md](legacy-audit.md) under NN-1 to NN-4, NN-6 to NN-8, IN-1 to IN-8, FIT-4, LIFE-1 to LIFE-5,
  PERF-1 to PERF-7, DET-1 and DET-4.

## Modules

| Module                       | Exports                                                                                                            | Does                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `js/sim/det-math.js`         | `detSin`, `detCos`, `detExp`, `detLog`, `detTanh`                                                                  | Engine-independent transcendental functions from `+ - * /` and `Math.floor` only                                                |
| `js/sim/fnv.js`              | `fnv64Init`, `fnv64Bytes`, `fnv64Hex`                                                                              | 64-bit FNV-1a in two 32-bit lanes                                                                                               |
| `js/sim/rng.js`              | `createRng`, `fork`, `nextFloat`, `nextInt`, `nextGaussian`                                                        | sfc32; `fork(rng, name)` derives an independent stream; Gaussian by Box-Muller on `det-math`                                    |
| `js/sim/config-defaults.js`  | `DEFAULTS`                                                                                                         | The default for every config key                                                                                                |
| `js/sim/config-validate.js`  | `validateConfig`                                                                                                   | The per-key type, range and cross-key rules                                                                                     |
| `js/sim/config.js`           | `createConfig`, `configHash`, `rulesHash`                                                                          | Frozen, validated config from defaults plus overrides; FNV hashes of its canonical JSON                                         |
| `js/sim/world.js`            | `TIMER_CAP`, `allocateWorld`, `allocAgent`, `freeAgent`, `removeFood`                                              | Typed-array state and the event ring; lowest-free-slot allocation; zeroing a freed agent or food slot                           |
| `js/sim/brain-layout.js`     | `OUTPUT_COUNT`, `brainLayout`                                                                                      | Offsets of the blocks in one agent's weight row; shared by config validation, the world and the brain                           |
| `js/sim/spawn.js`            | `createWorld`, `placeClear`, `placeObstacles`, `spawnFoodItem`, `spawnAgent`                                       | `createWorld` over `allocateWorld`; rejection-sampled placement; one food item; one agent with ids, spec, brain and `AgentBorn` |
| `js/sim/spatial-hash.js`     | `createSpatialHash`, `buildHash`, `cellRange`                                                                      | Uniform grid built by counting sort; a circle goes in every cell its bounding box overlaps                                      |
| `js/sim/temperature.js`      | `stepTemperature`, `gainTemperature`, `passiveMultiplier`, `thrustEfficiency`, `blocksMating`, `temperatureInputs` | The body-temperature rules as functions of the world and one temperature value; allocates nothing                               |
| `js/sim/world-hash.js`       | `hashWorld`                                                                                                        | FNV-1a over every world array, as a 16-character hex string                                                                     |
| `js/sim/invariants.js`       | `assertInvariants`                                                                                                 | Throws naming the first broken invariant                                                                                        |
| `js/sim/brain.js`            | `forwardAll`                                                                                                       | Per-agent Elman RNN weights, biases and hidden state; one batched pass                                                          |
| `js/sim/ray-march.js`        | `castRays`                                                                                                         | DDA ray walk over the hash plus direct obstacle tests; nearest hit per ray                                                      |
| `js/sim/body-inputs.js`      | `writeBodyInputs`                                                                                                  | The 19 body-state inputs, four of them temperature                                                                              |
| `js/sim/sensors.js`          | `senseAll`                                                                                                         | Fills `world.inputs` from `castRays`, `writeBodyInputs` and `writeScentInputs`                                                  |
| `js/sim/physics.js`          | `actAll`, `integrate`, `resolveContacts`                                                                           | Outputs to motion; walls and obstacles; agent pairs resolved once into the contact list                                         |
| `js/sim/scent-inputs.js`     | `writeScentInputs`                                                                                                 | The 13 antenna and heard-call inputs (offsets 19 to 31)                                                                         |
| `js/sim/calls.js`            | `signalAll`                                                                                                        | Alarm, hunt and smoke actions with their costs and timers; hearing into `heard`                                                 |
| `js/sim/smoke.js`            | `releaseSmoke`, `ageSmoke`                                                                                         | The smoke cloud pool                                                                                                            |
| `js/sim/kin.js`              | `isKin`                                                                                                            | Whether two agents are parent and child or siblings                                                                             |
| `js/sim/environment.js`      | `seasonAt`, `updateSeason`, `moveObstacles`, `addFertileZone`, `decayFertileZones`                                 | Season phase and modifiers; obstacle motion; fertile zones                                                                      |
| `js/sim/food.js`             | `spawnFood`, `ageFood`                                                                                             | Food spawning and rot                                                                                                           |
| `js/sim/pheromones.js`       | `depositPheromone`, `updatePheromones`, `samplePheromones`                                                         | Two-channel grid field with decay and diffusion                                                                                 |
| `js/sim/events.js`           | `createEventRing`, `pushEvent`, `readEvents`, `clearEvents`, the event type and cause codes                        | Fixed-size ring of typed event records                                                                                          |
| `js/sim/energy.js`           | `addEnergy`, `removeEnergy`, `transferEnergy`, `updateSize`, `LOSS_CAUSE`, `ENERGY_SOURCE`; `applyCosts` (Phase 2) | Per-tick costs, with the temperature step; every energy change, recorded in the ledger                                          |
| `js/sim/feeding.js`          | `feed`                                                                                                             | Eating food and bites, from the contact list; each raises the eater's temperature                                               |
| `js/sim/mate-eligibility.js` | `isReadyToMate`, `readyToMate`, `canMatePair`                                                                      | The mating conditions, including the temperature block; `reproduction.js` and `body-inputs.js` import `isReadyToMate` from it   |
| `js/sim/mate-search.js`      | `findMate`                                                                                                         | The first partner within `mateRange` of one agent that passes `canMatePair` and wins the draw                                   |
| `js/sim/reproduction.js`     | `mate`, `advancePregnancies`, `splitAll`                                                                           | Mating over `findMate`, pregnancies, splits and child placement                                                                 |
| `js/sim/population.js`       | `reap`, `fillFloor`                                                                                                | Deaths and the population floor                                                                                                 |
| `js/sim/spec-params.js`      | `specParams`                                                                                                       | A specialisation's config entry from its index, without allocating                                                              |
| `js/sim/birth-policy.js`     | `cloneWithNoisePolicy`                                                                                             | Reference brain policy: Gaussian init; child = parent weights plus Gaussian noise                                               |
| `js/sim/step.js`             | `step`, `STEP_PHASES`                                                                                              | One tick: the phases below in order; per-phase overrides                                                                        |
| `js/sim/snapshot.js`         | `snapshotLayout`, `createSnapshotViews`, `writeSnapshot`                                                           | Packs render state into a caller-owned `ArrayBuffer`                                                                            |
| `js/sim/log.js` (Phase 3)    | `createSimLog`, `drainEvents`                                                                                      | Structured events to an injected sink, with levels                                                                              |

Every module has `test/sim/<module>.test.js`.

## Numerics

- Allowed `Math` functions in `js/sim/` are the correctly rounded ones: `sqrt`, `floor`, `ceil`, `trunc`, `abs`,
  `min`, `max`, `sign`, `fround`, `imul`. Every other `Math` function, `**` and `Math.hypot` are banned; the `lint`
  gate enforces it with `no-restricted-properties` and `no-restricted-syntax` on `js/sim/`.
- `det-math.js` implements the transcendental functions by range reduction and fixed polynomials, so results depend
  only on IEEE-754 double arithmetic.
- Ray directions come from a table of `rayCount` offset angles' `detSin` and `detCos`, built once, rotated by the
  agent heading's `detSin` and `detCos` each tick.
- Agent arrays that accumulate (`energy`, the ledger) are `Float64Array`; positions, velocities, weights and hidden
  state are `Float32Array`. `angle` is wrapped to `[-pi, pi)` after each update.

## Config

`createConfig(overrides)` deep-merges `overrides` onto `DEFAULTS`, validates every key and returns a frozen object.
An unknown key, a wrong type or an out-of-range value throws an `Error` naming the key, the value and what was
expected. `configHash(config)` is stable across key order. `rulesHash(config)` hashes the same JSON without `seed`,
`maxAgents`, `initialAgents`, `minAgents`, `immigrationInterval` and `checkInvariants`: two configs with equal rules
hashes run the same physics and brains at different population sizes. "new" in Source marks a key with no legacy constant.
The contracts file adds twelve keys (`restitution`, the food-target constants, `fertileZoneRadius`, `temperatureSeasonSlope` and others) and
gives every key's type and range.

| Key                                                            | Default                           | Source                                                                                                            |
| -------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `seed`                                                         | `1`                               | new                                                                                                               |
| `worldWidth`, `worldHeight`                                    | `14400`, `8100`                   | `WORLD_WIDTH`, `WORLD_HEIGHT`                                                                                     |
| `maxAgents`, `initialAgents`, `minAgents`                      | `500`, `100`, `100`               | new (`minAgents` raised from 20 on 2026-10-16, [sim-notes.md](sim-notes.md))                                      |
| `immigrationInterval`                                          | `600`                             | new                                                                                                               |
| `maxFood`, `initialFood`                                       | `1600`, `300`                     | new; `FOOD_SPAWN_CAP` (800); tuned, E20                                                                           |
| `foodSpawnRate`                                                | `0.02`                            | `FOOD_SPAWN_RATE`                                                                                                 |
| `foodEnergy`, `foodEnergyVariance`                             | `100`, `20`                       | `FOOD_ENERGY_NORMAL_BASE` (raised), `FOOD_ENERGY_NORMAL_VARIANCE`                                                 |
| `highFoodChance`, `highFoodEnergy`, `highFoodEnergyVariance`   | `0.1`, `140`, `50`                | `HIGH_VALUE_FOOD_CHANCE`, `FOOD_ENERGY_HIGH_BASE`, `FOOD_ENERGY_HIGH_VARIANCE`                                    |
| `foodRadius`, `highFoodRadius`                                 | `20`, `30`                        | `FOOD_SIZE_NORMAL`, `FOOD_SIZE_HIGH`                                                                              |
| `foodMaxAge`                                                   | `10000`                           | `FOOD_MAX_AGE_BASE`                                                                                               |
| `obstacleCount`, `obstacleMinRadius`, `obstacleMaxRadius`      | `25`, `40`, `120`                 | `OBSTACLE_COUNT`, `OBSTACLE_MIN_RADIUS`, `OBSTACLE_MAX_RADIUS`                                                    |
| `obstacleMaxSpeed`                                             | `0.3`                             | `OBSTACLE_MAX_SPEED`                                                                                              |
| `obstacleDamage`, `wallDamage`                                 | `50`, `50`                        | `OBSTACLE_COLLISION_PENALTY`, `WALL_COLLISION_DAMAGE`                                                             |
| `rayCount`, `brainHidden`                                      | `16`, `32`                        | new                                                                                                               |
| `maxThrust`, `maxTurn`, `maxVelocity`, `damping`               | `0.7`, `0.2`, `8`, `0.95`         | `MAX_THRUST`, `MAX_ROTATION`, `MAX_VELOCITY`, `DAMPENING_FACTOR`                                                  |
| `sprintMultiplier`, `sprintCost`                               | `0.5`, `0.05`                     | `SPRINT_BONUS_MULTIPLIER`, `SPRINT_COST_PER_FRAME`                                                                |
| `initialEnergy`, `maxEnergy`                                   | `800`, `25000`                    | `INITIAL_AGENT_ENERGY`, `MAX_ENERGY`                                                                              |
| `passiveLoss`, `movementCost`, `turnCost`, `sizeEnergyLoss`    | `0.06`, `0.015`, `0.1`, `0.00025` | `PASSIVE_LOSS`, `MOVEMENT_COST_MULTIPLIER` x 0.5, `ROTATION_COST_MULTIPLIER`, `AGENT_SIZE_ENERGY_LOSS_MULTIPLIER` |
| `baseSize`, `minSize`, `energyToSize`                          | `25`, `20`, `250`                 | `BASE_SIZE`, `MIN_AGENT_SIZE`, `ENERGY_TO_SIZE_RATIO`                                                             |
| `biteEnergy`, `huntSizeRatio`                                  | `5`, `1.01`                       | `BITE_SIZE`, `PREDATOR_SIZE_RATIO_THRESHOLD` (1.1); tuned, E20                                                    |
| `biteArc`                                                      | `PI / 4`                          | new; half-angle of the forward bite arc                                                                           |
| `antennaAngle`, `antennaReach`                                 | `0.8`, `150`                      | new                                                                                                               |
| `callRadius`, `callTicks`                                      | `300`, `60`                       | `SHOUT_BASE_RANGE` (200), `SHOUT_DURATION_FRAMES`                                                                 |
| `alarmCost`, `huntCallCost`, `smokeCost`                       | `0.5`, `0.5`, `20`                | new; call costs tuned, E20                                                                                        |
| `smokeRadius`, `smokeTicks`, `smokeCooldown`                   | `80`, `180`, `600`                | new                                                                                                               |
| `smokeThreshold`, `packWindow`, `maxClouds`                    | `0.8`, `120`, `32`                | new                                                                                                               |
| `mateMinEnergy`, `mateCost`                                    | `200`, `15`                       | `MIN_ENERGY_TO_REPRODUCE`, `REPRODUCE_COST_BASE`                                                                  |
| `mateRange`, `childEnergyShare`, `childEnergyMin`              | `100`, `0.5`, `200`               | new                                                                                                               |
| `splitMinEnergy`                                               | `900`                             | `MIN_ENERGY_FOR_SPLITTING` (lowered)                                                                              |
| `maxAgeTicks`                                                  | `36000`                           | new                                                                                                               |
| `reproductionCooldown`, `pregnancyTicks`, `maturityTicks`      | `300`, `480`, `600`               | `REPRODUCTION_COOLDOWN_FRAMES`, `PREGNANCY_DURATION_FRAMES`, `MATURATION_AGE_FRAMES`                              |
| `seasonLength`                                                 | `3600`                            | `SEASON_LENGTH`                                                                                                   |
| `seasons`                                                      | The Seasons table                 | `SEASON_*`, with `temperatureModifier` from `SEASON_*_TEMP_MODIFIER`                                              |
| `temperatureMax`, `temperatureStart`                           | `100`, `50`                       | `TEMPERATURE_MAX` (the minimum, 0, is fixed), `TEMPERATURE_START`                                                 |
| `temperatureGainMove`, `temperatureGainEat`                    | `0.01`, `2`                       | `TEMPERATURE_GAIN_MOVE`, `TEMPERATURE_GAIN_EAT`                                                                   |
| `temperatureLossPassive`, `temperatureSeasonSlope`             | `0.0075`, `0.03`                  | `TEMPERATURE_LOSS_PASSIVE`, new (scales the seasons' `temperatureModifier`)                                       |
| `temperaturePassiveLossFactor`                                 | `2`                               | `TEMPERATURE_PASSIVE_LOSS_FACTOR`                                                                                 |
| `temperatureColdStress`, `temperatureColdModerate`             | `30`, `40`                        | `TEMPERATURE_COLD_STRESS_THRESHOLD`, `TEMPERATURE_COLD_MODERATE_THRESHOLD`                                        |
| `temperatureOptimalMin`, `temperatureOptimalMax`               | `40`, `65`                        | `TEMPERATURE_OPTIMAL_MIN`, `TEMPERATURE_OPTIMAL_MAX`                                                              |
| `temperatureHeatModerate`, `temperatureHeatStress`             | `70`, `85`                        | `TEMPERATURE_HEAT_MODERATE_THRESHOLD`, `TEMPERATURE_HEAT_STRESS_THRESHOLD`                                        |
| `temperatureEfficiencyColdSevere`, `...ColdModerate`           | `0.3`, `0.7`                      | `TEMPERATURE_EFFICIENCY_COLD_SEVERE`, `TEMPERATURE_EFFICIENCY_COLD_MODERATE`                                      |
| `temperatureEfficiencyHeatModerate`, `...HeatSevere`           | `0.9`, `0.6`                      | `TEMPERATURE_EFFICIENCY_HEAT_MODERATE`, `TEMPERATURE_EFFICIENCY_HEAT_SEVERE`                                      |
| `fertileZoneMax`, `fertileZoneSpawnChance`, `fertileZoneDecay` | `100`, `0.4`, `0.001`             | `FERTILE_ZONE_MAX_COUNT`, `FERTILE_ZONE_SPAWN_CHANCE`, `FERTILE_ZONE_DECAY_RATE`                                  |
| `pheromoneCellSize`, `pheromoneDecay`                          | `100`, `0.00167`                  | new, `PHEROMONE_FADE_RATE`                                                                                        |
| `pheromoneDiffusion`, `pheromoneDeposit`, `pheromoneMax`       | `0.05`, `1`, `5`                  | new                                                                                                               |
| `hashCellSize`, `maxContacts`, `eventCapacity`                 | `128`, `2000`, `4096`             | new; `eventCapacity >= 6 x maxAgents`                                                                             |
| `specialisations`                                              | The Specialisations table         | `AGENT_CONFIGS`, `DEFENDER_DAMAGE_REDUCTION`, `SCOUT_ENERGY_COST_MULTIPLIER`; new                                 |
| `checkInvariants`                                              | `false`                           | new                                                                                                               |

| Season (phase quarter) | `foodScarcity` | `energyDrain` | `reproductionBonus` | `temperatureModifier` |
| ---------------------- | -------------- | ------------- | ------------------- | --------------------- |
| Spring (0 - 0.25)      | 1.2            | 1.0           | 1.5                 | -5                    |
| Summer (0.25 - 0.5)    | 1.0            | 1.3           | 1.2                 | 15                    |
| Autumn (0.5 - 0.75)    | 0.8            | 1.1           | 0.7                 | 5                     |
| Winter (0.75 - 1)      | 0.4            | 1.8           | 0.3                 | -15                   |

The season phase is `(tick % seasonLength) / seasonLength`: one `seasonLength` is a full year.

| Specialisation | `visionRange` (`AGENT_CONFIGS` `maxRayDist`) | `canHunt` | Modifier (new unless named)                                    |
| -------------- | -------------------------------------------- | --------- | -------------------------------------------------------------- |
| `forager`      | 300                                          | no        | none                                                           |
| `predator`     | 350                                          | yes       | `biteMultiplier` 4, `turnMultiplier` 0.7, `sprintBoost` 1.6    |
| `reproducer`   | 250                                          | no        | `reproductionCooldown` x 0.5                                   |
| `scout`        | 400                                          | no        | movement and turn costs x 0.7 (`SCOUT_ENERGY_COST_MULTIPLIER`) |
| `defender`     | 350                                          | no        | energy lost to a bite x 0.5 (`DEFENDER_DAMAGE_REDUCTION`)      |

## World state

`createWorld(config, policy)` forks the RNG streams onto `world.rng`, allocates every array once, places
`obstacleCount` obstacles, `initialFood` food and `initialAgents` agents, and gives each agent a brain through
`policy.initBrain`, pushing `AgentBorn` with cause `initial` for each; callers drain the ring before the first `step`. Agent arrays have `maxAgents` slots:

| Array                                                      | Type           | Holds                                                                                                                                         |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `alive`, `spec`                                            | `Uint8Array`   | Slot in use; specialisation index                                                                                                             |
| `x`, `y`, `vx`, `vy`, `angle`, `turnRate`                  | `Float32Array` | Body state                                                                                                                                    |
| `size`                                                     | `Float32Array` | Radius: `max(minSize, baseSize + energy / energyToSize)`                                                                                      |
| `energy`, `foodEnergy`, `biteEnergy`                       | `Float64Array` | Current energy; totals gained from food and from bites                                                                                        |
| `ageTicks`, `cooldown`, `pregnancy`                        | `Uint32Array`  | Ticks alive; ticks until mating or splitting is allowed; ticks left of a pregnancy (0 = none)                                                 |
| `ateTimer`, `bittenTimer`, `lastLoss`                      | `Uint8Array`   | Ticks since eating and since being bitten (capped at 30); cause of the last energy loss                                                       |
| `temperature`                                              | `Float32Array` | Body temperature, 0 to `temperatureMax`; a new agent starts at `temperatureStart`                                                             |
| `genomeId`, `lineageId`, `parentA`, `parentB`, `lastBiter` | `Uint32Array`  | Ids from `world.nextId`; `lineageId` is the founding immigrant's `genomeId`; `lastBiter` is the `genomeId` of the last agent to bite this one |
| `inputs`, `outputs`                                        | `Float32Array` | `maxAgents x inputCount`, `maxAgents x OUTPUT_COUNT`                                                                                          |
| `weights`, `fatherWeights`                                 | `Float32Array` | `maxAgents x weightCount` each: own brain; a pregnant mother's copy of the father's                                                           |
| `fatherId`, `fatherLineage`                                | `Uint32Array`  | A pregnant mother's mate's `genomeId` and `lineageId`                                                                                         |
| `hidden`                                                   | `Float32Array` | `maxAgents x brainHidden`, plus one scratch row                                                                                               |

The world also holds food (`maxFood` slots: `alive`, `x`, `y`, `energy`, `radius`, `age`), obstacles (`x`, `y`, `vx`,
`vy`, `radius`), fertile zones (`fertileZoneMax` slots), the two pheromone grids and a diffusion scratch grid, the
contact list (`Int32Array` of `maxContacts` pairs), the event ring, the energy ledger (`Float64Array`), `population`
and `tick`. `allocAgent` takes the lowest free slot; `freeAgent` zeroes the slot's arrays and returns it.

`policy` holds the brain hooks the core calls:

| Hook                                               | Called                                                                 | Does                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `initSpec?(world, slot, rng)`                      | For an initial, floor or immigrant agent, after its ids are assigned   | Returns the specialisation index; without it `spawn` draws one                                         |
| `initBrain(world, slot, rng)`                      | After `initSpec`                                                       | Writes the slot's `weights` row                                                                        |
| `onMate?(world, mother, father)`                   | When a mating starts a pregnancy, after `fatherWeights` is copied      | Lets the policy keep per-mother state about the father                                                 |
| `childBrain(world, child, mother, { cause, rng })` | At a birth (`cause` `mate` or `split`), after the child's ids and spec | Writes the child's row from the mother's `weights` and `fatherWeights` (both the parent's for a split) |
| `onDeath?(world, slot, cause)`                     | In `reap`, before `freeAgent`                                          | Lets the policy read the dying agent's rows                                                            |

A new agent's slot is allocated, then `genomeId`, `lineageId`, `parentA`, `parentB` and `spec` are set, then the
brain hook runs, then the agent is placed and `AgentBorn` is pushed. `js/evo/` supplies the real policies;
`cloneWithNoisePolicy` is the reference used by tests and the bench.

## Tick

`step(world, config, policy, overrides)` runs `STEP_PHASES`, an array of `{ name, run(world, config, policy) }`, in
order, then increments `tick`. `overrides` maps a phase name to a replacement `run` (the anti-exploit suite replaces
`brain`). Agents are visited in ascending slot order.

| #   | Phase         | Functions                                                                           | Does                                                                                                            |
| --- | ------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | `environment` | `updateSeason`, `moveObstacles`                                                     | Season modifiers from `tick`; obstacles move and bounce off walls                                               |
| 2   | `hash`        | `buildHash`                                                                         | Agents and food into the spatial hash                                                                           |
| 3   | `sense`       | `senseAll`                                                                          | Rays, body state and scent into `inputs`                                                                        |
| 4   | `brain`       | `forwardAll`                                                                        | `inputs` and `hidden` to `outputs` and the new `hidden`                                                         |
| 5   | `signal`      | `signalAll`                                                                         | Alarm, hunt and smoke actions; timers; hearing                                                                  |
| 6   | `physics`     | `actAll`, `integrate`, `buildHash`, `resolveContacts`                               | Thrust and turn; movement; walls and obstacles; the hash rebuilt; agent pairs resolved and recorded as contacts |
| 7   | `lifecycle`   | `feed`, `mate`, `applyCosts`, `advancePregnancies`, `splitAll`, `reap`, `fillFloor` | Contacts become eating and bites, the hash finds mates; costs; births; deaths; the floor                        |
| 8   | `field`       | `spawnFood`, `ageFood`, `decayFertileZones`, `updatePheromones`, `ageSmoke`         | Food, zones, pheromones and smoke advance; deposits from phase 6 decay and diffuse                              |
| 9   | `invariants`  | `assertInvariants`                                                                  | Only when `config.checkInvariants`                                                                              |

The bench times each phase by calling its `run` directly.

### Spatial hash and contacts

- Every agent and food circle is inserted into each cell its bounding box overlaps. With `hashCellSize` 128 and a
  radius up to 125, a circle spans at most nine cells; cell storage is `9 x (maxAgents + maxFood)` entries.
- `resolveContacts` visits pairs with `i` ascending and `j > i` in cell-scan order. A pair sharing several cells is
  handled only in the cell holding the lower-left corner of the intersection of their bounding boxes.
- Each overlapping pair is separated, has its relative velocity resolved with mass `size^2`, and is appended to the
  contact list before separation is applied. More than `maxContacts` contacts throws, naming the tick and the count.
  The event ring holds `eventCapacity` records per tick and throws the same way when a tick overflows it.
- Obstacles are not in the hash. `castRays` and `integrate` test all `obstacleCount` obstacles directly.

### Sensing

`brainLayout(config).inputCount` is `rayCount x RAY_CHANNELS + EXTRA_INPUTS` = `rayCount x 9 + 32` (176 at 16 rays). Rays are evenly spaced over 360 degrees
from the heading. A ray walks the cells it crosses (DDA), tests every circle in a cell, and stops at the first cell
whose nearest hit lies inside that cell's stretch of the ray; the obstacles and the walls are tested directly.

| Per ray | Value                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | Proximity: `1 - distance / visionRange`, 0 for no hit                                                                                                                                |
| 2-9     | One-hot class: food, bigger agent (size ratio above `huntSizeRatio`), smaller agent (below `1 / huntSizeRatio`), similar agent, kin (see Kin, overrides size), wall, obstacle, smoke |

| Body input | Value                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | `energy / maxEnergy`                                                                                                                                       |
| 2, 3       | Forward and lateral velocity over `maxVelocity`                                                                                                            |
| 4          | `turnRate / maxTurn`                                                                                                                                       |
| 5          | `size / (baseSize + maxEnergy / energyToSize)`                                                                                                             |
| 6          | Pregnant (0 or 1)                                                                                                                                          |
| 7          | Ready to mate: mature, not pregnant, cooldown 0, energy above `mateMinEnergy`, temperature not past a stress threshold (0 or 1)                            |
| 8, 9       | `danger` and `attack` pheromone at the agent's cell, clamped to 0..1                                                                                       |
| 10, 11     | `detSin` and `detCos` of `2 pi x` season phase                                                                                                             |
| 12         | `1 - ateTimer / 30`                                                                                                                                        |
| 13         | `1 - bittenTimer / 30`                                                                                                                                     |
| 14         | Specialisation index / 4                                                                                                                                   |
| 15         | `ageTicks / maxAgeTicks`                                                                                                                                   |
| 16         | `temperature / temperatureMax`                                                                                                                             |
| 17         | Distance of `temperature` from the middle of the optimal band, over `temperatureMax / 2`, capped at 1                                                      |
| 18         | Cold stress: 1 below `temperatureColdStress`, falling linearly to 0 at `temperatureColdModerate`                                                           |
| 19         | Heat stress: 0 up to `temperatureHeatModerate`, rising linearly to 1 at `temperatureHeatStress`, 1 above                                                   |
| 20-32      | Scent and calls (`writeScentInputs`): danger, attack and hunt at the antennae, loudest heard alarm and hunt call; see [predator-prey.md](predator-prey.md) |

### Brain

`brainLayout(config)` returns `inputCount` and the offsets into one agent's weight row: `wIn`
(`inputCount x brainHidden`), `wRec` (`brainHidden x brainHidden`), `bHidden`, `wOut` (`brainHidden x OUTPUT_COUNT`),
`bOut`, and `weightCount` (6952 at the defaults). For each alive slot `forwardAll` computes into the scratch row, then
copies it over the slot's `hidden` row:

- `h' = detTanh(wIn x + wRec h + bHidden)`;
- `y = detTanh(wOut h' + bOut)`.

Sums accumulate in float64 and are stored as float32. `OUTPUT_COUNT` is 8 (`OUTPUT_INDEX` names them):

| Output | Drives                                                                  |
| ------ | ----------------------------------------------------------------------- |
| 1      | Thrust: `out x maxThrust` along the heading                             |
| 2      | Turn: `turnRate = out x maxTurn x turnMultiplier`                       |
| 3      | Sprint above 0: thrust x `(1 + sprintMultiplier)`, costing `sprintCost` |
| 4      | Wants to mate above 0                                                   |
| 5      | Wants to bite above 0 (has effect only when `canHunt`)                  |
| 6      | Alarm call above 0 (specialisations without `canHunt`)                  |
| 7      | Smoke release above `smokeThreshold`                                    |
| 8      | Hunt call above 0 (`canHunt` specialisations)                           |

### Physics

- `actAll` sets `turnRate`, turns, and adds thrust to velocity, scaled by `thrustEfficiency` of the agent's `temperature` as it stood at the end of the previous tick. `integrate` applies `damping`, caps speed at
  `maxVelocity` (x `1 + sprintMultiplier` while sprinting), and moves.
- **Thrust efficiency.** Thrust, sprint included, is multiplied by an efficiency set by the temperature `t`:
  `temperatureEfficiencyColdSevere` below `temperatureColdStress`, `temperatureEfficiencyColdModerate` below
  `temperatureColdModerate`, 1 up to `temperatureOptimalMax`, `temperatureEfficiencyHeatModerate` below
  `temperatureHeatStress`, and `temperatureEfficiencyHeatSevere` from there up.
- An agent crossing a wall or entering an obstacle is pushed out, has its normal velocity reflected, and loses
  `wallDamage` or `obstacleDamage` with loss cause `collision`. Damage applies on the tick of impact only; an agent
  already touching and moving away takes none.

### Lifecycle

- **Eating.** An agent overlapping food gains the food's energy up to `maxEnergy`; the food is removed and `ateTimer`
  resets. The eater's `temperature` rises by `temperatureGainEat x stored / foodEnergy`, with `stored` the energy it
  took, capped at `temperatureMax`.
- **Biting.** For each contact where one agent `canHunt`, wants to bite, is not kin and is more than
  `huntSizeRatio` times the other's size and faces it (the victim's centre within `biteArc` of its heading), the victim loses `biteEnergy` (x `biteMultiplier`, x 0.5 for a defender) and the biter gains
  exactly that amount up to `maxEnergy`. The biter deposits `pheromoneDeposit` of `attack` and the victim of
  `danger` at their cells; the victim's `bittenTimer` resets and its loss cause is `bite`. The biter's `temperature` rises by
  `temperatureGainEat x gained / foodEnergy`, with `gained` the energy it received; the victim's is unchanged.
- **Mating.** Agents are walked in slot order; for each agent that wants to mate and is ready (mature, not pregnant,
  cooldown 0, above `mateMinEnergy`, `temperature` from `temperatureColdStress` to `temperatureHeatStress` inclusive), `findMate` looks for a partner within `mateRange` (edge to edge, no contact
  needed) that is also ready and wanting, of the same specialisation, with size ratio within
  `1 / huntSizeRatio .. huntSizeRatio`, where the lower slot (the mother) holds more than
  `childEnergyMin / childEnergyShare`. Mating happens with probability `min(1, reproductionBonus / 1.5)` (a
  `lifecycle` draw per such pair). Each pays `mateCost` and starts
  its cooldown; the lower slot becomes pregnant for `pregnancyTicks` and copies the other's `weights` into its
  `fatherWeights`.
- **Births.** When a pregnancy ends, a mother with a free slot gives birth if `energy x childEnergyShare` is at least
  `childEnergyMin`: the child takes that gift from her and its brain from `policy.childBrain`. Otherwise the pregnancy ends with no child, the
  mother keeps her energy, and `BirthBlocked` is pushed with cause `capacity` or `energy`.
- **Splitting.** A mature, not pregnant agent with cooldown 0 and energy above `splitMinEnergy` gives half its energy
  to one child (brain from `policy.childBrain` with itself as both parents) and starts a cooldown of
  `reproductionCooldown x 1.5`. With no free slot nothing happens and `BirthBlocked` is pushed.
- **Placement.** A child appears touching its parent at an angle drawn from the `lifecycle` stream, clamped inside
  the world, with the parent's `lineageId` and specialisation, and `AgentBorn` is pushed.
- **Temperature.** `applyCosts` first steps each alive agent's temperature:
  `temperature += min(speed / maxVelocity, 1) x temperatureGainMove - temperatureLossPassive x L`, clamped to 0 to
  `temperatureMax`, with `L = max(0, 1 - temperatureModifier x temperatureSeasonSlope)` for the current season: a
  warmer season cools an agent more slowly. A new agent, whether spawned or born, starts at `temperatureStart`.
- **Costs.** After the temperature step, each tick an agent loses `((passiveLoss + sizeEnergyLoss x size) x P +
movementCost x speed^2 x m + turnCost x |turnRate| x m) x energyDrain`, where `m` is the specialisation's cost
  modifier and `P` the passive multiplier of the stepped temperature, plus `sprintCost` while sprinting. `P` is 1
  from `temperatureOptimalMin` to `temperatureOptimalMax` and rises linearly to `temperaturePassiveLossFactor` at 0
  and at `temperatureMax`. Loss cause `cost`.
- **Death.** Energy at or below 0, or `ageTicks` reaching `maxAgeTicks`, frees the slot, adds a fertile zone, and
  pushes `AgentDied` with cause `starved` (`cost`), `eaten` (`bite`), `collision` or `old-age`.
- **Kin.** Two agents are kin when one is the other's parent (its `parentA` or `parentB` equals the other's
  `genomeId`) or they share a parent. Kin never bite each other and show as kin on rays.
- **Floor and immigration.** While fewer than `minAgents` are alive, `fillFloor` places new lineages at
  `spawn`-stream positions clear of obstacles, with `initialEnergy` and brains from `policy.initBrain`, and pushes
  `PopulationFloor`; their `AgentBorn` cause is `floor`. Independently, every `immigrationInterval` ticks one
  immigrant arrives the same way if the population is below `maxAgents`, with `AgentBorn` cause `immigrant`.

### Food, zones and pheromones

- **Spawning.** Each tick the expected number of new food is `foodSpawnRate x maxAgents / 20 x foodScarcity x b`,
  where the target is `min(maxFood, max(50, foodTargetPerAgent x population))` and `b` is `1 + 4 x (1 - food / target)` below the
  target and `0.2` at or above it. The whole part spawns, and one more with probability equal to the fraction (a
  `food` draw). Nothing spawns at `maxFood`.
- **Position.** With probability `fertileZoneSpawnChance` and any zones alive, food spawns in a zone chosen by
  fertility; otherwise uniformly, clear of obstacles.
- **Rot.** Food older than `foodMaxAge` ticks is removed.
- **Fertile zones.** A death adds a zone at the body with fertility `size x FERTILE_ZONE_FERTILITY_FACTOR` (0.05),
  decaying by `fertileZoneDecay` of its initial fertility per tick; at `fertileZoneMax` the most decayed zone is
  replaced.
- **Pheromones.** Three grids (`danger`, `attack`, `hunt`) of `pheromoneCellSize` cells. Deposits add to a cell, capped at
  `pheromoneMax`; each tick every cell loses `pheromoneDecay` of its value, then `pheromoneDiffusion` of it spreads
  evenly to its four neighbours through the scratch grid. Agents read the values on the next tick's `sense`.
- **Calls and smoke.** `signalAll` (the `signal` phase) lets an agent call an alarm (non-hunters, `alarmCost`), call a hunt
  (hunters, `huntCallCost`) or release a smoke cloud (`smokeCost`, up to `maxClouds`), each on a timer; listeners within
  `callRadius` hear the loudest call into `heard`. Smoke blocks rays only. Rules and tunables: [predator-prey.md](predator-prey.md).

### Energy ledger and invariants

`energy.js` routes every change through `addEnergy` and `removeEnergy`, which record the change actually stored:

| Ledger in                                                        | Ledger out                                                                       | Transfers (net zero)             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| Food eaten (after the `maxEnergy` cap); initial and floor energy | Costs, sprint, `mateCost`, wall and obstacle damage, energy of the dead at death | Bites, child gifts, split halves |

`assertInvariants(world, config)` throws on the first of (the `calls` invariant included: `cloudCount <= maxClouds`, live `cloudTtl` above 0, timers within `callTicks` and `smokeCooldown`, `heard` loudness within 0 to 1): a NaN or infinite value in agent or food state; an alive
agent whose centre is outside `[0, worldWidth] x [0, worldHeight]`; the alive count differing from `population`; an alive agent whose `temperature` is not finite or lies outside `[0, temperatureMax]`; total alive energy differing from ledger in minus ledger out by more than 1e-6 x the total.

### Determinism

| RNG stream   | Draws                                              |
| ------------ | -------------------------------------------------- |
| `obstacles`  | Obstacle placement and velocity                    |
| `spawn`      | Initial and floor positions, specialisation        |
| `brain-init` | `policy.initBrain`                                 |
| `mutation`   | `policy.childBrain`                                |
| `food`       | Food count fraction, position, energy, zone choice |
| `lifecycle`  | Mating draws, child placement angle                |

Each stream is `fork(createRng(config.seed), name)`, so draws on one stream never shift another. `hashWorld` covers
`tick`, `nextId`, `population`, every agent array of every slot (`temperature` follows `lastLoss`), food, obstacles, fertile zones, all three pheromone grids, the smoke clouds
and the ledger. `writeSnapshot` packs per agent `x, y, angle, size, energy / maxEnergy` as float32 and `spec`, `lineageId`, `genomeId` and the slot through a `Uint32Array` view of the same buffer, then per food `x, y, radius` per obstacle `x, y, radius` and per live smoke cloud `x, y, cloudTtl / smokeTicks`, at the offsets
`snapshotLayout(config)` gives.

## Diagnostics (Phase 3)

`createSimLog(sink, { level })` returns a logger whose records go to `sink(record)`; `drainEvents(world, log)` turns
new event-ring records into log events. Nothing is logged per agent per tick.

| Event                | Level | Fields                                                                                                                                                                                 |
| -------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunStarted`         | info  | `runId`, `seed`, `configHash`, `configOverrides`, `policy`, `ticks`                                                                                                                    |
| `AgentBorn`          | debug | `tick`, `slot`, `genomeId`, `lineageId`, `spec`, `parentA`, `parentB`, `cause` (`mate`, `split`, `floor`, `immigrant`, `initial`)                                                      |
| `AgentDied`          | debug | `tick`, `slot`, `genomeId`, `cause` (`starved`, `eaten`, `collision`, `old-age`), `by` (`lastBiter` when `eaten`, else 0), `spec`, `lineageId`, `ageTicks`, `foodEnergy`, `biteEnergy` |
| `BirthBlocked`       | warn  | `tick`, `slot`, `cause` (`capacity`, `energy`)                                                                                                                                         |
| `PopulationFloor`    | info  | `tick`, `added`                                                                                                                                                                        |
| `InvariantViolated`  | error | `tick`, `invariant`, `slot`, `value`                                                                                                                                                   |
| `StepBudgetExceeded` | warn  | `tick`, `stepMs`, `budgetMs` (emitted by the caller that times steps)                                                                                                                  |
| `Checkpoint`         | info  | `tick`, `population`, `births`, `deaths`, `worldHash` (every 1000 ticks)                                                                                                               |
| `RunFinished`        | info  | `tick`, `worldHash`                                                                                                                                                                    |

- `npm run replay -- --seed <n> --config <file.json> --ticks <n> [--dump <tick>]` (`scripts/replay.mjs`) runs a
  headless world, writes JSONL to `.sim/logs/<runId>.jsonl`, prints `worldHash` at each checkpoint, and with `--dump`
  writes the world state at that tick to `.sim/dumps/<runId>-<tick>.json`.
- `scripts/lib/otel.mjs` exports metrics only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, with service name
  `blob-evolution`. `replay.mjs` sends `sim.population`, `sim.births` and `sim.deaths` per checkpoint; `bench.mjs`
  sends `sim.step_ms` per phase per run.
- `npm run aspire:dashboard` runs the Aspire CLI's standalone dashboard bound to `127.0.0.1:18888`, with OTLP on 4317
  and 4318. `docker-compose.yml` runs the same dashboard (`mcr.microsoft.com/dotnet/aspire-dashboard`, exact tag) where
  Docker is installed. `.mcp.json` registers the Aspire MCP server pointed at
  `http://localhost:18888`, using the command line of the Aspire CLI version recorded in [sim-notes.md](sim-notes.md).

## Phases

### Phase 1 - Numerics, RNG, config, world state and spatial hash (built)

**Targets:** none - foundation; nothing steps yet

`det-math.js`, `fnv.js`, `rng.js`, `config-defaults.js`, `config.js`, `config-validate.js`, `world.js`, `events.js`, `energy.js`,
`spawn.js`, `spatial-hash.js`, `world-hash.js` and `invariants.js`, with their tests, and the banned-`Math` lint rule
for `js/sim/`. `createWorld` places obstacles, food and agents through `spawn.js`, so the modules it needs are in this
phase.

### Phase 2 - Sensors, brain, physics, lifecycle and step (built)

**Targets:** bench.step_ms@500, bench.step_ms@100

- The remaining modules except `log.js`; `step` with the golden test and the allocation check.
- `npm run bench` (`scripts/bench.mjs`) runs worlds of 100, 250 and 500 agents (`initialAgents = minAgents =
maxAgents`) for 500 warm-up and 2000 measured ticks, and prints `bench.step_ms@<n>` (median) and
  `bench.phase_ms.<phase>@<n>`; `--json` prints the same as JSON. `bench/baseline.json` holds the dev machine's
  numbers.
- The `bench-check` gate fails when a `bench.step_ms@*` median is more than 15% above `bench/baseline.json`. It runs
  locally and reports `skipped` under `--ci`, because the baseline is machine-specific.
- `scripts/browser-hash.mjs` starts `vite`, runs the golden world in a Chromium module worker
  (`scripts/browser/hash-worker.js`) through Playwright, and exits 1 unless the hash equals the golden one.

### Phase 3 - Diagnostics and replay (built)

**Targets:** none - debuggability

`log.js`, `scripts/replay.mjs`, the JSONL sink, the OpenTelemetry adapter, `docker-compose.yml` and `.mcp.json`. The
`debug-sim` skill's replay commands match this doc.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | All simulation code in `js/sim/` (the Modules table), importing nothing outside it. Shells in `scripts/`: `scripts/bench.mjs`, `scripts/browser-hash.mjs` and `scripts/browser/hash-worker.js` (Phase 2); `scripts/replay.mjs`, `scripts/lib/jsonl-sink.mjs` and `scripts/lib/otel.mjs` (Phase 3). `eslint.config.js` gains the banned-`Math` rules for `js/sim/` and worker globals for `scripts/browser/`. No worker, renderer or UI change; the legacy app runs unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Unit tests              | One `test/sim/<module>.test.js` per module. `det-math`: within 1e-12 relative of `Math.*` over its domain and the same bits on repeat. `fnv`: published FNV-1a 64 vectors. `rng`: same seed same sequence, forks independent, Gaussian mean and variance on 1e5 draws. `config`: defaults, unknown key, wrong type, out-of-range value, hash stable across key order. `world`: lowest-slot reuse, free zeroes the slot. `spatial-hash`: neighbour sets match brute force on 200 seeded worlds, including radius-125 circles. `world-hash`: changes with each covered array. `invariants`: each invariant trips on a crafted world. `brain`: `forwardAll` within 1e-5 of a naive per-agent reference; same weights with different hidden states give different outputs. `ray-march`: matches a brute-force caster on seeded worlds; one micro-world per class, kin overriding size, a cousin seen as non-kin, a big agent centred in a neighbouring cell. `physics`: each pair resolved once (momentum conserved), impact-only damage, speed cap. `feeding`: bite needs `canHunt` and a non-kin victim, defender halves it, biter gains what the victim lost. `reproduction`: a pregnancy and a split each give exactly one child; no mating while pregnant; full world and low energy block births and keep the energy. `population`: `onDeath` runs before the slot is freed, immigrants arrive every `immigrationInterval`, hooks run in the documented order, each death cause with `spec`, `lineageId` and both energy totals on the event including `old-age`, and the fertile zone; floor fills with new lineages. `energy`: ledger balances over a scripted sequence. `food`, `environment`, `pheromones`, `events`, `snapshot`, `birth-policy`, `body-inputs`, `sensors`: their exported behaviour. Phase 3: `log` levels and `drainEvents`; `test/replay.test.js` runs 2000 ticks twice for the same hash |
| Headless e2e            | `test/sim/golden.slow.test.js`: seed 1 for each case in `test/sim/golden.json` (the default config and a crowded `busy` world), 5000 ticks, asserts the committed `worldHash` and runs `assertInvariants` every 100 ticks. `test/sim/golden.test.js` (fast tier, so every PR) does the same for each `shortCases` entry, 300 ticks with its own pinned hash. A change to the expected hash is its own commit whose body says why. `scripts/browser-hash.mjs` asserts the same hash in Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Performance budget      | Before: none - no stepping core exists. After: `bench.step_ms@500` under 8 ms and `bench.step_ms@100` recorded in `bench/baseline.json` on the dev machine; `bench-check` fails a regression above 15% locally. `test/sim/step-alloc.slow.test.js` runs `node --expose-gc scripts/alloc-check.mjs`, which steps 1000 ticks after warm-up and fails on heap growth over 1 MB in the best of three runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Evolution metrics       | N/A - the reference policy only clones with noise; [evolution-evals.md](evolution-evals.md) defines and measures the `eval.*` metrics on this core                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Determinism             | Streams in the Determinism table on `world.rng`; slot-order and cell-scan pair order; only correctly rounded `Math` functions plus `det-math`. Bit-exact replay from seed and config in Node and Chromium, checked by the golden test and `browser-hash.mjs`; other engines are not bit-exact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Config and persistence  | Every key in the Config table with its default and validation. No IndexedDB or saved-file change; `brainLayout(config)` defines the weight row that [evolution-rework.md](evolution-rework.md) stores. Replay `--config` files are JSON overrides for `createConfig`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Logging and diagnostics | Phase 2 event ring records `AgentBorn`, `AgentDied`, `BirthBlocked`, `PopulationFloor`; Phase 3 adds the `simLog` events table. A broken invariant throws with the invariant, tick and slot, and `replay.mjs` logs it as `InvariantViolated`. Contact overflow throws with tick and count. Reproduce with `npm run replay -- --seed <n> --config <file> --ticks <n> --dump <tick>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser compatibility   | `js/sim/` uses ES2023 and typed arrays with no DOM, so it runs in Node 24 and a dedicated module worker. Bit-exact replay is verified in Chromium; Firefox and Safari are not verified. No WebGL or WebGPU                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Docs                    | Phase 2: `AGENTS.md` Commands (`npm run bench`), [sim-notes.md](sim-notes.md) numeric findings from `det-math` and `browser-hash`. Phase 3: `AGENTS.md` Commands (`npm run replay`) and a dev-environment section (Aspire dashboard, `.mcp.json`); the `debug-sim` skill's phase names (`environment`, `hash`, `sense`, `brain`, `physics`, `lifecycle`, `field`) and replay command line. This doc becomes `Implemented` when Phase 3 lands, describing `js/sim/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Verification            | `scripts/check.sh` green, with `bench-check` run on the dev machine; the steps in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Task breakdown

### Phase 1 - Numerics, RNG, config, world state and spatial hash

| #   | Task                                                                                           | Nature       | Depends on                              |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| T1  | Add `js/sim/det-math.js` and the banned-`Math` lint rules for `js/sim/`, with tests            | [judgement]  | -                                       |
| T2  | Add `js/sim/fnv.js` with tests                                                                 | [mechanical] | -                                       |
| T3  | Add `js/sim/rng.js` with tests                                                                 | [judgement]  | T1, T2                                  |
| T4  | Add `js/sim/config-defaults.js`, `js/sim/config-validate.js` and `js/sim/config.js` with tests | [judgement]  | T2                                      |
| T5  | Add `js/sim/world.js` (`allocateWorld`, `allocAgent`, `freeAgent`) with tests                  | [judgement]  | T3, T4                                  |
| T6  | Add `js/sim/events.js` and `js/sim/energy.js` with tests                                       | [mechanical] | T5                                      |
| T7  | Add `js/sim/spawn.js` with `createWorld`, with tests                                           | [judgement]  | T6                                      |
| T8  | Add `js/sim/spatial-hash.js` with the brute-force reference test                               | [judgement]  | T5                                      |
| T9  | Add `js/sim/world-hash.js` with tests                                                          | [mechanical] | T2, T5                                  |
| T10 | Add `js/sim/invariants.js` with a test per invariant                                           | [judgement]  | T6                                      |
| T11 | Conformance review of Phase 1                                                                  | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 |

### Phase 2 - Sensors, brain, physics, lifecycle and step

| #   | Task                                                                                                                                             | Nature      | Depends on                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------- |
| T12 | Add `js/sim/environment.js`, `js/sim/pheromones.js` and `js/sim/kin.js` with tests                                                               | [judgement] | T11                                         |
| T13 | Add `js/sim/ray-march.js`, `js/sim/body-inputs.js` and `js/sim/sensors.js` with the brute-force and micro-world tests                            | [judgement] | T12                                         |
| T14 | Add `js/sim/brain.js` with the naive reference test                                                                                              | [judgement] | T13                                         |
| T15 | Add `js/sim/physics.js` with tests                                                                                                               | [judgement] | T11                                         |
| T16 | Add `js/sim/food.js` with tests                                                                                                                  | [judgement] | T12                                         |
| T17 | Add `js/sim/feeding.js`, `js/sim/reproduction.js`, `js/sim/population.js` and `js/sim/birth-policy.js` with tests                                | [judgement] | T14, T15, T16                               |
| T18 | Add `js/sim/step.js`, `js/sim/snapshot.js`, `test/sim/golden.slow.test.js`, `scripts/alloc-check.mjs` and its test                               | [judgement] | T13, T17                                    |
| T19 | Add `scripts/bench.mjs`, `npm run bench`, `bench/baseline.json`, the `bench-check` gate, and the `AGENTS.md` command                             | [judgement] | T18                                         |
| T20 | Add `scripts/browser-hash.mjs` and `scripts/browser/hash-worker.js` with the worker-globals lint override; [sim-notes.md](sim-notes.md) findings | [judgement] | T19                                         |
| T21 | Conformance review of Phase 2                                                                                                                    | [judgement] | T12, T13, T14, T15, T16, T17, T18, T19, T20 |

### Phase 3 - Diagnostics and replay

| #   | Task                                                                                                                                                                                                                    | Nature       | Depends on         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| T22 | Add `js/sim/log.js` with tests                                                                                                                                                                                          | [judgement]  | T21                |
| T23 | Add `scripts/replay.mjs`, `scripts/lib/jsonl-sink.mjs`, `npm run replay` and `test/replay.test.js`                                                                                                                      | [judgement]  | T22                |
| T24 | Record the Aspire CLI version in [sim-notes.md](sim-notes.md); add `scripts/lib/otel.mjs` with exact-pinned OpenTelemetry packages, wire it into `replay.mjs` and `bench.mjs`; add `docker-compose.yml` and `.mcp.json` | [judgement]  | T23                |
| T25 | Update `AGENTS.md` and the `debug-sim` skill (`--dump <tick>` writing `.sim/dumps/`, and the `STEP_PHASES` names)                                                                                                       | [mechanical] | T24                |
| T26 | Conformance review of Phase 3                                                                                                                                                                                           | [judgement]  | T22, T23, T24, T25 |

## Verification

1. `scripts/check.sh` is green, and `test/sim/golden.slow.test.js` passes.
2. `npm run bench` prints `bench.step_ms@500` under 8 ms on the dev machine, and `scripts/check.sh --only=bench-check`
   passes there.
3. `node scripts/browser-hash.mjs` prints the golden `worldHash` from a Chromium worker.
4. `npm run replay -- --seed 1 --ticks 2000` run twice prints identical checkpoint hashes and writes
   `.sim/logs/<runId>.jsonl` with `RunStarted`, `Checkpoint` and `RunFinished`.
5. With `npm run aspire:dashboard` (or `docker compose up aspire-dashboard`) running and `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`,
   `npm run replay` shows `sim.population` in the dashboard at `http://127.0.0.1:18888`.
