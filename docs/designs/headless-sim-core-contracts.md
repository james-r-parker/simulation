# Headless sim core - implementation contracts

**Status:** Reference - exact rules for building [headless-sim-core.md](headless-sim-core.md); that doc carries the status, phases and tasks.

> Companion to [headless-sim-core.md](headless-sim-core.md). Where the two differ, this file wins; fix the other in
> the same PR.

The design doc says what the core does. This file fixes the details that two careful builders would otherwise
choose differently: data layouts that modules share, update orders, and edge cases. Each one decides a bit of the
golden `worldHash` or an interface another task builds against. A builder who finds a case this file does not
settle stops and asks; the answer is added here.

## Numbers and arithmetic

- Every formula is evaluated exactly as written here or in the design doc, left to right, with no regrouping or
  algebraic simplification: `a + b + c` is `(a + b) + c`.
- All arithmetic is IEEE-754 double. Values are rounded to float32 only when stored into a `Float32Array`.
- Integers in `Uint32Array` fields wrap with `>>> 0`; ids never reach 2^32 in a run.
- A computed value that must be finite and is not throws, naming the function, the slot and the value.

### `det-math.js`

| Function  | Domain (outside it: throw) | Method                                                                                                                                                                             |
| --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detExp`  | `[-708, 709]`              | `k = Math.floor(x * INV_LN2 + 0.5)`; `r = x - k * LN2_HI - k * LN2_LO`; Taylor series of `e^r` to degree 13 by Horner; times `2^k` built exactly by writing the exponent bits      |
| `detLog`  | finite `x > 0`             | Exponent and mantissa from the bits, mantissa moved into `[sqrt(1/2), sqrt(2))`; `s = (m - 1) / (m + 1)`; `2 (s + s^3/3 + ... + s^21/21)`; plus `e * LN2_HI + e * LN2_LO`          |
| `detSin`  | `abs(x) <= 1e6`            | `k = Math.floor(x * INV_PIO2 + 0.5)`; `r = x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3`; quadrant `k mod 4` picks `sinPoly(r)` or `cosPoly(r)` and the sign; Taylor to degree 17 / 18 |
| `detCos`  | `abs(x) <= 1e6`            | As `detSin`, quadrant shifted by one                                                                                                                                               |
| `detTanh` | finite                     | `x === 0` returns `x` (keeps `-0`); `abs(x) > 20` returns `Math.sign(x)`; else `t = detExp(-2 abs(x))`, `Math.sign(x) * (1 - t) / (1 + t)`                                         |

- Constants are fdlibm's: `LN2_HI` 6.93147180369123816490e-01, `LN2_LO` 1.90821492927058770002e-10, `INV_LN2`
  1.44269504088896338700e+00, `INV_PIO2` 6.36619772367581382433e-01, `PIO2_1` 1.57079632673412561417e+00, `PIO2_2`
  6.07710050630396597660e-11, `PIO2_3` 2.02226624871116645580e-21.
- Bits are read and written through one module-level `Float64Array(1)` and its `Uint32Array` view, created at
  import. It is the one allowed import-time allocation in `js/sim/` (8 bytes). The platform must be little-endian;
  `createWorld` throws otherwise.
- The test checks `abs(det - Math.fn) <= 1e-12 * max(1, abs(Math.fn))` on 10^5 points spread over each domain
  (log-spaced for `detLog`), that a repeat call gives the same bits, and that out-of-domain input throws.

### Lint

`no-restricted-properties` bans these `Math` members in `js/sim/`: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`,
`atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `expm1`, `log`, `log2`, `log10`, `log1p`, `pow`,
`cbrt`, `hypot`, `clz32`, `random`. `no-restricted-syntax` bans `**` and `**=`.

## Hashing - `fnv.js`

- State is a `Uint32Array(2)`: `[lo, hi]`. `fnv64Init(state)` sets the offset basis `0xcbf29ce484222325` and
  returns `state`.
- `fnv64Bytes(state, bytes)` folds a `Uint8Array`: per byte, `lo ^= byte`, then the 64-bit product with the prime
  `0x100000001b3` modulo 2^64, done in 16-bit limbs.
- `fnv64Hex(state)` returns 16 lowercase hex characters, `hi` then `lo`.
- Test vectors: `""` gives `cbf29ce484222325`, `"a"` gives `af63dc4c8601ec8c`, `"foobar"` gives `85944171f73967e8`.
- `fnv64String(state, text)` folds a string as its char codes, one byte each; a char code above 127 throws. It
  allocates nothing. `fork` and `configHash` use it.

## RNG - `rng.js`

An rng is `{ seed, s }`, with `seed` a uint32 and `s` a `Uint32Array(4)` holding sfc32's `a, b, c, d`.

| Function               | Contract                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createRng(seed)`      | `seed` is an integer `0 .. 2^32 - 1`, else throw. `a = 0x9E3779B9 ^ seed`, `b = seed`, `c = seed + 0x85EBCA6B`, `d = 1` (all `>>> 0`); then 12 draws are discarded       |
| next uint32 (internal) | `t = (a + b + d) >>> 0`; `d = (d + 1) >>> 0`; `a = b ^ (b >>> 9)`; `b = (c + (c << 3)) >>> 0`; `c` rotated left by 21 bits; `c = (c + t) >>> 0`; return `t`              |
| `nextFloat(rng)`       | `uint32 / 4294967296`, in `[0, 1)`                                                                                                                                       |
| `nextInt(rng, n)`      | `n` an integer `1 .. 2^32`, else throw; `Math.floor(nextFloat(rng) * n)`                                                                                                 |
| `nextGaussian(rng)`    | `u1 = 1 - nextFloat(rng)`, `u2 = nextFloat(rng)`; `Math.sqrt(-2 * detLog(u1)) * detCos(2 * PI * u2)`. Two draws per call, no cached spare                                |
| `fork(rng, name)`      | `createRng((lo ^ rng.seed) >>> 0)`, where `lo` is the low word of `fnv64String` of `name` from the offset basis. Reads only `rng.seed`; the parent's state does not move |

`PI` is the double literal `3.141592653589793`. The `rng` test pins the first five `nextFloat` values of
`createRng(1)` once they are first computed (a self-pin, like the golden hash).

## Config

### New keys

The core needs these beyond the design doc's Config table. All are "new" in Source and all are in `rulesHash`.

| Key                       | Default | Replaces                                                                     |
| ------------------------- | ------- | ---------------------------------------------------------------------------- |
| `restitution`             | `0.5`   | Elasticity of agent-agent impulses                                           |
| `splitCooldownMultiplier` | `1.5`   | The split cooldown factor                                                    |
| `mateChanceScale`         | `1.5`   | Mating chance is `min(1, reproductionBonus / mateChanceScale)`               |
| `fertileZoneRadius`       | `150`   | Food from a zone lands within this distance of its centre                    |
| `fertileZoneFertility`    | `0.05`  | `FERTILE_ZONE_FERTILITY_FACTOR`: a zone starts at `size x` this              |
| `placementTries`          | `100`   | Rejection-sampling attempts before `placeClear` throws                       |
| `temperatureSeasonSlope`  | `0.03`  | Scales a season's `temperatureModifier` into the temperature loss multiplier |

`TIMER_CAP` (30, the cap on `ateTimer` and `bittenTimer`) is a named constant in `world.js`, not a key: it is bound to
the `Uint8Array` storage.

### Feature keys (world-balance Phase 3, natural-selection big bang)

There are no feature switches. The world-balance features were keys that defaulted to off (`leakEnabled`,
`traitsEnabled`, `sexesEnabled`, `carcassesEnabled`, `foodAreaCapacity`, `terrainLayout`, `erasEnabled`, `meritEnabled`,
`preySplit`, and the rescue, invasion and immigration keys); the natural-selection big bang deleted each one and its off
path, so the feature is always on and the key no longer exists. `FEATURES_OFF` and `FEATURES_ON`
(`scripts/lib/features-on.mjs`) and the frozen bench world are gone with them; a test that needs a quiet world spreads
`SIMPLE_WORLD` (`test/helpers/simple-world.js`). The remaining keys of the features are plain config, with the rules in
`FEATURE_RULES` (`config-rules.js`) and the defaults of `DEFAULTS` (`config-defaults.js`), which are authoritative.
[world-balance.md](world-balance.md) says what each rule does. A key set to 0 or its neutral value still draws no random
number and writes no hashed state where this file says so.

