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

| Key                       | Default | Replaces                                                                        |
| ------------------------- | ------- | ------------------------------------------------------------------------------- |
| `restitution`             | `0.5`   | Elasticity of agent-agent impulses                                              |
| `splitCooldownMultiplier` | `1.5`   | The split cooldown factor                                                       |
| `mateChanceScale`         | `1.5`   | Mating chance is `min(1, reproductionBonus / mateChanceScale)`                  |
| `foodTargetPerAgent`      | `1.5`   | Food target `min(maxFood, max(foodTargetMin, foodTargetPerAgent x population))` |
| `foodTargetMin`           | `50`    | As above                                                                        |
| `foodRefillBoost`         | `4`     | `b = 1 + foodRefillBoost x (1 - food / target)` below target                    |
| `foodSurplusRate`         | `0.2`   | `b` at or above target                                                          |
| `foodSpawnAgentDivisor`   | `20`    | `foodSpawnRate x maxAgents / foodSpawnAgentDivisor`                             |
| `fertileZoneRadius`       | `150`   | Food from a zone lands within this distance of its centre                       |
| `fertileZoneFertility`    | `0.05`  | `FERTILE_ZONE_FERTILITY_FACTOR`: a zone starts at `size x` this                 |
| `placementTries`          | `100`   | Rejection-sampling attempts before `placeClear` throws                          |

`TIMER_CAP` (30, the cap on `ateTimer` and `bittenTimer`) is a named constant in `world.js`, not a key: it is bound to
the `Uint8Array` storage.

### Shapes and ranges

Validation runs after the merge. Integer means `Number.isInteger`. A failure throws naming the key path (`seasons[2].energyDrain`), the value and the rule.

| Keys                                                                                                       | Rule                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `seed`                                                                                                     | Integer `0 .. 2^32 - 1`                                                                                                        |
| `worldWidth`, `worldHeight`                                                                                | `1000 .. 100000`                                                                                                               |
| `maxAgents`                                                                                                | Integer `1 .. 4096`                                                                                                            |
| `initialAgents`, `minAgents`                                                                               | Integer `0 .. maxAgents`                                                                                                       |
| `maxFood`                                                                                                  | Integer `1 .. 20000`; `initialFood` integer `0 .. maxFood`                                                                     |
| `immigrationInterval`                                                                                      | Integer `>= 0`; 0 turns immigration off                                                                                        |
| `foodMaxAge`, `maxAgeTicks`, `pregnancyTicks`                                                              | Integer `>= 1`                                                                                                                 |
| `reproductionCooldown`, `maturityTicks`                                                                    | Integer `>= 0`                                                                                                                 |
| `seasonLength`                                                                                             | Integer `>= 4`                                                                                                                 |
| `obstacleCount`                                                                                            | Integer `0 .. 100`; `obstacleMinRadius <= obstacleMaxRadius`                                                                   |
| `rayCount`                                                                                                 | Integer `1 .. 64`; `brainHidden` integer `1 .. 128`                                                                            |
| `hashCellSize`, `pheromoneCellSize`                                                                        | `> 0`; `maxContacts`, `eventCapacity`, `placementTries` integer `>= 1`                                                         |
| `damping`, `highFoodChance`, `fertileZoneSpawnChance`, `pheromoneDecay`, `restitution`, `fertileZoneDecay` | `0 .. 1`                                                                                                                       |
| `pheromoneDiffusion`                                                                                       | `0 .. 1`                                                                                                                       |
| `huntSizeRatio`                                                                                            | `>= 1`                                                                                                                         |
| `initialEnergy`                                                                                            | `> 0` and `<= maxEnergy`; `minSize <= baseSize`                                                                                |
| Every other number                                                                                         | Finite and `>= 0`; sizes, radii, energies and the divisors `energyToSize`, `foodSpawnAgentDivisor` and `mateChanceScale` `> 0` |
| `checkInvariants`                                                                                          | Boolean                                                                                                                        |

Cross-key rule: `maxAgents x weightCount` is at most 2^24 (64 MB per weight array). Cross-key rule: the largest radius - `baseSize + maxEnergy / energyToSize`, `foodRadius`, `highFoodRadius` - must be
below `hashCellSize`, so a circle spans at most 3 x 3 cells. At the defaults it is 125 against 128.

- `seasons` is an array of exactly four objects in the order spring, summer, autumn, winter, each with exactly the
  keys `foodScarcity`, `energyDrain`, `reproductionBonus`, each finite and `>= 0`. The season index is
  `Math.floor(phase x 4)`.
- `specialisations` is an object with exactly the keys `forager`, `predator`, `reproducer`, `scout`, `defender`. Each
  value has exactly `index` (fixed: 0, 1, 2, 3, 4 in that order), `visionRange` (`> 0`), `canHunt` (boolean),
  `moveCostMultiplier`, `biteTakenMultiplier` and `cooldownMultiplier` (each `> 0`). The defaults are the design
  doc's table: scout `moveCostMultiplier` 0.7, defender `biteTakenMultiplier` 0.5, reproducer `cooldownMultiplier`
  0.5, every other multiplier 1.
- `config.js` keeps the merge, freezing and hashes; the per-key rules live in `js/sim/config-validate.js`
  (`validateConfig`), so neither file passes 300 lines.
- Overrides deep-merge objects key by key; an override array replaces the default array whole.
- Canonical JSON for the hashes: keys sorted at every level, arrays in order, numbers by `JSON.stringify`.

## World layout

### Arrays

The design doc's World state table, plus:

| Group         | Arrays (type)                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Food          | `foodAlive` (`Uint8`), `foodX`, `foodY`, `foodRadius` (`Float32`), `foodValue` (`Float64`), `foodAge` (`Uint32`)          |
| Obstacles     | `obsX`, `obsY`, `obsVx`, `obsVy`, `obsRadius` (`Float32`), `obstacleCount` entries each                                   |
| Fertile zones | `zoneAlive` (`Uint8`), `zoneX`, `zoneY` (`Float32`), `zoneFertility`, `zoneInitial` (`Float64`)                           |
| Pheromones    | `danger`, `attack`, `pheromoneScratch` (`Float32`), `cols x rows` with `cols = Math.ceil(worldWidth / pheromoneCellSize)` |
| Ledger        | `ledger` (`Float64Array(2)`): `[in, out]`                                                                                 |
| Scalars       | `tick`, `nextId` (starts at 1; 0 means "none"), `population`, `foodCount`                                                 |

- Every agent row array is `maxAgents` rows; `hidden` has `maxAgents + 1` rows, the last being the scratch row.
- The slot free-list is derived from `alive` and is not hashed: `allocAgent` scans for the lowest slot with
  `alive === 0` and throws when none is free. Callers check `population < maxAgents` first.
- `freeAgent` zeroes every agent row array at the slot and sets `alive` to 0. `removeFood(world, slot)` (in
  `world.js`) zeroes every food array at the slot and decrements `foodCount`; a freed zone slot has every zone array
  zeroed.

### Ids and codes

| Code set      | Values                                                              |
| ------------- | ------------------------------------------------------------------- |
| Born cause    | `initial` 0, `mate` 1, `split` 2, `floor` 3, `immigrant` 4          |
| Death cause   | `starved` 0, `eaten` 1, `collision` 2, `old-age` 3                  |
| Blocked cause | `capacity` 0, `energy` 1                                            |
| `lastLoss`    | none 0, `cost` 1, `bite` 2, `collision` 3                           |
| Event type    | `AgentBorn` 1, `AgentDied` 2, `BirthBlocked` 3, `PopulationFloor` 4 |

Each set is exported as a frozen object of named constants from the module that owns it (`events.js` for the event
types and causes, `energy.js` for `lastLoss`).

## Events - `events.js`

The ring is a per-tick buffer: `{ data: Float64Array(eventCapacity x EVENT_STRIDE), count }` with `EVENT_STRIDE` 12.

- `pushEvent(ring, type, tick)` throws naming the tick and `eventCapacity` when `count === eventCapacity`; otherwise
  it writes `type` and `tick` into fields 0 and 1 of record `count`, increments `count`, and returns the record's
  offset into `data`. The caller writes the remaining fields at `offset + 2 ..`.