| Key                                                                           | Default                             | Rule                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| `hebbianRate`                                                                 | `0.0001`                            | `0 .. 1`                                                 |
| `visionCost`                                                                  | `0.5`                               | `>= 0`                                                   |
| `mateDistanceMax`                                                             | `1`                                 | `> 0` or `Infinity`                                      |
| `mateRank`                                                                    | `'rank'`                            | `'rank'` or `'offspring'`                                |
| `birthWindowTicks`, `maxBirthsPerWindow`                                      | `3000`, `5`                         | Integer `>= 1`; integer `0 .. 16`                        |
| `satiationShare`, `digestTicks`, `handlingTicks`, `handlingThrust`            | `0.95`, `10`, `20`, `0.2`           | `0 .. 1`; integer `0 .. 30`; integer `0 .. 30`; `0 .. 1` |
| `specMutationRate`, `huntUpkeep`                                              | `0.002`, `0.002`                    | `0 .. 1`; `>= 0`                                         |
| `alarmThreshold`, `huntCallThreshold`                                         | `0.65`, `0.65`                      | `0 .. 0.95` each; 0 fires on any output above 0          |
| `predatorKillEnergy`                                                          | `150`                               | `0 .. 1000`; 0 is off                                    |
| `floorTrigger`, `entrantEnergy`                                               | `8`, `200`                          | Integer `>= 0`; `>= 0` (0 means `initialEnergy`)         |
| `biteCost`, `recoilEnergy`                                                    | `8`, `20`                           | `>= 0` each; 0 is off                                    |
| `specialisations.<s>.passiveLossMultiplier`, `.splitMinEnergyMultiplier`      | per type                            | `> 0 .. 2`; `0.25 .. 2`                                  |
| `specialisations.<s>.kickMultiplier`                                          | `1` (defender `2`)                  | `> 0`                                                    |
| `carcassTicks`, `carcassShare`                                                | `300`, `0.5`                        | Integer `>= 1`; `0 .. 1`                                 |
| `specialisations.<s>.plantFoodValue`, `.meatFoodValue`                        | `1` (meat `0.3`, predator plants 0) | `0 .. 1`                                                 |
| `foodPatchCount`, `foodPatchRadius`, `foodPatchCapacity`                      | `16`, `400`, `1`                    | Integer `0 .. 256`; `> 0`; `> 0`                         |
| `foodPatchDepletion`, `foodPatchRegrow`, `foodBackgroundShare`                | `0.02`, `0.0005`, `0.2`             | `>= 0`; `0 .. 1`; `0 .. 1`                               |
| `foodRegrowPerArea`                                                           | `0.06`                              | `>= 0`                                                   |
| `wallGaps`, `wallGapWidth`                                                    | `3`, `200`                          | Integer `0 .. 8`; `> 0`                                  |
| `refugeCount`, `refugeCluster`, `refugeSizeMax`, `coldMarginWidth`            | `8`, `2`, `30`, `600`               | Integer `0 .. 8`; integer `1 .. 4`; `> 0`; `>= 0`        |
| `eraSeasonTicks`, `winterRegrow`, `droughtChance`                             | `36000`, `0.2`, `0.25`              | Integer `>= 1`; `>= 0`; `0 .. 1`                         |
| `meritBirthBoost`                                                             | `0`                                 | `0 .. 0.5`                                               |
| `meritMateBonus`, `meritChildBonus`, `meritEscapeBonus`, `splitDeliberateMin` | `150`, `300`, `60`, `300`           | `>= 0`                                                   |
| `meritHalfLife`, `meritHalf`                                                  | `20000`, `1000`                     | Integer `>= 0`; `> 0`                                    |
| `splitDeliberateShareMin`, `splitMaxPerLife`                                  | `0.2`, `0`                          | `0 .. 1`; integer `>= 0`                                 |

`plantFoodValue` and `meatFoodValue` are specialisation fields (`SPECIALISATION_FIELDS`), so every specialisation carries
both. `minAgents` is 40. `rulesHash` covers every key.

### Shapes and ranges

Validation runs after the merge. Integer means `Number.isInteger`. A failure throws naming the key path (`seasons[2].energyDrain`), the value and the rule.

| Keys                                                                                                       | Rule                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `seed`                                                                                                     | Integer `0 .. 2^32 - 1`                                                                               |
| `worldWidth`, `worldHeight`                                                                                | `1000 .. 100000`                                                                                      |
| `maxAgents`                                                                                                | Integer `1 .. 4096`                                                                                   |
| `initialAgents`, `minAgents`                                                                               | Integer `0 .. maxAgents`                                                                              |
| `maxFood`                                                                                                  | Integer `1 .. 20000`; `initialFood` integer `0 .. maxFood`                                            |
| `foodMaxAge`, `maxAgeTicks`, `pregnancyTicks`                                                              | Integer `>= 1`                                                                                        |
| `reproductionCooldown`, `maturityTicks`                                                                    | Integer `>= 0`                                                                                        |
| `rayCount`                                                                                                 | Integer `1 .. 64`; `brainHidden` integer `1 .. 128`                                                   |
| `hashCellSize`, `pheromoneCellSize`                                                                        | `> 0`; `maxContacts`, `eventCapacity`, `placementTries` integer `>= 1`                                |
| `damping`, `highFoodChance`, `fertileZoneSpawnChance`, `pheromoneDecay`, `restitution`, `fertileZoneDecay` | `0 .. 1`                                                                                              |
| `pheromoneDiffusion`                                                                                       | `0 .. 1`                                                                                              |
| `huntSizeRatio`                                                                                            | `>= 1`                                                                                                |
| `mateSizeRatio`                                                                                            | `> 1`; the larger parent may be at most this times the smaller                                        |
| `temperatureMax`                                                                                           | `> 0`; `temperatureStart` `0 .. temperatureMax`                                                       |
| `temperatureGainMove`, `temperatureGainEat`, `temperatureLossPassive`, `temperatureSeasonSlope`            | `>= 0`                                                                                                |
| `temperaturePassiveLossFactor`                                                                             | `>= 1`                                                                                                |
| `temperatureColdStress`                                                                                    | `> 0`                                                                                                 |
| `temperatureEfficiencyColdSevere`, `...ColdModerate`, `...HeatModerate`, `...HeatSevere`                   | `> 0` and `<= 1`                                                                                      |
| `initialEnergy`                                                                                            | `> 0` and `<= maxEnergy`; `minSize <= baseSize`                                                       |
| Every other number                                                                                         | Finite and `>= 0`; sizes, radii, energies and the divisors `energyToSize` and `mateChanceScale` `> 0` |
| `checkInvariants`                                                                                          | Boolean                                                                                               |

Cross-key rule: `0 < temperatureColdStress < temperatureColdModerate <= temperatureOptimalMax < temperatureHeatModerate
<= temperatureHeatStress < temperatureMax` and `temperatureColdStress < temperatureOptimalMin <= temperatureOptimalMax`.
Cross-key rule: `maxAgents x weightCount` is at most 2^24 (64 MB per weight array). Cross-key rule: the largest radius - `baseSize + maxEnergy / energyToSize`, `foodRadius`, `highFoodRadius` - must be
below `hashCellSize`, so a circle spans at most 3 x 3 cells. The base size is `baseSize x TRAIT_MAX` (1.3), so at the defaults the radius is 32.5 + 2000 / 250 = 40.5 against a `hashCellSize` of 140.
Cross-key rule: with `foodPatchCount` above 0, `2 x foodPatchRadius` is at most the shorter world side. Cross-key rule: `terrainProblem` in `terrain.js` rejects a terrain unless the wall gaps leave wall between them, the refuges (in groups of `refugeCluster`) fit the basins, the cold margins leave room between them and (with patches) a patch disc fits a basin.

- `seasons` is an array of exactly four objects in the order spring, summer, autumn, winter, each with exactly the
  keys `foodScarcity`, `energyDrain`, `reproductionBonus`, each finite and `>= 0`, and `temperatureModifier`, finite
  and of either sign. The season index is
  `Math.floor(phase x 4)`.
- `specialisations` is an object with exactly the keys `forager`, `predator`, `reproducer`, `scout`, `defender`. Each
  value has exactly `index` (fixed: 0, 1, 2, 3, 4 in that order), `visionRange` (`> 0`), `canHunt` (boolean),
  `moveCostMultiplier`, `biteTakenMultiplier`, `cooldownMultiplier`, `biteMultiplier`, `turnMultiplier` and `sprintBoost` (each `> 0`), `passiveLossMultiplier` (`> 0` and at most 2) and `splitMinEnergyMultiplier` (`0.25` to `2`). The defaults are the design
  doc's table: scout `moveCostMultiplier` 0.7, defender `biteTakenMultiplier` 0.5, reproducer `cooldownMultiplier`
  0.5, predator `biteMultiplier` 4, `turnMultiplier` 0.7 and `sprintBoost` 1.6, every other multiplier 1, and both new multipliers 1 for every specialisation.
- `config.js` keeps the merge, freezing and hashes; the per-key rules live in `js/sim/config-validate.js`
  (`validateConfig`), so neither file passes 300 lines.
- Overrides deep-merge objects key by key; an override array replaces the default array whole.
- Canonical JSON for the hashes: keys sorted at every level, arrays in order, numbers by `JSON.stringify`.

## World layout

### Arrays

The design doc's World state table (the `temperature` array is `Float32`), plus:

| Group         | Arrays (type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merit         | `merit`, `deliberateIntake`, `meritStamp` (`Float64`), `parentSlotA`, `parentSlotB` (`Int32`), the tracker, escape and mark arrays of `meritSpecs()` in `merit-state.js` (`Float64`, `Uint16`, `Uint8`, `Uint32`); `maxAgents` entries each, always allocated and hashed after the agent arrays                                                                                                                                                                                                                            |
| Food          | `foodAlive` (`Uint8`), `foodX`, `foodY`, `foodRadius` (`Float32`), `foodValue` (`Float64`), `foodAge` (`Uint32`)                                                                                                                                                                                                                                                                                                                                                                                                           |
| Obstacles     | `obsX`, `obsY`, `obsVx`, `obsVy`, `obsRadius` (`Float32`), one entry per static rock of the terrain (`terrainRockCount`); `obsVx` and `obsVy` stay 0, allocated and hashed so the world hash holds                                                                                                                                                                                                                                                                                                                         |
| Food kind     | `foodKind` (`Uint8`, `FOOD_KIND`: plant 0, meat 1), `maxFood` entries; always hashed                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Patches       | `patchX`, `patchY` (`Float32`), `patchStock` (`Float64`), `foodPatchCount` entries each (empty when 0); hashed only when `foodPatchCount` is above 0                                                                                                                                                                                                                                                                                                                                                                       |
| Brain extras  | `fastOut` (`Float32`, `brainHidden x geneOutputs` per agent; hashed only when `hebbianRate` is above 0), `world.inputActivity` (the input-activity sample of `js/sim/input-activity.js`: `active` `Float64` counts per pooled-row input, `samples`, and the `rare` mask `weightDecay` reads at a birth; filled at the end of the brain phase every 16 ticks after `BURN_IN_TICKS`; `active` and `samples` hashed only when `weightDecay` is above 0), `leakRate` (`Float32`, `brainHidden` per agent; derived, not hashed) |
| Traits, sex   | `sex` (`Uint8`), `vision` and `baseSize` (`Float32`), all hashed, `childShare` (`Float32`; derived, not hashed), `birthRing` (`Uint32`, `maxBirthsPerWindow` per agent, so empty when the budget is off; hashed only when `maxBirthsPerWindow` is above 0)                                                                                                                                                                                                                                                                 |
| Era           | `era` (`Int32Array(1)`): the basin in drought (0 west, 1 east), -1 for none; always hashed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Fertile zones | `zoneAlive` (`Uint8`), `zoneX`, `zoneY` (`Float32`), `zoneFertility`, `zoneInitial` (`Float64`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Pheromones    | `danger`, `attack`, `hunt`, `pheromoneScratch` (`Float32`), `cols x rows` with `cols = Math.ceil(worldWidth / pheromoneCellSize)`                                                                                                                                                                                                                                                                                                                                                                                          |
| Calls         | `alarmTimer`, `huntTimer`, `smokeTimer` (`Uint16`, per agent); `heard` (`Float32`, 6 per agent)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Bites         | `lastBiteTick`, `prevBiter`, `prevBiteTick` (`Uint32`, per agent)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Smoke         | `cloudX`, `cloudY` (`Float32`), `cloudTtl` (`Uint16`), `maxClouds` entries each                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tables        | `antennaCos`, `antennaSin`, `biteBySpec`, `turnBySpec`, `sprintBySpec`, `visionBySpec`, `plantFoodBySpec`, `meatFoodBySpec` (not hashed)                                                                                                                                                                                                                                                                                                                                                                                   |
| Ledger        | `ledger` (`Float64Array(2)`): `[in, out]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Scalars       | `tick`, `nextId` (starts at 1; 0 means "none"), `population`, `foodCount`, `cloudCount`                                                                                                                                                                                                                                                                                                                                                                                                                                    |

- Every agent row array is `maxAgents` rows; `hidden` has `maxAgents + 1` rows, the last being the scratch row.
- `allocateWorld` returns a spread copy of the object it filled, so `world` is in V8's fast-properties mode (the many keyed stores leave the first object in dictionary mode, which makes every `world.x` in the hot loops a hash lookup); `test/sim/world-shape.test.js` guards it with `%HasFastProperties`. A world's arrays are never reassigned.
- The slot free-list is derived from `alive` and is not hashed: `allocAgent` scans for the lowest slot with
  `alive === 0` and throws when none is free. Callers check `population < maxAgents` first.
- `freeAgent` zeroes every agent row array at the slot and sets `alive` to 0. `removeFood(world, slot)` (in
  `world.js`) zeroes every food array at the slot and decrements `foodCount`; a freed zone slot has every zone array
  zeroed.

### Flora state and intake

`dose` is per-agent `Float32`, finite and nonnegative for alive slots, zero at birth and after freeing a slot, and included in `hashWorld`. It is not a brain input. `stepToxin` drains sick bodies and decays existing doses at the start of `lifecycle`, before meals. A fresh dose therefore reaches the same tick's `reap` without first decaying. Sickness scales thrust and blocks eating; `ingestToxin` books a negative net meal as a cost and returns nonnegative energy for normal storage.

`rayHue` is derived `Float32Array(maxAgents x rayCount)`, excluded from `hashWorld`. `castRays` writes each alive slot's whole row before pooling: the hit food's hue, zero for every other hit or no hit. `poolRays` and the diagnostic raw-hue controller read that row until the next cast. Dead slots need no valid row. The two slots may contain rays from the same food item; pooling does not deduplicate targets. The two selected food hues occupy pooled indices 48 and 49; the body block begins at 50 in `pooled-v3`.

`flora-state.js` allocates the Phase 1 arrays. Patch records have `floraPatchMax` entries; only the initial `foodPatchCount` slots are alive. `patchAlive` is Uint8, `patchSerial` Uint32 and `patchLowTicks`, `patchBank` Int32; all are hashed. Dead slots are excluded from source selection, depletion, regrowth, fruiting and patch visits. Patch traits: `patchSpecies` (`Uint8`) and `patchHue`, `patchEnergy`, `patchRegrow`, `patchLife`, `patchStart`, `patchSpan`, `patchYield`, `patchWeight` (`Float32`). Item records have `maxFood` entries: `foodSpecies`, `foodHue`, `foodTox`, `foodLife` (`Float32`) and `foodPatch` (`Int32`, source patch or -1 for background, fungus and meat). All are hashed. `removeFood` zeroes the item records. Species indices follow `FLORA_NAMES`.

`myceliumX`, `myceliumY`, `myceliumSize` (`Float32`) and `myceliumTicks` (`Int32`) have `myceliumMax` entries, all hashed. A free mark is zero in every array. Death adds a mark for `myceliumLife` ticks; a full pool replaces the fewest ticks left, lowest slot on ties.

`floraIntake` is a derived `Float64Array(24)`, excluded from `hashWorld`. Its index is `season x 6 + species`. `tryEat` adds the stored plant energy returned by `addEnergy`, before `removeFood` clears the item. Meat adds nothing. The counters start at zero at allocation, accumulate for the world's lifetime and are never reset per tick or per observer. `trackFlora` keeps its own last-observed copy, reads differences once after each step, and excludes ticks through `BURN_IN_TICKS`. Counter reads change no simulation state.

`floraMeals` is a derived `Float64Array(2)`, also excluded from `hashWorld`: all plant items eaten and toxic plant items eaten (`foodTox > 0`). It counts items even when their net stored energy is zero, before clearing the food slot; meat adds nothing. Its lifetime/reset rules match `floraIntake`. The flora scene consumes counter differences once per observed tick strictly after `BURN_IN_TICKS`, counts poison/all deaths whose event tick is at least burn-in, and sick/all alive agent-ticks from the observed post-step state. At ticks divisible by 1000 strictly after burn-in it sums toxic/all live plant availability. Minus Ivlev electivity uses these pooled item shares, `(p - r) / (p + r)`; missing meals, missing plant checkpoints or zero combined toxic share return null with a reason. No death or alive agent-tick denominator likewise returns null.

`floraDisc` is reusable placement scratch, excluded from the hash. A fungal disc is local-only: exhausted rejection sampling refuses the fungus source and redraws as patch/background. Patches retain the uniform clear-placement fallback.

### Ids and codes

| Code set      | Values                                                                                                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Born cause    | `initial` 0, `mate` 1, `split` 2, `floor` 3, `immigrant` 4 (never spawned now)                                                                                                                                                                                                     |
| Death cause   | `starved` 0, `eaten` 1, `collision` 2, `old-age` 3, `poisoned` 4                                                                                                                                                                                                                   |
| Blocked cause | `capacity` 0, `energy` 1                                                                                                                                                                                                                                                           |
| `lastLoss`    | none 0, `cost` 1, `bite` 2, `collision` 3                                                                                                                                                                                                                                          |
| Event type    | `AgentBorn` 1, `AgentDied` 2, `BirthBlocked` 3, `PopulationFloor` 4, `AlarmCalled` 5, `SmokeReleased` 6, `PackCalled` 7, `SmokeRefused` 8, `FoodPatchesCreated` 9, `SeasonChanged` 10, `DroughtStarted` 11, `MeritSummary` 14, `LineProven` 15, `AgentSickened` 16, `PatchDied` 18 |
| Sex           | `female` 0, `male` 1 (`SEX` in `sex.js`)                                                                                                                                                                                                                                           |

Each set is exported as a frozen object of named constants from the module that owns it (`events.js` for the event
types and causes, `energy.js` for `lastLoss`).

## Events - `events.js`

The ring is a per-tick buffer: `{ data: Float64Array(eventCapacity x EVENT_STRIDE), count }` with `EVENT_STRIDE` 12.

- `pushEvent(ring, type, tick)` throws naming the tick and `eventCapacity` when `count === eventCapacity`; otherwise
  it writes `type` and `tick` into fields 0 and 1 of record `count`, increments `count`, and returns the record's
  offset into `data`. The caller writes the remaining fields at `offset + 2 ..`.
- `step` sets `count = 0` before its first phase. Events from `createWorld` stay until the first `step`.
- `readEvents(ring)` returns `count`; callers read `ring.data` directly. Nothing is allocated.

| Type                 | Fields 2 .. 11                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AgentBorn`          | `slot`, `genomeId`, `lineageId`, `spec`, `parentA`, `parentB`, `cause`, `sex` (field 9)                                |
| `AgentDied`          | `slot`, `genomeId`, `cause`, `by`, `spec`, `lineageId`, `ageTicks`, `foodEnergy`, `biteEnergy`, `prevBiter` (field 11) |
| `BirthBlocked`       | `slot` (the mother or splitter), `cause`                                                                               |
| `PopulationFloor`    | `added`                                                                                                                |
| `AlarmCalled`        | `slot`, `genomeId`, `spec`, `x`, `y`                                                                                   |
| `SmokeReleased`      | `slot`, `genomeId`, `spec`, `x`, `y`, `cloud`                                                                          |
| `PackCalled`         | `slot`, `genomeId`, `spec`, `x`, `y`                                                                                   |
| `SmokeRefused`       | `slot`, `genomeId`                                                                                                     |
| `FoodPatchesCreated` | `count`, `radius` (pushed once by `createPatches`, only when `foodPatchCount` is above 0)                              |
| `SeasonChanged`      | `season` (the index now starting), `year` (zero-based)                                                                 |
| `DroughtStarted`     | `basin` (0 west, 1 east), `year`                                                                                       |
| `LineProven`         | `slot` (the child), `genomeId`, `parentA`, `parentB`, `lineageId`; debug level in `drainEvents` (`proof.js`)           |
| `AgentSickened`      | `slot`, `genomeId`, `dose`; debug level, once on crossing `sickDose`                                                   |

Unused fields are 0. `prevBiter` is the second-last biter when the death is `eaten` and that bite was at most `packWindow`
ticks before the death, else 0. The four call events are debug level; `FoodPatchesCreated`, `SeasonChanged`, and `DroughtStarted` are info level in `drainEvents`. `createConfig` requires `eventCapacity >= 8 x maxAgents + 2 x floraPatchMax`
(the per-slot budget includes calls, sickness, death and birth events).

## Energy - `energy.js`

- `addEnergy(world, slot, amount, source)`: stores `min(amount, maxEnergy - energy)`; adds the stored amount to
  `ledger[0]` when `source` is external (food, initial, floor, immigrant) and returns it.
- `removeEnergy(world, slot, amount, cause)`: removes `min(amount, energy)`, so energy never goes below 0; adds the
  removed amount to `ledger[1]`, sets `lastLoss = cause` when it removed more than 0, and returns it.
- `transferEnergy(world, giver, receiver, amount)` moves energy between agents without touching the ledger, and
  returns what the giver lost, and sets `world.transferGained` (not hashed) to what the receiver stored; the caller
  sets `lastLoss` and `lastBiter` for a bite and adds `transferGained` to the biter's `biteEnergy`. The giver loses
  `t = min(amount, giver energy)`, the receiver gains `min(t, maxEnergy - receiver energy)`, and any remainder goes to
  `ledger[1]`. Bites, child gifts (`energy x childEnergyShare`) and split halves are transfers.
- The agent arrays `foodEnergy` and `biteEnergy` accumulate the amounts actually stored: the feeding code adds
  `addEnergy`'s return value and `transferGained`.
- Food the eater cannot hold is left out of the ledger: food energy only enters the ledger once an agent stores it.
- At death the dead agent's remaining energy goes to `ledger[1]` before `freeAgent`.
- Temperature is not energy: `gainTemperature(world, slot, amount)` in `temperature.js` adds `amount` and caps at
  `temperatureMax`, and touches no ledger.
- `size` is recomputed after every change to `energy`: `max(minSize, baseSize + energy / energyToSize)`.

## Placement - `spawn.js`

`js/sim/spawn.js` (Phase 1) holds the placement shared by `createWorld`, `food.js` and `population.js`:

- `placeClear(world, rng, radius)` draws `x = radius + nextFloat x (worldWidth - 2 radius)`, then `y` the same way,
  and accepts the first point whose distance to every obstacle centre is at least `obsRadius + radius`. After
  `placementTries` rejections it throws, naming the tick and the radius. The point is written to `world.point`
  (`Float64Array(2)`).
- `placeTerrain(world)` (`terrain.js`) uses the `obstacles` stream and writes the static rocks: the wall at
  `worldWidth / 2`, `wallShape(config).count` rocks of radius `step` (touching) with `wallGaps` gaps of whole rocks, one
  gap start drawn per equal band along the wall (`wallGaps` draws, `nextFloat x (band - gapRocks + 1)`); then the
  refuges, alternating west and east, in groups of `refugeCluster` rings that share a band and sit in a row (a group's band and first centre are drawn as one ring's are), each a ring of `REFUGE_ROCKS` (8) rocks of radius `REFUGE_ROCK_RADIUS` (50) at a
  `ringRadius` that leaves gaps as wide as `refugeSizeMax`, its centre drawn as `x` then `y` (two draws per refuge).
- `createPatches(world)` (`food-patches.js`) follows `placeTerrain` on the `food` stream: per patch one draw for x and
  one for y, x inside the patch's basin (`basinPatchX`: even patches west, odd east, discs clear of the wall) under
  `basins` and anywhere inside `[foodPatchRadius, worldWidth - foodPatchRadius]` otherwise, y in the same margin; stock
  starts at `foodPatchCapacity`. It pushes `FoodPatchesCreated` when `foodPatchCount` is above 0.
- `spawnFoodItem(world)` takes the lowest free food slot and calls `spawnFloraItem`. With live mycelium marks it draws the fungus chance (`fertileZoneSpawnChance x fruitWeight`), then a size-weighted mark on success. A refused mark is drawn again as patch/background. Otherwise a patch/background draw uses `foodBackgroundShare`, then `pickPatch` draws over `patchWeight` in slot order. Zero total weight gives background grass. Placement draws distance then angle inside a disc, or x then y uniformly. Last, energy is `foodEnergy x (source energy + (2 nextFloat - 1) x energySpread)`. The item copies the source's species, hue, life and patch, with age 0 and `foodKind` plant. Phase 1 sets `foodTox` 0.
- `spawnAgent(world, policy, cause)` uses the `spawn` stream: allocates the slot; sets `genomeId = nextId++`,
  `lineageId = genomeId`, `parentA = parentB = 0`; spec from `policy.initSpec`, else `nextInt(spawn, 5)`; then `drawSex` (one `lifecycle` draw); then
  `policy.initBrain` with the `brain-init` stream; then `applyGenes`; then the position by `placeClear` with the radius for
  `initialEnergy` (the slot's `baseSizeOf` plus `initialEnergy / energyToSize`), `angle = nextFloat x 2 PI - PI`, zero velocity, `ateTimer = bittenTimer = TIMER_CAP`, `temperature = temperatureStart`, energy by
  `addEnergy` (`entrantEnergy` for a floor entrant, `initialEnergy` for the initial population); then pushes `AgentBorn` with the sex in field 9.
- `createWorld(config, policy)` lives here, not in `world.js`, so that `spawn.js` can import `world.js` without a
  cycle: it calls `allocateWorld(config)`, forks the streams, then places the terrain, then the food
  patches, then `initialFood` food items, then `initialAgents` agents with cause `initial`.

## Tick details

### Order inside phases

- `STEP_PHASES` runs `environment` (`updateSeason`, `advanceEra`), `hash`, `sense`, `brain`, `signal`,
  `physics` (`actAll`, `integrate`, `buildHash`, `resolveContacts`), `lifecycle` (`feed`, `mate`, `applyCosts`,
  `advancePregnancies`, `tallyReady`, `splitAll`, `reap`, `fillFloor`), `field` (`regrowPatches`, `spawnFood`, `ageFood`,
  `decayFertileZones`, `updatePheromones`, `ageSmoke`), `merit` (`meritPhase`) and `invariants`.
- Each function visits slots `0 .. maxAgents - 1` and acts on a slot if it is alive when visited. An agent born
  earlier in the same function at a higher slot is visited; one at a lower slot is not.
- `applyCosts`, per alive agent: `ageTicks += 1`; `cooldown = max(0, cooldown - 1)`;
  `ateTimer = min(TIMER_CAP, ateTimer + 1)`; the same for `bittenTimer`; then `stepTemperature(world, slot)`; then the
  cost by `removeEnergy` with cause `cost`, whose passive and size terms are multiplied by `passiveMultiplier` of the
  stepped temperature. The passive term adds `passiveLoss x visionCost x (vision - 1)` for an agent whose vision trait is
  above 1, and a `canHunt` agent pays `huntUpkeep` once per tick while `specMutationRate`
  is above 0. A newborn's first increment is on the tick after its birth.
- `advancePregnancies`: `pregnancy -= 1` where it is above 0; at 0, the birth is attempted.
- `reap`, per alive agent: `ageTicks >= maxAgeTicks` dies of `old-age` first; otherwise energy at 0 dies of the
  cause mapped from `lastLoss` (none or `cost` to `starved`, `bite` to `eaten`, `collision` to `collision`). `by` is
  `lastBiter` for `eaten`, else 0. After the event, the death hook and the ledger entry, `leaveCarcass` fills the
  lowest free food slot with a meat item when the agent took in energy (below), then the fertile
  zone and mycelium mark are added and the slot freed.
- `fillFloor` (the floor as a total-extinction guard, natural-selection T3): returns while `population >= min(floorTrigger,
minAgents)`. Below it, it spawns `FLOOR` agents until `population === minAgents` and pushes `PopulationFloor` once, with
  `added` (the agents added) and the population before the refill. Between `floorTrigger` and `minAgents` nothing is
  added, so a basin may go extinct and be recolonised through the wall gaps. There is no timed immigrant, no invasion
  pulse and no predator rescue; `immigrationInterval`, `invade`, `rescuePredators`, `InvasionArrived` and
  `PredatorRescue` were deleted.
- Bite cost and recoil (natural-selection T5a, T5b). `applyBite` (`feeding.js`) charges the biter, through `removeEnergy`
  with loss cause `cost`, `biteCost x (victim size / biter size) x (0.5 + victim energy / maxEnergy) x kickMultiplier` of the
  victim's specialisation, read before the bite moves energy, for every bite that lands. A `canHunt` agent with `BITE`
  above 0 touching an agent `couldBite` refuses (kin, or too large) loses `recoilEnergy` once per tick, with loss cause
  `cost`; a per-slot tick stamp (derived, not hashed) keeps it to once.
- Predator economy keys (fitness-and-selection T15f). `applyBite` (`feeding.js`) pays `predatorKillEnergy` to the biter,
  through `addEnergy` with source `ENERGY_SOURCE.KILL` (booked in `ledger[0]`, capped at `maxEnergy`), when the bite takes
  its victim from above 0 to 0 energy; a victim already at 0 pays nothing. `tickCost` (`energy.js`) multiplies the standing
  term (`passiveLoss`, the size term and the vision term, before the temperature factor) by the specialisation's
  `passiveLossMultiplier`, read from the `specParams` entry it already holds. `readyToSplit` (`reproduction.js`) compares
  energy with `world.splitMinBySpec[spec]`, the table `splitMinEnergy x splitMinEnergyMultiplier` built once in
  `allocateWorld`, as `biteBySpec` is. At 0 and 1 each is the old arithmetic exactly, so no `worldHash` moves.
- `ateTimer` and `bittenTimer` reset to 0 when the agent eats or is bitten.

### Motion and body inputs

- `actAll`: `turnRate = out2 x maxTurn x turnBySpec[spec]`; `angle += turnRate`, then `angle -= 2 PI` when `angle >= PI` or
  `angle += 2 PI` when `angle < -PI` (one conditional); thrust `out1 x maxThrust x thrustEfficiency(config, temperature)`, times `1 + sprintMultiplier x sprintBySpec[spec]` when
  sprinting, and times `handlingThrust` while `ateTimer < handlingTicks` (`handlingTicks` 0 never matches), is added to
  `vx`, `vy` along the new heading.
- `integrate`: `vx *= damping`, `vy *= damping`; when `speed = Math.sqrt(vx x vx + vy x vy)` exceeds the cap,
  `s = cap / speed`, `vx *= s`, `vy *= s`; then `x += vx`, `y += vy`.
- `stepTemperature`: `speed = Math.sqrt(vx x vx + vy x vy)` of the velocity left by `integrate` and
  `resolveContacts`; `loss = max(0, 1 - seasons[world.season[0]].temperatureModifier x temperatureSeasonSlope)`;
  `next = temperature + min(speed / maxVelocity, 1) x temperatureGainMove - temperatureLossPassive x loss x cold`, clamped to
  `0 .. temperatureMax`, where `cold` is `coldFactor(config, y)` under `basins` (2 when `y < coldMarginWidth` or
  `y > worldHeight - coldMarginWidth`, else 1) and 1 otherwise. `actAll` runs before `applyCosts`, so it reads the temperature of the end of the previous tick.
- Body inputs 14 to 17 (0-based offsets 13 to 16 from the start of the body block) come from `temperatureInputs(config, t, out,
offset)`: `t / temperatureMax`; `min(abs(t - middle) / (temperatureMax / 2), 1)` with `middle` the mean of
  `temperatureOptimalMin` and `temperatureOptimalMax`; cold stress, 1 below `temperatureColdStress`, else
  `(temperatureColdModerate - t) / (temperatureColdModerate - temperatureColdStress)` below `temperatureColdModerate`,
  else 0; heat stress, 1 above `temperatureHeatStress`, else
  `(t - temperatureHeatModerate) / (temperatureHeatStress - temperatureHeatModerate)` above `temperatureHeatModerate`,
  else 0.
- Body inputs 2 and 3: forward `(vx x cH + vy x sH) / maxVelocity`, lateral `(-vx x sH + vy x cH) / maxVelocity`.
- Body inputs 18 to 30 (offsets 17 to 29 from the start of the body block) are the scent and call inputs of `scent-inputs.js`
  (`writeScentInputs`, called from `senseAll`): danger, attack and hunt sampled at the two antennae, and the loudest heard
  alarm and hunt call with their ahead and side components. The antennae sit `antennaReach` from the agent at the heading
  plus and minus `antennaAngle`. [predator-prey.md](predator-prey.md) lists every offset.
- Body inputs 31 to 33 (offsets 30 to 32 from the start of the body block, `BODY_INPUT`): `sex` (0 female, 1 male)
  and last tick's `MEMORY_A` and `MEMORY_B` outputs. There are no season inputs: the body block is 33 inputs.
  `writeBodyInputs` writes offsets 0 to 16 and 30 to 32. The block sits at `rawBodyStart` in the raw `inputs` row and at
  `POOLED_VALUES` (50) in the pooled row.
- The season: `seasonAt(world, tick)` in `environment.js` writes the index and phase into `world.season`
  (`Float64Array(2)`, not hashed); `updateSeason` calls it once per tick. The year is `yearTicks(config)`: `4 x eraSeasonTicks`, so every rule keyed by season index or
  phase - `foodScarcity`, `energyDrain`, `reproductionBonus` and `temperatureModifier` - stretches with it.
- Eras (`eras.js`): `advanceEra` runs in the `environment` phase after `updateSeason`. On every
  tick above 0 divisible by `eraSeasonTicks` it pushes `SeasonChanged` (`world.season[0]`, the zero-based year
  `floor(tick / (4 x eraSeasonTicks))`) and updates `world.era[0]`: outside summer it becomes -1; at the start of summer
  one `food` draw `< droughtChance` starts a drought, and a second `food` draw (`< 0.5` west) picks the basin, pushing
  `DroughtStarted` (basin, year). A basin is the half of the world on one side of `worldWidth / 2` (0 west, 1 east).
  `regrowPatches` multiplies each patch's `foodPatchRegrow` by `patchRegrow` and `patchRegrowFactor`: 0 for a patch in the drought basin,
  else `winterRegrow` in winter, 1.5 in summer, 1 otherwise.

### Feeding

Plant item expiry uses its copied `foodLife`; meat expiry uses `carcassTicks`. The field phase ages mycelium, regrows patches, refreshes fruiting weights, then spawns and ages food.

- `feed` visits alive agents in ascending slot. Each eats every alive food it overlaps, found through `cellRange`
  of its circle, cells ascending and entries in cell order. Food is removed when eaten even if the eater stored
  only part of it. `tryEat` skips an item when the eater's share is 0 (`plantFoodBySpec` for plant, `meatFoodBySpec`
  for meat; the item stays) or `canEatNow` is false: energy at or above `satiationShare x maxEnergy` (when `satiationShare`
  is above 0), or `ateTimer < digestTicks`. The stored amount is `foodValue x share`. Eating a plant item calls
  `depletePatchAt`: the nearest patch whose disc holds the item (lowest index on ties) loses `foodPatchDepletion`
  stock, floored at 5% of `foodPatchCapacity`; meat depletes nothing.
- Eating raises the eater's temperature by `temperatureGainEat x stored / foodEnergy` (`stored` is what `addEnergy`
  returned), and a bite raises the biter's by `temperatureGainEat x transferGained / foodEnergy`; both through
  `gainTemperature`. The victim's is unchanged.
- Eating runs over all agents first; then bites run over the contact list in list order.
- A bite lands only when `canBite` (`js/sim/bite-rule.js`) holds: `couldBite` (the biter's specialisation can hunt, the
  two are not kin and `size[biter] > huntSizeRatio x size[victim]`) and the victim's centre lies within `biteArc` of the
  biter's heading (`cos(bearing - angle) >= cos(biteArc)`). It moves `biteEnergy x biteBySpec[biter] x biteTakenMultiplier` with `transferEnergy`; the victim's `lastLoss` becomes `bite` and
  its `lastBiter` the biter's `genomeId`.

### Kin

`js/sim/kin.js` exports `isKin(world, a, b)`, used by `ray-march.js` and `feeding.js`. Agents `a` and `b` are kin
when `parentA[a]` or `parentB[a]` equals `genomeId[b]`, or the reverse, or they share a non-zero parent id.
Grandparents and cousins are not kin.

### Spatial hash

- `cols = Math.ceil(worldWidth / hashCellSize)`, `rows` the same; a coordinate maps to
  `Math.floor(v / hashCellSize)` clamped to `0 .. cols - 1` (or `rows - 1`). Cell index is `row x cols + col`.
- `cellRange(hash, x, y, r)` writes `[col0, row0, col1, row1]` for the box `x - r .. x + r`, `y - r .. y + r` into
  `hash.range` (`Int32Array(4)`) and returns it.
- `buildHash` is a counting sort: count per cell, prefix sums, then insert. Agents go in first, ascending slot, as
  ids `slot`; then food, ascending slot, as ids `maxAgents + slot`. Within a cell, entries keep that order.
- A pair is resolved only in the cell `(colOf(max(minX_i, minX_j)), rowOf(max(minY_i, minY_j)))`: the lower-left
  corner of the two bounding boxes' intersection. The boxes are the ones at build time: `buildHash` stores each
  entry's `minX` and `minY`, computed in float64, in `hash.boxX` and `hash.boxY` (`Float64Array`). The overlap test uses current positions.
- `hash.range` is shared: a caller finishes with one `cellRange` result before calling it again.

### Agent contacts

For each agent pair `i < j` with distance `d < r_i + r_j`, in cell-scan order (cells ascending, then entries in
cell order):

1. Append `(i, j)` to the contact list (throw past `maxContacts`).
2. Normal `n = (x_j - x_i, y_j - y_i) / d`; when `d === 0`, `n = (1, 0)`. Masses `m = size^2`.
3. `vn = (v_j - v_i) . n`. When `vn < 0`: `J = -(1 + restitution) vn / (1 / m_i + 1 / m_j)`, `v_i -= J n / m_i`,
   `v_j += J n / m_j`.
4. Penetration `p = r_i + r_j - d`: `i` moves by `-n p m_j / (m_i + m_j)` and `j` by `+n p m_i / (m_i + m_j)`.

Each pair is applied before the next is examined. Then every agent's centre is clamped to `[r, W - r]` and
`[r, H - r]`, with no velocity change and no damage.

### Walls and obstacles

In `integrate`, after moving:

- Wall: for each axis, `x < r` sets `x = r`, and when `vx < 0` sets `vx = -vx` and applies `wallDamage`; `x > W - r`
  mirrors it with `vx > 0`. Damage is applied once per tick even when two walls are hit.
- Obstacle: for each obstacle in index order, `d < R + r` pushes the agent out along `n = (agent - obstacle) / d`
  (`(1, 0)` when `d === 0`) to distance `R + r`. When `vn = (v_agent - v_obstacle) . n < 0`, `v_agent -= 2 vn n` and
  `obstacleDamage` applies. An agent touching while moving away takes none.
- Obstacles are static rocks; none moves (the wandering obstacles and `moveObstacles` were deleted).

### Rays

- `allocateWorld` builds `world.rayCos` and `world.raySin` (not hashed): `detCos` and `detSin` of
  `2 PI k / rayCount`. Each tick, with `cH = detCos(angle)` and `sH = detSin(angle)`, ray `k` has
  `dx = cH x rayCos[k] - sH x raySin[k]` and `dy = sH x rayCos[k] + cH x raySin[k]`. Its origin is the agent centre
  and its length is `visionOf(world, slot)`: the specialisation's `visionRange`, times the slot's `vision` trait.
- Ray-circle: with `ox, oy` the origin minus the circle centre, `b = dx x ox + dy x oy`,
  `c = ox x ox + oy x oy - R x R`; no hit when `b x b - c < 0`; else `t = -b - Math.sqrt(b x b - c)`, and 0 when
  `t < 0` and `c <= 0`; a circle with `t < 0` and `c > 0` is behind the ray.
- `distance` is from the centre to the hit surface: the smaller root of the ray-circle intersection, or 0 when the
  origin is inside the circle. The agent never hits itself.
- `gatherNear` (`ray-gather.js`) collects once per casting agent every circle one of its rays could hit - the
  obstacles (static rocks included) and live clouds, then the agents and food in the hash cells under the vision box,
  never the caster - into `world.rayLocal`, keeping a circle whose surface lies within the ray length of the origin; each
  ray then tests only those.
- Equal distances are broken by kind (food, agent, obstacle, wall), then by lower index.
- A wall hit's distance is to the nearest boundary line the ray crosses within `visionRange`.
- The agent class is `couldBite` (`js/sim/bite-rule.js`), the bite rule `feed` uses without the jaws: the biter's
  specialisation can hunt, the two are not kin and the biter is bigger than `huntSizeRatio` times the victim. A hunter
  reads as a threat from any angle; a rival that is bigger but cannot hunt is "other". `feed` uses `canBite`, which
  adds that the victim is in the biter's jaws. `writeRay`
  sets the hit's class channel to the proximity (the hit's `1 - distance / visionRange`) for an agent and to 1 for
  food, wall, obstacle and smoke.
- There are `RAY_CHANNELS` (9) values per ray; channel 8 is smoke. `testClouds` tests the live smoke clouds and offers the
  nearest as kind `SMOKE`, ranked after `WALL` on a tie; a smoke hit hides everything behind it. It returns at once when
  `cloudCount` is 0.

### `world.inputs` as a read API

`world.inputs` is the brain's input matrix: `maxAgents` rows of `layout.inputCount` floats. The observers, the scripted
controllers, the snapshot rays and the inspector read it; only the sense phase writes it.

| Part                 | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout               | Row `slot` starts at `slot x layout.inputCount`. Ray `k` owns `RAY_CHANNELS` values from `k x RAY_CHANNELS`; the body inputs follow at `rayCount x RAY_CHANNELS` (see Motion and body inputs)                                                                                                                                                                                                                                                                                                                                                                   |
| Ray channels         | Channel 0 is the proximity, `1 - distance / visionRange`, 0 for a miss. Channels 1 to 8 are food, "can bite me", "I can bite it", other non-kin agent, kin, wall, obstacle and smoke; at most one of 1 to 8 is nonzero on a ray. The four agent classes come from `agentChannel` in `js/sim/ray-march.js`: kin first, else "can bite me" when `couldBite(world, other, slot)`, else "I can bite it" when `couldBite(world, slot, other)`, else other. Agent class channels carry the hit's proximity, while food, wall, obstacle and smoke carry 1 (`writeRay`) |
| Class test           | A reader asks whether a class channel is nonzero (`> 0`), never whether it equals 1, and takes the distance from channel 0                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Valid from, until    | Written by the `sense` phase and read by `brain`; after `step` returns, the row holds what the agent perceived at the start of that tick, before motion. It stays until the next `sense` overwrites it                                                                                                                                                                                                                                                                                                                                                          |
| Dead or newborn slot | `freeAgent` zeroes the row, so a slot freed this tick reads all zeros. An agent born this tick has a zero row until the next tick's `sense`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Hash                 | `inputs` is left out of `hashWorld`; a reader never stores it in any hashed array                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Writers              | Only `castRays`, `writeBodyInputs` and `writeScentInputs` write it; a policy or observer that needs a changed copy copies the row                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Brain