- `step` sets `count = 0` before its first phase. Events from `createWorld` stay until the first `step`.
- `readEvents(ring)` returns `count`; callers read `ring.data` directly. Nothing is allocated.

| Type              | Fields 2 .. 11                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `AgentBorn`       | `slot`, `genomeId`, `lineageId`, `spec`, `parentA`, `parentB`, `cause`                         |
| `AgentDied`       | `slot`, `genomeId`, `cause`, `by`, `spec`, `lineageId`, `ageTicks`, `foodEnergy`, `biteEnergy` |
| `BirthBlocked`    | `slot` (the mother or splitter), `cause`                                                       |
| `PopulationFloor` | `added`                                                                                        |

Unused fields are 0.

## Energy - `energy.js`

- `addEnergy(world, slot, amount, source)`: stores `min(amount, maxEnergy - energy)`; adds the stored amount to
  `ledger[0]` when `source` is external (food, initial, floor, immigrant) and returns it.
- `removeEnergy(world, slot, amount, cause)`: removes `min(amount, energy)`, so energy never goes below 0; adds the
  removed amount to `ledger[1]`, sets `lastLoss = cause` when it removed more than 0, and returns it.
- `transferEnergy(world, giver, receiver, amount)` moves energy between agents without touching the ledger, and
  returns what the giver lost, and sets `world.transferGained` (not hashed) to what the receiver stored; the caller
  sets `lastLoss` and `lastBiter` for a bite and adds `transferGained` to the biter's `biteEnergy`. The giver loses
  `t = min(amount, giver energy)`, the receiver gains `min(t, maxEnergy - receiver energy)`, and any remainder goes to
  `ledger[1]`. Bites, `childEnergy` and split halves are transfers.
- The agent arrays `foodEnergy` and `biteEnergy` accumulate the amounts actually stored: the feeding code adds
  `addEnergy`'s return value and `transferGained`.
- Food the eater cannot hold is left out of the ledger: food energy only enters the ledger once an agent stores it.
- At death the dead agent's remaining energy goes to `ledger[1]` before `freeAgent`.
- `size` is recomputed after every change to `energy`: `max(minSize, baseSize + energy / energyToSize)`.

## Placement - `spawn.js`

`js/sim/spawn.js` (Phase 1) holds the placement shared by `createWorld`, `food.js` and `population.js`:

- `placeClear(world, rng, radius)` draws `x = radius + nextFloat x (worldWidth - 2 radius)`, then `y` the same way,
  and accepts the first point whose distance to every obstacle centre is at least `obsRadius + radius`. After
  `placementTries` rejections it throws, naming the tick and the radius. The point is written to `world.point`
  (`Float64Array(2)`).
- `placeObstacles(world, config)` uses the `obstacles` stream: per obstacle, `radius = min + nextFloat x (max - min)`,
  then `x = radius + nextFloat x (worldWidth - 2 radius)` and `y` the same way with no rejection (obstacles may
  overlap each other), then `heading = nextFloat x 2 PI` and
  `speed = nextFloat x obstacleMaxSpeed`, giving `vx = speed x detCos(heading)`, `vy = speed x detSin(heading)`.
- `spawnFoodItem(world, config)` uses the `food` stream in this order: `high = nextFloat < highFoodChance`; when any
  zone is alive, `fromZone = nextFloat < fertileZoneSpawnChance`; the zone, by a roulette over alive zones in
  ascending index with `nextFloat x total fertility`; the position; then
  `energy = base + (2 nextFloat - 1) x variance`. A zone position is `r = fertileZoneRadius x Math.sqrt(nextFloat)`,
  `theta = nextFloat x 2 PI` around the centre, clamped to `[radius, size - radius]`, and redrawn the same way while
  it lies in an obstacle, up to `placementTries`. It takes the lowest free food slot, with age 0.
- `spawnAgent(world, config, policy, cause)` uses the `spawn` stream: allocates the slot; sets `genomeId = nextId++`,
  `lineageId = genomeId`, `parentA = parentB = 0`; spec from `policy.initSpec` or `nextInt(spawn, 5)`; then
  `policy.initBrain` with the `brain-init` stream; then the position by `placeClear` with the radius for
  `initialEnergy`, `angle = nextFloat x 2 PI - PI`, zero velocity, `ateTimer = bittenTimer = TIMER_CAP`, energy by
  `addEnergy`; then pushes `AgentBorn`.