Row layout, all row-major:

| Block       | Index of weight                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `wIn`       | `i x brainHidden + j` (input `i` to hidden `j`)                                                   |
| `wRec`      | `k x brainHidden + j` (hidden `k` to hidden `j`)                                                  |
| `bHidden`   | `j`                                                                                               |
| `wOut`      | `j x geneOutputs + g` (gene column `g` drives output `GENE_OUTPUTS[g]`, every output but `SPLIT`) |
| `bOut`      | `g`                                                                                               |
| `wSkip`     | `i x geneOutputs + g` (pooled value `i`, `i` below `POOLED_VALUES`, to gene column `g`)           |
| trait genes | `traitStart + t`, `t` from `TRAIT_INDEX`: `SIZE` 0, `VISION` 1, `CHILD_SHARE` 2, `LEARN` 3        |
| leak genes  | `leakStart + j`, one per hidden unit                                                              |

`OUTPUT_COUNT` is 11 (`OUTPUT_INDEX`: thrust 0, turn 1, sprint 2, mate 3, bite 4, alarm 5, smoke 6, hunt 7, `SPLIT` 8,
`MEMORY_A` 9, `MEMORY_B` 10), `EXTRA_INPUTS` 33, `POOLED_VALUES` 50 and `TRAIT_GENES` 4, so `weightCount = inputCount x H + H x H + H + H x G + G + POOLED_VALUES x G + TRAIT_GENES + H` with `G = geneOutputs` = 10 (`OUTPUT_COUNT` less `SPLIT`, which has no genes and reads 0):
83 inputs (`inputCount = POOLED_VALUES + EXTRA_INPUTS`: 48 ray values, two food hues then the 33 body inputs) and 4578 weights at the defaults; the raw `inputs` row of `rayCount x RAY_CHANNELS + EXTRA_INPUTS` = 177 values is what `poolRays` (`ray-pool.js`) reads. For each of the eight ray channels, `poolRays` keeps the two rays with the largest proximity (the first ray wins a tie) as (strength, cosine, sine of the ray's angle in the agent's frame), strongest first; an unused slot is 0. The two matching food hues follow the 48 ray values. It allocates nothing. The genes after `bOut` never enter the sums below. The blocks follow each other in that order. For each hidden unit `j`, the sum is a float64 that starts at
`bHidden[j]`, then adds `wIn[i, j] x x_i` for `i` ascending, **skipping every `i` whose input is exactly 0**, then
`wRec[k, j] x h_k` for `k` ascending. `h'_j = Math.fround(detTanh(sum))`. Outputs sum `bOut[o]` then
`wOut[j, g] x h'_j` for `j` ascending, then (the skip block, genome only) `wSkip[i, g] x pooled_i` for the nonzero pooled values `i` ascending, then `detTanh`; the `SPLIT` output's sum is 0.

- The hidden update is `h'_j = Math.fround((1 - a_j) x h_j + a_j x detTanh(sum))`, `a_j` being
  `leakRate[slot x H + j]` = `LEAK_MIN + (1 - LEAK_MIN) x detSigmoid(leakGene_j)` with `LEAK_MIN` the `leakMin` key (default 0.02), and `h_j` the unit's value
  from the previous tick.
- With `hebbianRate` above 0, the output sums read `fastOut[slot x H x G + j x G + g]` in place of
  `wOut[j, g]` (`bOut` still comes from `weights`). After the outputs of a slot, `hebbianStep` sets, for `j` then `o`
  ascending, `fastOut[j, o]` to `min(HEBB_CLAMP, max(-HEBB_CLAMP, f + eta x (h'_j x out_o - HEBB_DECAY x (f - w[j, o]))))`
  with `f` the old value, `w` the genome's `wOut` block, `eta = hebbianRate x detSigmoid(learnGene)`, `HEBB_DECAY` 0.01 and
  `HEBB_CLAMP` 4. `world.weights` never changes during a life.
- `applyGenes(world, slot)` runs after every write of a weight row (`spawnAgent`, `giveBirth` after `childBrain`,). It sets `vision = traitValue(visionGene)`, `baseSize = baseSize x
traitValue(sizeGene)` and `childShare = childEnergyShare x traitValue(childShareGene)`, `traitValue(g) = 1 + TRAIT_SPAN x
detTanh(g)` with `TRAIT_SPAN` 0.3. With `hebbianRate` above 0 it copies the genome's `wOut` block into `fastOut` and it fills the slot's `leakRate`. `visionOf`, `baseSizeOf` and `childShareOf` in `traits.js` read the trait values.
- `geneticDistance(world, a, b)` in `genetics.js` is the mean over `SIMILARITY_DIMS` (64) sampled weight indices
  `(k x 7919) mod traitStart` of `abs(w_a - w_b) x invSd`, with `invSd = Math.sqrt(inputCount + H)` for an index below
  `bHidden`, `Math.sqrt(POOLED_VALUES)` for an index at or above `wSkip`, and `Math.sqrt(H)` otherwise, summed left to right. Any loop nesting is allowed as long as each sum adds its terms
  in exactly this order. The zero-skip is part of the contract: adding `+0` to `-0` changes the sign bit.

### Food, zones and pheromones