- `createWorld(config, policy)` lives here, not in `world.js`, so that `spawn.js` can import `world.js` without a
  cycle: it calls `allocateWorld(config)`, forks the streams, then places obstacles, then `initialFood` food items,
  then `initialAgents` agents with cause `initial`.

## Tick details

### Order inside phases

- Each function visits slots `0 .. maxAgents - 1` and acts on a slot if it is alive when visited. An agent born
  earlier in the same function at a higher slot is visited; one at a lower slot is not.
- `applyCosts`, per alive agent: `ageTicks += 1`; `cooldown = max(0, cooldown - 1)`;
  `ateTimer = min(TIMER_CAP, ateTimer + 1)`; the same for `bittenTimer`; then the cost by `removeEnergy` with cause
  `cost`. A newborn's first increment is on the tick after its birth.
- `advancePregnancies`: `pregnancy -= 1` where it is above 0; at 0, the birth is attempted.
- `reap`, per alive agent: `ageTicks >= maxAgeTicks` dies of `old-age` first; otherwise energy at 0 dies of the
  cause mapped from `lastLoss` (none or `cost` to `starved`, `bite` to `eaten`, `collision` to `collision`). `by` is
  `lastBiter` for `eaten`, else 0.
- `fillFloor`: first the floor, while `population < minAgents`; then one immigrant when `immigrationInterval > 0`,
  `tick > 0`, `tick % immigrationInterval === 0` and `population < maxAgents`. `tick` is the value before `step`
  increments it. `PopulationFloor` is pushed once per tick in which the floor added any agent; `added` counts floor agents only, not
  the immigrant.
- `ateTimer` and `bittenTimer` reset to 0 when the agent eats or is bitten.

### Motion and body inputs

- `actAll`: `turnRate = out2 x maxTurn`; `angle += turnRate`, then `angle -= 2 PI` when `angle >= PI` or
  `angle += 2 PI` when `angle < -PI` (one conditional); thrust `out1 x maxThrust`, times `1 + sprintMultiplier` when
  sprinting, is added to `vx`, `vy` along the new heading.
- `integrate`: `vx *= damping`, `vy *= damping`; when `speed = Math.sqrt(vx x vx + vy x vy)` exceeds the cap,
  `s = cap / speed`, `vx *= s`, `vy *= s`; then `x += vx`, `y += vy`.
- Body inputs 2 and 3: forward `(vx x cH + vy x sH) / maxVelocity`, lateral `(-vx x sH + vy x cH) / maxVelocity`.
- The season: `seasonAt(config, tick)` in `environment.js` writes the index and phase into `world.season`
  (`Float64Array(2)`, not hashed); `updateSeason` calls it once per tick.

### Feeding

- `feed` visits alive agents in ascending slot. Each eats every alive food it overlaps, found through `cellRange`
  of its circle, cells ascending and entries in cell order. Food is removed when eaten even if the eater stored
  only part of it.
- Eating runs over all agents first; then bites run over the contact list in list order.
- A bite moves `biteEnergy x biteTakenMultiplier` with `transferEnergy`; the victim's `lastLoss` becomes `bite` and
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
- Obstacles move in `moveObstacles`: `x += vx`; when `x - R < 0`, `x = R` and `vx = abs(vx)`; when `x + R > W`,
  `x = W - R` and `vx = -abs(vx)`; the same for `y`. Obstacles do not collide with each other.

### Rays

- `allocateWorld` builds `world.rayCos` and `world.raySin` (not hashed): `detCos` and `detSin` of
  `2 PI k / rayCount`. Each tick, with `cH = detCos(angle)` and `sH = detSin(angle)`, ray `k` has
  `dx = cH x rayCos[k] - sH x raySin[k]` and `dy = sH x rayCos[k] + cH x raySin[k]`. Its origin is the agent centre
  and its length is `visionRange`.
- Ray-circle: with `ox, oy` the origin minus the circle centre, `b = dx x ox + dy x oy`,
  `c = ox x ox + oy x oy - R x R`; no hit when `b x b - c < 0`; else `t = -b - Math.sqrt(b x b - c)`, and 0 when
  `t < 0` and `c <= 0`; a circle with `t < 0` and `c > 0` is behind the ray.