- `spawnFood` draws one `nextFloat` for the fraction every tick, even when the fraction is 0, and spawns
  `min(free food slots, whole + (draw < fraction ? 1 : 0))`. The expected count is the population rule from the Config
  table, `foodRegrowPerArea x worldWidth x worldHeight x foodScarcity / 1000000`
  (no population term). Meat counts toward `foodCount` and so toward `maxFood`.
- `regrowPatches` (first in the `field` phase) sets each patch's stock to
  `min(foodPatchCapacity, s + foodPatchRegrow x factor x s x (1 - s / foodPatchCapacity))`, with `s` the stock clamped to
  `[0.05 x foodPatchCapacity, foodPatchCapacity]` and `factor` from `patchRegrowFactor` (1 without eras). It draws nothing.
- `ageFood` adds 1 to each alive food's age, then removes food whose age exceeds `foodMaxAge` (`carcassTicks` for meat).
- `leaveCarcass(world, slot)` writes, into the lowest free food slot (no draw; nothing when none is free), a meat item
  at the dead agent's position with radius `size[slot]`, age 0 and value `carcassShare x (foodEnergy + biteEnergy)` of the
  agent, when that value is above 0. The energy enters the ledger when eaten, like plant food.
- A death adds a zone with `zoneInitial = zoneFertility = size x fertileZoneFertility`. When all `fertileZoneMax`
  slots are alive it replaces the zone with the lowest `zoneFertility / zoneInitial`, lowest index on a tie.
- `decayFertileZones`: `zoneFertility -= fertileZoneDecay x zoneInitial`; a zone at or below 0 is freed.
- Pheromone deposit: `min(pheromoneMax, cell + pheromoneDeposit)` at the depositor's cell. `hunt` is a third grid with the
  same decay and diffusion; a hunt call deposits on it, an alarm on `danger`.
- `signalAll` (calls, hearing) and `ageSmoke` (clouds) are described in [predator-prey.md](predator-prey.md); smoke does
  not affect contacts, bites, scent or hearing.
- `updatePheromones`, per grid: every cell `v = v x (1 - pheromoneDecay)`; copy into the scratch grid; then each cell
  becomes `s[c] - (D / 4) n(c) s[c] + (D / 4) sum of s over its neighbours`, where `D` is `pheromoneDiffusion`, `n(c)`
  is its count of in-grid four-neighbours, and `s` is the scratch grid. The total is conserved apart from decay.

### Mating and births

- `mate` walks alive slots `a` in ascending order. For each `a` that is ready (`readyToMate`; `isReadyToMate` is false when `temperature < temperatureColdStress` or `temperature > temperatureHeatStress`, and the block draws nothing), only a ready female (`sex` `female`) searches. `findMale` scans the same cells, in the same order and with the same first-cell
  rule and gap test, for any alive male `b` (a lower slot too) that passes `canMatePair`, and keeps the one with the highest `mateRank` (`mate-rank.js`: his percentile among the living males of his own specialisation,
  `refreshMateRanks` every 100 ticks), the lower slot on a tie. Then one `lifecycle` `nextFloat` against `chance` decides whether they mate; no
  candidate means no draw. The female is the mother whatever her slot: `startMating(world, policy, mother, father)`.
  A male is limited only by `mateCost` and his cooldown.
- `canMatePair(a, b)` holds when both are `readyToMate`, share a `spec`, differ in sex, have a size
  ratio within `1 / mateSizeRatio .. mateSizeRatio`, the pair's mother (`motherOf`: the lower slot, or the female) has
  not spent her birth budget and holds more than `childEnergyMin / childShareOf(mother)`, and
  `geneticDistance(a, b) < mateDistanceMax` (always true for `Infinity`). `test/sim/helpers/mate-search-reference.js` is
  the O(n^2) reference for both searches.
- The birth budget (`birth-budget.js`, only when `maxBirthsPerWindow` is above 0): `birthRing` keeps, per slot, the last
  `maxBirthsPerWindow` birth ticks plus one (0 is empty). `birthBudgetSpent` holds when the oldest entry is non-empty and
  `tick - (entry - 1) < birthWindowTicks`; `recordBirth` overwrites the oldest entry. A spent mother can neither be the
  mother in `canMatePair` nor split.
- The mating draw is one `lifecycle` `nextFloat`, drawn only for pairs that pass every other condition. Readiness is
  re-checked for every `a` and `b`, so no agent is in two matings in one tick.
- Each pays `mateCost` with `removeEnergy` (cause `cost`) and sets `cooldown` to
  `reproductionCooldown x cooldownMultiplier` rounded down. The mother copies the father's `weights` row into
  `fatherWeights` and sets `fatherId`, `fatherLineage` and `pregnancy = pregnancyTicks`; then `policy.onMate`.
- A birth needs `population < maxAgents` (else `BirthBlocked` `capacity`) and a gift `energy[mother] x childShareOf(mother)`
  of at least `childEnergyMin` (else `energy`). The child takes the gift by transfer, `parentA` is the mother's `genomeId`, `parentB`
  `fatherId`, `lineageId` the mother's.
- A split needs `readyToSplit`: mature, not pregnant, off cooldown, energy above `splitMinEnergy`, the budget not spent,
  whatever the sex (world-balance T69). A free slot is required
  (else `BirthBlocked` `capacity`); the child takes `energy / 2` by transfer, both parents
  are the splitter, and the cooldown is `reproductionCooldown x cooldownMultiplier x splitCooldownMultiplier`
  rounded down.
- A birth runs these steps in order: `childSpec` (the mother's `spec`; with `specMutationRate` above 0, one `mutation`
  `nextFloat` and, when it is below the rate, a `mutation` `nextInt(4)` that picks another specialisation), `drawSex`
  (one `lifecycle` draw), `recordBirth`, `policy.childBrain`, `applyGenes`, the energy transfer,
  child placement, `AgentBorn` with the sex in field 9.
- Child placement: `theta = nextFloat x 2 PI` on `lifecycle`; centre at the parent's plus `(r_parent + r_child)` along
  `theta`, clamped to `[r, size - r]`; `angle = theta - PI` wrapped; zero velocity; timers at `TIMER_CAP`; `temperature = temperatureStart`.
- `childBrain` gets `world.birthOptions`, one object reused for every birth: its `cause` and `rng` (the `mutation`
  stream) are set before each call.

## `cloneWithNoisePolicy(options)`

- `options.mutationSigma` (default `0.02`) and `options.initScale` (default 1) are named defaults in
  `birth-policy.js`.
- `initBrain`: `wIn` and `wRec` weights are `nextGaussian x initScale / Math.sqrt(inputCount + brainHidden)`, `wOut`
  `nextGaussian x initScale / Math.sqrt(brainHidden)`, `wSkip` `nextGaussian x initScale / Math.sqrt(POOLED_VALUES)`, biases, trait genes and leak genes 0, in row order (a leak gene of 0
  is a rate of about 0.51; `randomWeights` in `js/evo/mutation.js`, used by the evolving policies, starts leak genes at `leakGeneStart`, 0).
- `childBrain`: the child row is the mother's `weights` row plus `nextGaussian x mutationSigma` per weight (trait and
  leak genes included), in row order. The father is ignored: the reference policy is asexual.

## `hashWorld`

FNV-1a over raw little-endian bytes, in this order:

1. `tick`, `nextId`, `population`, `foodCount`, `cloudCount`, as one `Uint32Array(5)`.
2. Each agent array, whole (every slot, alive or not), in the design doc's World state table order (`temperature` follows `lastLoss`; then `lastBiteTick`, `prevBiter`, `prevBiteTick`, `alarmTimer`, `huntTimer`, `smokeTimer`, `heard`). `hidden` is
   hashed without its scratch row. `inputs` and `outputs` are left out: they are recomputed every tick. After the
   agent arrays, and before `hidden`, come the merit arrays (`meritSpecs()` order, always hashed), then the arrays a feature adds, in this order:
   `fastOut` (`hebbianRate` above 0); the input-activity `samples` (one `Float64`) then `active` (`weightDecay` above 0); `vision` then `baseSize`; `birthRing` (`maxBirthsPerWindow` above
   0); `sex`.
3. Food, obstacles, zones, in the order of this file's Arrays table (the obstacle arrays cover every slot, rocks included, and `foodKind` follows `foodAge`); then `danger`, `attack`, `hunt`, `cloudX`, `cloudY`, `cloudTtl`, then `patchX`, `patchY`, `patchStock` when `foodPatchCount` is above 0, then `ledger`, then `era`.
4. The six RNG streams' `s` arrays, in the Determinism table order.

The result is `fnv64Hex`. The `world-hash` test changes one element of each covered array and expects a different
hash, and changes `inputs` and expects the same one.

## `snapshot.js`

`snapshotLayout(config)` returns `{ bytes, headerWords, agentStride, foodStride, obstacleStride, cloudStride, rayStride }`.
`bytes` covers every part at its maximum, rays included. The buffer is one `ArrayBuffer` read through a `Float32Array` and
a `Uint32Array` view; `writeSnapshot(world, views, withRays = false)` writes it and allocates nothing:

| Words                                                     | Contents                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header, 6 (`Uint32`)                                      | `tick`, agent count, food count, obstacle count, cloud count, ray count written (0 or `rayCount`)                                                                                                                                                  |
| Agents, `agentStride` 12 each, alive only, ascending slot | `x`, `y`, `angle`, `size`, `energy / maxEnergy` (`Float32`); `spec`, `lineageId`, `genomeId`, `slot` (`Uint32`); `temperature / temperatureMax`, `speed` (`Float32`); `flags` (`Uint32`, `SNAPSHOT_FLAG`)                                          |
| Food, `foodStride` 4 each, alive only                     | `x`, `y`, `radius`, `age01` (`Float32`); the radius is negative for a meat item (`FOOD_KIND.MEAT`), so the layout does not depend on the carcass rule; `age01` is `foodAge / carcassTicks` for meat (0 when `carcassTicks` is 0), 0 for plant food |
| Obstacles, 3 each                                         | `x`, `y`, `radius` (`Float32`), `terrainRockCount(config)` of them: the static rocks                                                                                                                                                               |
| Clouds, `cloudStride` 3 each, live only                   | `x`, `y`, `cloudTtl / smokeTicks` (`Float32`)                                                                                                                                                                                                      |
| Rays, `rayCount` per agent, only when `withRays`          | Ray `k`'s proximity (channel 0 of the agent's inputs row, `1 - distance / visionRange`, 0 for a miss), in agent order                                                                                                                              |

`speed` is `sqrt(vx x vx + vy x vy)` in world units per tick. `SNAPSHOT_FLAG` names the `flags` bits: the `ate` and
`bitten` timers (`ateTimer`, `bittenTimer`, 0 to `TIMER_CAP`) in 5-bit fields at bits 0 and 5, then `JAW_OPEN` (bit 10: the
specialisation has `canHunt` and the `BITE` output is above 0), `ALARMING` (11, `alarmTimer` above 0), `HUNT_CALLING` (12,
`huntTimer` above 0), `PREGNANT` (13, `pregnancy` above 0) and `MALE` (14, `sex` is male; clear for a female).

Sections follow each other with no padding and are sized for `maxAgents`, `maxFood`, `terrainRockCount(config)`, `maxClouds` and the
ray part. A snapshot is not part of `worldHash`.

## Decisions

| Decision                                                                          | Reason                                                                                                                                                      | By                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `world.inputs` has a written read contract, and readers test class channels `> 0` | Four reader groups depend on the rule and nothing recorded it; the honest-ray change makes class channels carry proximity, so an `=== 1` test stops working | Specialist review |

## Tooling and tasks

- Playwright and its pin exist (`@playwright/test` 1.64.1). Under WSL, `browser-hash.mjs` runs Playwright's Chromium:
  hashing needs no GPU.
- `test/sim/golden.slow.test.js` sets a 120 s timeout. Its first expected hash is a self-pin: the task that adds it runs
  it, commits the value, and says so in the commit body.
- `npm run bench -- --json` prints one flat object of `"bench.<metric>": number`. `bench-check` runs
  `npm run bench -- --json --sizes=500` and compares `bench.step_ms@500` with `bench/baseline.json`. The bench
  runs the defaults: the frozen bench world, `FEATURES_OFF` and `FEATURES_ON` were retired, so `bench/baseline.json` follows the
  defaults and is re-recorded when they move.
- If `bench.step_ms@500` cannot get under 8 ms, the PR states the measured value and the profile, and the target is
  agreed with the user; it is never lowered silently.
- `test/sim/golden.json` holds named cases, each with config overrides, a tick count and the expected hash;
  `golden.slow.test.js` and `scripts/browser-hash.mjs` both read it. `default` is the shipped config; `busy` is a
  2400 x 1600 world crowded enough that random brains mate, split, bite, hit the floor and receive immigrants.
- `test/sim/helpers/test-policy.js` is a minimal policy (zero weights, spec 0) for tests that run before
  `birth-policy.js` exists (T7 onwards).
- The `eslint.config.js` override for `scripts/browser/` (worker globals) goes after the Node-globals block so that
  it wins.
- The Aspire CLI version is recorded in [sim-notes.md](sim-notes.md) by the task that writes `.mcp.json`, before it
  writes it.

## Diagnostics envelopes (Phase 3)

- A `sink` receives `{ level, event, ...fields }`, one plain object per record; the JSONL sink writes one per line.
- `assertInvariants` throws an `Error` with properties `invariant`, `tick`, `slot` and `value`; `replay.mjs` maps it
  to `InvariantViolated`.
- `runId` is `<seed>-<configHash>`, built in `scripts/replay.mjs`; nothing in `js/sim/` reads a clock.
- `--dump <tick>` writes the world's arrays and scalars as JSON, typed arrays as plain number arrays.
- `StepBudgetExceeded` uses `--budget-ms <n>` (default 8) in `replay.mjs`.
- The Aspire dashboard image tag is pinned by T24, next to the CLI version.

## Built in Phase 1

- Functions that need the config read it from `world.config`: `assertInvariants(world)`, `placeTerrain(world)`,
  `spawnFoodItem(world)` and `spawnAgent(world, policy, cause)`.
- Module-level scratch state is allowed only for fixed-size buffers that no result depends on across calls:
  `det-math.js` (the bit view), `rng.js` (the FNV state for `fork`) and `world-hash.js` (the scalar buffer, the
  digest and a per-world cache of byte views). A world's arrays are never reassigned after `allocateWorld`.
- The contact list (`world.contacts`, `Int32Array(2 x maxContacts)`, and `world.contactCount`) is allocated by the
  physics task in Phase 2, with `resolveContacts`.
- `buildHash` throws on entry overflow without a tick; `step` adds the tick when it rethrows.

## Settled while building Phase 2

- Outputs are indexed from 0: thrust 0, turn 1, sprint 2, mate 3, bite 4.
- The movement cost term is `movementCost x (speed x speed) x m`.
- A child is placed after the energy transfer, so the touching distance uses both agents' post-transfer sizes. Its
  `angle` is `theta - PI` with `theta` in `[0, 2 PI)`, already inside `[-PI, PI)`.
- A blocked split starts no cooldown, so `BirthBlocked` repeats each tick while the world is full.
- `fatherWeights`, `fatherId` and `fatherLineage` keep their values after a birth; only the next mating overwrites
  them.
- `isReadyToMate(world, slot)` in `mate-eligibility.js` (mature, not pregnant, cooldown 0, energy above
  `mateMinEnergy`, temperature not past a stress threshold) is shared by body input 7 and `mate`, which also needs the mate output above 0. `canMatePair`
  adds the pair conditions, including that the mother (the female) holds more than `childEnergyMin / childEnergyShare` (her `childShare` trait).
- `actAll` adds thrust along the heading as computed in double precision before it is stored in the `Float32Array`;
  sensing later reads the stored float32 `angle`.
- Mating does not mark a pair as done: pregnancy and the cooldown, re-checked by `readyToMate` for every `a` and `b`,
  stop an agent mating twice in one tick, so a config with `reproductionCooldown` 0 lets a father mate again with
  another partner in the same tick.
- `specParams(config, index)` in `spec-params.js` looks a specialisation up by index in fixed name order.
- Snapshot sections are packed back to back: food starts right after the last alive agent and obstacles right after
  the last food. The buffer from `snapshotLayout` is sized for `maxAgents`, `maxFood` and the terrain's rocks; the
  header's counts say where each section ends.

The `flora` RNG stream is forked by name after `lifecycle` and hashed with the other six streams. Patch coordinates and stocks are hashed for the full pool even when no patch is initially alive. The migration visit bitset is sized by `floraPatchMax`; distinct visited slot count is normalised by this capacity, so later seedlings can participate without reallocating observer state. The migration metric is null when no living patch has ever been observed; unvisited living patches produce a zero index once mature deaths provide its denominator.

`stepPatchLife` runs in ascending slot order before each patch regrows. Consecutive stock samples at most 1.01 times the five-percent floor reach `patchDieTicks` and produce `PatchDied` (field 2 patch, field 3 species), zero stock/weight and a `seedBankTicks` bank. Each banked slot draws one `flora` float per tick, including its final bank tick; sprouting resets stock to `seedStock` times capacity and increments serial, while an expired bank cannot restore itself. Banked/live traits must be finite and in bounds; a dead slot holds no stock or spawn weight.

`floraTraits` is derived reusable `Float64Array(5)` scratch, excluded from `hashWorld`, in the order energy, regrow, life, hue, start. `blendTraits` writes parent means (start is a signed offset about the species row's phase); `mutateTraits` immediately consumes them, draws one Gaussian for each trait even at mutation/range zero, clamps to the archetype range, and writes a seedling's Float32 traits. No reader keeps this scratch after another blend. Stored start is wrapped into [0, 1); a Float32 rounding to one is canonical zero, both at initial assignment and mutation.

`foodPatchSerial` is Uint32, copied from the source when a plant item is spawned, hashed and reset with the food slot. An old item remains valid after its patch dies or is reused, but cannot load pollen from a different source generation. Background and meat items carry serial zero.

Carriers use `pollenPatch` Uint16 (patch index plus one, including encoded256 for slot255), `pollenSerial` Uint32 and `pollenTicks` Int32. All three are hashed and reset by `freeAgent`; zero pointer means a wholly zero record. `agePollen` runs before feeding, decrements existing pollen and clears expired/dead/reused source identities. A source that dies in the field phase may remain in the stored record until the next age, but is invalid to every delivery reader. `pollenRefusalTick` is derived Float64 stamp scratch, excluded from the hash and reset with the slot; only the first refusal per carrier/tick is emitted, while later seeding decisions and random draws still run.

`patchSeedTick` is hashed Float64, initially `-seedCooldownTicks` (new seedlings are likewise immediately eligible to receive pollen). Cooldown refusal retains pollen and changes no patch stamp. Pool or local-placement refusal consumes pollen and stamps the visited patch, as does success. `placeSeed` consumes two `flora` floats per candidate: angle, then radial unit. The first radius is the exact configured reach; retries use the square-root disc radius. Candidates stay within the visited basin, the world and the local disc, and clear obstacles at patch radius. Exhaustion emits a placement refusal, never a global fallback. `PatchSeeded`17 fields2–8 are species, child patch, parentA, parentB, hue, x, y; `SeedingRefused`19 fields2–3 are species and reason0 pool,1 cooldown,2 placement. Event capacity is `8 x maxAgents + 2 x floraPatchMax`.