- `distance` is from the centre to the hit surface: the smaller root of the ray-circle intersection, or 0 when the
  origin is inside the circle. The agent never hits itself.
- The DDA steps along x when `tMaxX <= tMaxY` (x first on a tie). It stops after the first cell in which the nearest
  hit so far lies within that cell's stretch of the ray, or at `visionRange`.
- Equal distances are broken by kind (food, agent, obstacle, wall), then by lower index.
- A wall hit's distance is to the nearest boundary line the ray crosses within `visionRange`.

### Brain

Row layout, all row-major:

| Block     | Index of weight                                  |
| --------- | ------------------------------------------------ |
| `wIn`     | `i x brainHidden + j` (input `i` to hidden `j`)  |
| `wRec`    | `k x brainHidden + j` (hidden `k` to hidden `j`) |
| `bHidden` | `j`                                              |
| `wOut`    | `j x OUTPUT_COUNT + o`                           |
| `bOut`    | `o`                                              |

The blocks follow each other in that order. For each hidden unit `j`, the sum is a float64 that starts at
`bHidden[j]`, then adds `wIn[i, j] x x_i` for `i` ascending, **skipping every `i` whose input is exactly 0**, then
`wRec[k, j] x h_k` for `k` ascending. `h'_j = Math.fround(detTanh(sum))`. Outputs sum `bOut[o]` then
`wOut[j, o] x h'_j` for `j` ascending, then `detTanh`. Any loop nesting is allowed as long as each sum adds its terms
in exactly this order. The zero-skip is part of the contract: adding `+0` to `-0` changes the sign bit.

### Food, zones and pheromones

- `spawnFood` draws one `nextFloat` for the fraction every tick, even when the fraction is 0, and spawns
  `min(free food slots, whole + (draw < fraction ? 1 : 0))`.
- `ageFood` adds 1 to each alive food's age, then removes food whose age exceeds `foodMaxAge`.
- A death adds a zone with `zoneInitial = zoneFertility = size x fertileZoneFertility`. When all `fertileZoneMax`
  slots are alive it replaces the zone with the lowest `zoneFertility / zoneInitial`, lowest index on a tie.
- `decayFertileZones`: `zoneFertility -= fertileZoneDecay x zoneInitial`; a zone at or below 0 is freed.
- Pheromone deposit: `min(pheromoneMax, cell + pheromoneDeposit)` at the depositor's cell.
- `updatePheromones`, per grid: every cell `v = v x (1 - pheromoneDecay)`; copy into the scratch grid; then each cell
  becomes `s[c] - (D / 4) n(c) s[c] + (D / 4) sum of s over its neighbours`, where `D` is `pheromoneDiffusion`, `n(c)`
  is its count of in-grid four-neighbours, and `s` is the scratch grid. The total is conserved apart from decay.

### Mating and births

- Mating checks run over the contact list in list order. A pair that mated this tick is not checked again.
- The mating draw is one `lifecycle` `nextFloat`, drawn only for pairs that pass every other condition.
- Each pays `mateCost` with `removeEnergy` (cause `cost`) and sets `cooldown` to
  `reproductionCooldown x cooldownMultiplier` rounded down. The lower slot copies the other's `weights` row into
  `fatherWeights` and sets `fatherId`, `fatherLineage` and `pregnancy = pregnancyTicks`; then `policy.onMate`.
- A birth needs `population < maxAgents` (else `BirthBlocked` `capacity`) and mother energy above `childEnergy`
  (else `energy`). The child takes `childEnergy` by transfer, `parentA` is the mother's `genomeId`, `parentB`
  `fatherId`, `lineageId` the mother's.
- A split needs a free slot (else `BirthBlocked` `capacity`); the child takes `energy / 2` by transfer, both parents
  are the splitter, and the cooldown is `reproductionCooldown x cooldownMultiplier x splitCooldownMultiplier`
  rounded down.
- Child placement: `theta = nextFloat x 2 PI` on `lifecycle`; centre at the parent's plus `(r_parent + r_child)` along
  `theta`, clamped to `[r, size - r]`; `angle = theta - PI` wrapped; zero velocity; timers at `TIMER_CAP`.
- `childBrain` gets `world.birthOptions`, one object reused for every birth: its `cause` and `rng` (the `mutation`
  stream) are set before each call.

## `cloneWithNoisePolicy(options)`

- `options.mutationSigma` (default `0.02`) and `options.initScale` (default 1) are named defaults in
  `birth-policy.js`.
- `initBrain`: `wIn` and `wRec` weights are `nextGaussian x initScale / Math.sqrt(inputCount + brainHidden)`, `wOut`
  `nextGaussian x initScale / Math.sqrt(brainHidden)`, biases 0, in row order.
- `childBrain`: the child row is the mother's `weights` row plus `nextGaussian x mutationSigma` per weight, in row
  order. The father is ignored: the reference policy is asexual.

## `hashWorld`

FNV-1a over raw little-endian bytes, in this order:

1. `tick`, `nextId`, `population`, `foodCount`, as one `Uint32Array(4)`.
2. Each agent array, whole (every slot, alive or not), in the design doc's World state table order. `hidden` is
   hashed without its scratch row. `inputs` and `outputs` are left out: they are recomputed every tick.
3. Food, obstacles, zones, in the order of this file's Arrays table; then `danger`, `attack` and `ledger`.
4. The six RNG streams' `s` arrays, in the Determinism table order.

The result is `fnv64Hex`. The `world-hash` test changes one element of each covered array and expects a different
hash, and changes `inputs` and expects the same one.

## `snapshot.js`

`snapshotLayout(config)` returns `{ bytes, headerWords, agentStride, foodStride, obstacleStride }`. The buffer is
one `ArrayBuffer` read through a `Float32Array` and a `Uint32Array` view:

| Words                                                    | Contents                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Header, 4 (`Uint32`)                                     | `tick`, agent count, food count, obstacle count                                                                 |
| Agents, `agentStride` 9 each, alive only, ascending slot | `x`, `y`, `angle`, `size`, `energy / maxEnergy` (`Float32`); `spec`, `lineageId`, `genomeId`, `slot` (`Uint32`) |
| Food, 3 each, alive only                                 | `x`, `y`, `radius` (`Float32`)                                                                                  |
| Obstacles, 3 each                                        | `x`, `y`, `radius` (`Float32`)                                                                                  |

Sections follow each other with no padding and are sized for `maxAgents`, `maxFood` and `obstacleCount`.

## Tooling and tasks

- Playwright and its pin exist (`@playwright/test` 1.64.0). Under WSL, `browser-hash.mjs` runs Playwright's Chromium:
  hashing needs no GPU.
- `test/sim/golden.test.js` sets a 120 s timeout. Its first expected hash is a self-pin: the task that adds it runs
  it, commits the value, and says so in the commit body.
- `npm run bench -- --json` prints one flat object of `"bench.<metric>": number`. `bench-check` runs
  `npm run bench -- --json --sizes=500` and compares `bench.step_ms@500` with `bench/baseline.json`.
- If `bench.step_ms@500` cannot get under 8 ms, the PR states the measured value and the profile, and the target is
  agreed with the user; it is never lowered silently.
- `test/sim/golden.json` holds the golden config overrides, tick count and expected hash; `golden.test.js` and
  `scripts/browser-hash.mjs` both read it.
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

- Functions that need the config read it from `world.config`: `assertInvariants(world)`, `placeObstacles(world)`,
  `spawnFoodItem(world)` and `spawnAgent(world, policy, cause)`.
- Module-level scratch state is allowed only for fixed-size buffers that no result depends on across calls:
  `det-math.js` (the bit view), `rng.js` (the FNV state for `fork`) and `world-hash.js` (the scalar buffer, the
  digest and a per-world cache of byte views). A world's arrays are never reassigned after `allocateWorld`.
- The contact list (`world.contacts`, `Int32Array(2 x maxContacts)`, and `world.contactCount`) is allocated by the
  physics task in Phase 2, with `resolveContacts`.
- `buildHash` throws on entry overflow without a tick; `step` adds the tick when it rethrows.
