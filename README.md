# Blob Evolution

![Evolution in Action](https://img.youtube.com/vi/6oUIqGgeW4A/maxresdefault.jpg)

[Live simulation](https://matrix.dotnethelp.co.uk/) | [Trailer](https://youtu.be/6oUIqGgeW4A) | [Run it](#run-it) | [Design docs](docs/designs/README.md) | [AGENTS.md](AGENTS.md) (for coding agents)

Blob Evolution is an artificial-life simulation that runs in your browser. Small creatures ("blobs") sense the world
through rays, eat, flee, fight, mate and die, and each one is steered by a small recurrent neural network. Nobody
trains the networks: they are inherited, mixed and mutated, and the ones that live well leave more descendants. You
watch behaviour appear.

This README describes the code on `main`. Where a feature is built but switched off, or only planned, it says so. The
plans live in [docs/designs/](docs/designs/README.md) and every claim below names the file or symbol it comes from.

## Contents

1. [What we have now](#what-we-have-now)
2. [Run it](#run-it)
3. [The brain](#the-brain)
4. [The world](#the-world)
5. [Evolution](#evolution)
6. [How agents improve, and how we measure it](#how-agents-improve-and-how-we-measure-it)
7. [Determinism, evals and quality](#determinism-evals-and-quality)
8. [Where we are going](#where-we-are-going)
9. [Developing](#developing)

## What we have now

The project is being rebuilt as "v6" in short sessions, one design doc at a time. Three layers exist on `main`:

| Layer                      | Where                | What it is                                                                                                                                                                      |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headless sim core          | `js/sim/`            | The world and its rules as typed arrays. Deterministic: the same seed and config give the same bits. No DOM, no clock, no `Math.random` (all randomness is `js/sim/rng.js`).    |
| Evolution                  | `js/evo/`            | Genomes, mutation, crossover, the fitness functions, the MAP-Elites archive, the policies that decide which brains get born, and the observer and metrics the evals read.      |
| Worker and renderer (app)  | `js/worker/`, `js/app/` | The app on `index.html`. The sim and the live policy run in a Web Worker behind a validated message protocol (`js/worker/protocol.js`); the main thread only draws (three.js, WebGL2) and runs the interface. |

The previous app (WebGPU, one big `game.js`) is deleted; [legacy-audit.md](docs/designs/legacy-audit.md) records what
it did wrong and which design replaced each part.

Time is counted in ticks, 60 a second at speed x1. A blob lives at most `maxAgeTicks` (36,000 ticks, 10 minutes at x1).
The speeds are x0.25 to x16 (`TICKS_PER_SECOND_CHOICES` in `js/worker/protocol.js`).

## Run it

Needs Node 24 (`package.json` `engines`) and a current browser with WebGL2.

```bash
npm ci
npm run dev        # Vite, http://localhost:5173
```

Open the page and evolution starts at once. A first visit shows a title card with a legend (shape is the role, colour is
the family, brightness is energy) and starts at x2.

### Keys

All bindings are the `KEYMAP` in `js/app/ui/keymap.js`; `?` or `F1` lists them in the help drawer.

| Keys                                   | Action                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Space`, `.`, `Shift+.`                | Pause, step one tick, step ten ticks (while paused)                                             |
| `[` and `]`                            | Slower and faster                                                                               |
| `N` twice, `Shift+N`                   | New world with a new seed; focus the seed field (type a number and press Enter)                 |
| Arrows or drag, wheel or `+` `-`, `Home` | Pan, zoom, reset the camera                                                                   |
| Click, `F`, `Esc`                      | Select a blob, follow it, clear the selection (or close a drawer)                               |
| `1` to `4`                             | Lenses: temperature, scent trails, family territories, vision and calls                         |
| `C`, `I`, `?`                          | Charts drawer, inspector (the selected blob's senses, hidden layer and actions), help           |
| `H`, `Shift+F`                         | Hide the HUD, fullscreen                                                                        |
| `A`, `9`, `0`, `K`                     | Audio on or off, volume down and up, wake lock                                                  |
| `E`, `B`                               | Export the archive, download the debug bundle (replays the run)                                 |
| `P`, `Shift+P`                         | Screenshot with a caption plate, record a 15 s clip                                             |

After 30 s without input the HUD fades; after 10 s idle a camera director takes over (`js/app/director/`) and returns
control on any input. Lenses, HUD size and the colour palette (default, colour-blind safe, high contrast) are remembered.

### URL parameters

Read by `readParams` in `js/app/url-params.js`; a bad value is ignored, never an error.

| Parameter                | Effect                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=<n>`              | World seed (unsigned 32-bit)                                                                                                                         |
| `?agents=<n>`            | Starting population, 1 to 4096; raises `maxAgents` above the default 500 and lowers `minAgents` to at most `n`                                       |
| `?speed=<x>`             | 0.25, 0.5, 1, 2, 4, 8 or 16                                                                                                                          |
| `?quality=<0..2>`, `?scale=<0.25..1>` | Pin the quality level and the render scale (software rendering defaults to 0.5)                                                         |
| `?tv=1`                  | TV mode: HUD hidden, director running, wake lock on                                                                                                  |
| `?audio=1`               | Start with generative audio on                                                                                                                       |
| `?policy=<name>`         | Preview a registered policy such as `map-elites-v6` (an unknown name stops the worker and lists the known ones)                                      |
| `?merit=1`               | Turn in-world merit on with `MERIT_PREVIEW` (see [Evolution](#evolution)); the help drawer's debug line shows the policy and whether merit is on     |

For example `http://localhost:5173/?policy=map-elites-v6&merit=1` previews the candidate fitness before it is tuned.

### The top bar

A plain-language status sentence ("Summer, year 3: 270 blobs and growing, Velari leads with 31%"), then
`Year 3, Summer, Gen 41` with a season ring (generation is the deepest lineage depth alive), the speed (`x4 (x3.98)`
is requested and sustained), the count of each of the five types, `born 42%` (the share of births made in the world
rather than arriving as immigrants), `pred 34` (predators alive), `calls 12/kt` (alarm and hunt calls per 1000 ticks)
and the largest type with its share (`scout 82%`). Sources: `js/app/ui/top-bar.js`, `status-line.js`,
`js/worker/world-numbers.js`. Family names ("Velari") come from the world seed and the lineage id (`familyName` in
`js/app/renderer/colors.js`).

## The brain

Every blob has an Elman recurrent network: its hidden layer feeds back into itself on the next tick, so it can remember.
One tick for one blob, `forwardAll` in `js/sim/brain.js`:

```
 rays (16 x 9 = 144) --+
 body inputs (35) -----+--> 179 inputs --W_in--> (+ hidden_prev x W_rec + bias) --tanh--> leaky mix --> 32 hidden
                                                                                                         |
        last tick's MEMORY_A, MEMORY_B (inputs 33, 34) <---------+                                      v
                                                          11 outputs = tanh( hidden x W_out + bias )
```

- **Size.** `brainLayout` in `js/sim/brain-layout.js`: `inputCount = rayCount x RAY_CHANNELS + EXTRA_INPUTS = 16 x 9 + 35 = 179`,
  `brainHidden = 32`, `OUTPUT_COUNT = 11`. One genome row is **7,183 floats**: `W_in` 179x32, `W_rec` 32x32, 32 hidden biases,
  `W_out` 32x11, 11 output biases, 4 trait genes and 32 leak genes.
- **Activation.** `tanh` on hidden units and outputs, through `detTanhInto` (`js/sim/det-math.js`) so the result is the same
  on every machine. An output above 0 means "do it" for the on/off actions.
- **Memory.** (1) The recurrent hidden row persists in `world.hidden`. (2) With `leakEnabled` (on) each hidden unit is leaky:
  `h = (1 - a) h_prev + a tanh(...)`, with `a = 0.05 + 0.95 x sigmoid(leak gene)` per unit (`leakRateOf` in `js/sim/traits.js`),
  so evolution can pick slow and fast units. (3) Two spare outputs, `MEMORY_A` and `MEMORY_B`, are fed back as inputs next
  tick (`writeMemoryInputs` in `js/sim/body-inputs.js`). They do nothing else.
- **Lifetime learning.** With `hebbianRate > 0` (default 0.0001) the hidden-to-output block is plastic (`hebbianStep` in
  `js/sim/hebbian.js`). Each blob has its own copy, `fastOut`, which drifts by `eta x (hidden x output - 0.01 x (fastOut - genome weight))`
  with `eta = hebbianRate x sigmoid(learn gene)`, clamped to plus or minus 4. A child inherits the genome, never what its
  parent learned.

### Inputs (179)

| Group                | Count | What it is                                                                                                                                                                                       |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rays                 | 144   | 16 rays spread evenly round the full circle (ray 0 dead ahead; `rayTables` in `js/sim/world.js`), 9 values each. Range is the blob's `visionRange` times its vision trait (`visionOf`).            |
| Body (offsets 0-18)  | 19    | Energy; forward and sideways velocity; turn rate; size; pregnant; ready to mate; danger and attack scent here; season sine and cosine; just ate and just bitten (fade over 30 ticks); specialisation; age; four temperature inputs (level, distance from the optimal band, cold stress, heat stress). `writeBodyInputs` |
| Scent and calls (19-31) | 13 | Danger and attack scent at a left and a right antenna (0.8 rad either side, 150 px out); hunt scent here and at both antennae; the loudest heard alarm and the loudest heard hunt call, each as loudness, ahead and side. `writeScentInputs` |
| Sex and memory (32-34) | 3   | Sex (0 female, 1 male; always 0 with `sexesEnabled` off), and last tick's `MEMORY_A` and `MEMORY_B` (0 with `leakEnabled` off).                                                                  |

The nine values of one ray (`RAY_CHANNELS`, `writeRay` in `js/sim/ray-march.js`) describe the **nearest thing** the ray hits:

| Channel | Meaning                                          | Channel | Meaning                                              |
| ------- | ------------------------------------------------ | ------- | ---------------------------------------------------- |
| 0       | Proximity: 1 at the blob, 0 at the end of range  | 5       | Kin (parent, child or sibling), value = proximity    |
| 1       | Food (plant or carcass): 1                       | 6       | Wall (the world edge): 1                             |
| 2       | Agent that can bite me, value = proximity        | 7       | Obstacle (rock): 1                                   |
| 3       | Agent I can bite, value = proximity              | 8       | Smoke cloud: 1                                       |
| 4       | Any other agent, value = proximity               |         |                                                      |

Which agent class a hit falls in is decided in order: kin, then "can bite me", then "I can bite it", then other
(`agentChannel`). "Can bite" is the bite rule in `js/sim/bite-rule.js`: only a specialisation with `canHunt`, never kin,
and only a target smaller than `huntSizeRatio` (0.8) times the biter. So a prey blob sees a predator as a threat from any
angle, and a predator sees prey as prey.

### Outputs (11)

`OUTPUT_INDEX` in `js/sim/brain-layout.js`:

| #   | Output     | Effect                                                                                                                                                       |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | `THRUST`   | Acceleration along the heading, times `maxThrust` and a temperature efficiency (`actAll` in `js/sim/physics.js`)                                              |
| 1   | `TURN`     | Rotation per tick, times `maxTurn` and the specialisation's turn multiplier                                                                                  |
| 2   | `SPRINT`   | Above 0: thrust x (1 + `sprintMultiplier` x the specialisation's `sprintBoost`), at an energy cost                                                          |
| 3   | `MATE`     | Above 0 and ready: offer to mate with a partner within `mateRange`                                                                                           |
| 4   | `BITE`     | Above 0: bite a touching target the bite rule allows, taking `biteEnergy` (x the biter's `biteMultiplier`; `applyBite` in `js/sim/feeding.js`)               |
| 5   | `ALARM`    | Above `alarmThreshold` (0.65), non-hunters only: pay `alarmCost`, deposit danger scent, be heard within `callRadius` (`js/sim/calls.js`)                      |
| 6   | `SMOKE`    | Above `smokeThreshold` (0.8): release a cloud behind the blob that blocks rays (`js/sim/smoke.js`); `smokeCost` and a `smokeCooldown`                         |
| 7   | `HUNT`     | Above `huntCallThreshold` (0.65), hunters only: pay `huntCallCost`, deposit hunt scent, call kin                                                              |
| 8   | `SPLIT`    | **Not read by the sim any more.** Splitting happens on energy alone (`readyToSplit` in `js/sim/reproduction.js`); the output is kept so genomes keep their shape |
| 9   | `MEMORY_A` | Fed back as input 33 next tick                                                                                                                               |
| 10  | `MEMORY_B` | Fed back as input 34 next tick                                                                                                                               |

### How genomes encode and mutate

A genome (`js/evo/genome.js`) is the 7,183-float row plus a specialisation, ids and a self-adapting step size `sigma`.

- **Random start.** `randomWeights` (`js/evo/mutation.js`): input and recurrent weights with standard deviation
  `1 / sqrt(inputCount + hidden)`, output weights `1 / sqrt(hidden)`, biases 0, trait genes 0, leak genes 3 (so a unit starts keeping about 95% of its old value).
- **Mutation.** `mutateSigma` first moves the child's step size log-normally (`SIGMA_MIN` 0.002 to `SIGMA_MAX` 0.5, start 0.05).
  `mutateWeights` then adds `sigma x N(0,1)` to every weight and clamps to plus or minus 4. Trait and leak genes use a fixed `TRAIT_SIGMA` of 0.1.
- **Crossover (mating).** `crossNeurons` (`js/evo/crossover.js`) takes whole neurons: for each hidden unit one coin flip decides whether all its
  incoming, recurrent and outgoing weights, its bias and its leak gene come from the mother or the father. Trait genes are taken whole from one parent too.
- **Splitting** copies the mother's row and mutates it.
- **Trait genes** (`TRAIT_INDEX`): `size`, `vision`, `childShare` and `learn`. A trait is `1 + 0.3 x tanh(gene)`, so 0.7x to 1.3x of the default
  (`traitValue`). Vision costs extra passive energy above 1 (`visionCost`). `learn` scales Hebbian plasticity.
- **Specialisation** is not a gene: a child takes its mother's, except with probability `specMutationRate` (0.002) a random other one (`js/sim/heritable-spec.js`).

## The world

Defaults are `DEFAULTS` in `js/sim/config-defaults.js`. The app runs exactly those (`createConfig` with only seed and URL overrides),
so every feature listed below as "on" is on in the app.

### The arena

| Thing                  | Default                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Size                   | 14,400 x 8,100 world units. Walls at the edge bounce a blob and cost `wallDamage` energy.                                                     |
| Terrain (`basins`)     | A wall of touching rocks down the middle splits the world into a west and an east basin, with `wallGaps` = 3 gaps of 300 (`js/sim/terrain.js`). |
| Refuges                | `refugeCount` = 4 rings of 8 rocks (alternating basins). Their gaps fit only blobs of radius up to `refugeSizeMax` (30), so small blobs can hide from big predators. No food inside. |
| Cold margin            | The 600 units along the north and south edges double the passive temperature loss (`coldFactor`).                                             |
| Wandering obstacles    | `obstacleCount` = 0 (the v5 world had 25; the basins replaced them). A hit costs `obstacleDamage`.                                       |
| Population             | Start `initialAgents` 100, cap `maxAgents` 500, floor `minAgents` 40. Under the floor, new lineages spawn from the policy; one immigrant arrives every `immigrationInterval` (600) ticks while there is room (`fillFloor` in `js/sim/population.js`). |

### Food

- Plant food: 100 energy (variance 20); 10% of items are "high" food (140, radius 30). At most `maxFood` 1,600 items, 300 at the start; items rot after 10,000 ticks.
- **Food patches.** `foodPatchCount` = 16 permanent patches of radius 400, split between the two basins (`js/sim/food-patches.js`). Each holds a stock that
  each meal eaten inside depletes by 0.02 and that regrows logistically (0.0005 a tick); 20% of spawns ignore the patches. With `foodAreaCapacity`
  food regrows per world area, not toward a per-blob target, so food does not scale with the population.
- **Carcasses.** A dead blob leaves a meat item worth half the energy it took in during its life (`carcassShare`; `js/sim/carcass.js`), lasting 300 ticks.
  Predators digest meat fully; other types get 30% of it (`meatFoodValue`). Predators get 0 from plants (`plantFoodValue`).
- Eating has limits: a blob at 95% of `maxEnergy` cannot eat (`satiationShare`), waits `digestTicks` (10) between meals and moves at 20% thrust for `handlingTicks` (20) after one.

### Time, seasons and eras

- A season modifies food (`foodScarcity`), energy drain, mating chance (`reproductionBonus`) and temperature. With `erasEnabled` (on) a season lasts
  `eraSeasonTicks` = 36,000 ticks (10 minutes at x1) and a year is four of them, 40 minutes (`js/sim/eras.js`).
- Winter cuts patch regrowth to 20% (`winterRegrow`), summer raises it to 150%. Each year there is a 25% chance (`droughtChance`) that one basin's patches stop regrowing for the summer.
- Every `invasionInterval` (180,000 ticks) an invasion pulse of 12 blobs of one lineage arrives at a world edge (`js/sim/invasion.js`).

### Body, energy and temperature

- Energy: start 800, max 25,000. Costs per tick are a passive loss, movement, turning, size and vision. A blob's radius is `baseSize` (25, x the size trait) plus energy / 250, never below `minSize`.
- **Temperature** (`js/sim/temperature.js`): each blob has a body temperature from 0 to 100, starting at 50. Moving and eating warm it; passive loss cools it (faster in winter and in the cold margin).
  The optimal band is 40 to 65. Outside it passive energy loss rises (up to 2x), thrust efficiency drops (down to 0.3 cold, 0.6 hot), and past the stress thresholds a blob cannot mate.

### Specialisations

Five types (`specialisations` in the defaults; `GENOME_SPECS`). Each has its own body shape on screen (the help drawer's legend shows them). They differ in vision range and a few multipliers:

| Type       | Vision | Difference                                                                                          |
| ---------- | ------ | --------------------------------------------------------------------------------------------------- |
| Forager    | 300    | The baseline; eats plants                                                                           |
| Predator   | 350    | `canHunt`; bites hit 8x; eats only meat; sprints 1.6x; cheaper standing costs; pays a `huntUpkeep`   |
| Reproducer | 250    | Half the mating cooldown                                                                            |
| Scout      | 400    | Moves at 0.7x energy cost, sees furthest                                                            |
| Defender   | 350    | Takes half damage from bites                                                                        |

When the predator count falls under `predatorRescueMin` (3) an immigrant arrives as a predator every `predatorRescueInterval` (450) ticks
(`js/sim/predator-rescue.js`), and the floor prefers a specialisation with none alive.

### Fighting, signalling and scent

- **Bites.** A hunter bites a target that is kin-free, smaller than 0.8x its size and inside its `biteArc` (a 90-degree half-angle forward cone). A fatal bite pays the biter `predatorKillEnergy`.
- **Calls.** Alarm and hunt calls are heard within `callRadius` (300) for 60 ticks and feed the "heard" inputs; each also drops scent.
- **Smoke** blocks rays for `smokeTicks` (180) and costs 20 energy.
- **Scent** (`js/sim/pheromones.js`): three decaying, diffusing grids. `danger` (dropped by alarms and where a blob is bitten), `attack` (where a blob bites) and `hunt` (hunt calls).
  A bite in the same pack window (`packWindow` 120 ticks) as another counts as a shared kill.

### Reproduction

- **Mating** (`js/sim/mate-eligibility.js`, `mate-search.js`): two mature (600 ticks), rested, energetic (above 200) blobs of the **same specialisation** and **opposite sex**
  (`sexesEnabled`), within `mateRange` (200) edge to edge, whose sizes are within 1.3x and whose genomes are close enough (`mateDistanceMax`). The female picks the strongest male (by energy; by merit if merit is on). She is pregnant for 480 ticks, then gives the child a share of her energy (`childEnergyShare`, trait `childShare`).
- **Splitting.** A mature blob with enough energy (`splitMinEnergy` 900, scaled per type) splits asexually into a mutated copy. Sex does not matter.
- **Limits.** A mother may give at most `maxBirthsPerWindow` (5) births per 3,000 ticks (`js/sim/birth-budget.js`). Near `maxAgents` births wait or stop short by `splitCapMargin` (`capBirthsEnabled`), so pregnancies are not lost to a full world.

### What kills a blob

`DEATH_CAUSE` in `js/sim/events.js`; a blob that ate anything leaves a carcass:

| Cause        | When                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------- |
| `STARVED`    | Energy reached 0 through ordinary costs. Heat and cold act through these costs.            |
| `EATEN`      | Energy reached 0 through a bite (or was bitten that tick)                                   |
| `COLLISION`  | Energy reached 0 through a wall or rock impact                                              |
| `OLD_AGE`    | `ageTicks` reached `maxAgeTicks` (36,000)                                                   |

## Evolution

`js/evo/` decides which brains get born. The sim calls a **policy** for every new genome; policies are registered in `js/evo/policies/index.js`.

| Policy            | What it does                                                                                                                              | Status                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `baseline-v5`     | The v5 fitness on the new core, for comparison                                                                                        | Instrument                                     |
| `natural-v1`      | Children by crossover and mutation; every immigrant is random; no archive                                                                 | Instrument                                     |
| `map-elites-v1q`  | `natural-v1` plus the MAP-Elites archive, scored by `fitnessV1`, parents drawn by a 4-cell tournament                                     | **Live** (`LIVE_POLICY`): the app and nightly evals |
| `map-elites-v6`   | The same archive scored by `fitnessV6` and placed by `descriptorV6`                                                                       | Built, not live: preview with `?policy=map-elites-v6` |

**Natural selection inside the world.** Blobs that eat, avoid being eaten and reach maturity pass genes on by mating and splitting, whatever the policy.
**The archive adds a second path.** When a mature blob dies it is scored and offered to a MAP-Elites archive (`js/evo/archive.js`): per specialisation a 10 x 10 grid
of cells, each holding an elite and a challenger with running statistics. Once the archive holds 10 occupied cells, initial agents, floor spawns and immigrants are seeded from it
(`js/evo/policies/map-elites-seed.js`): half a mutated child of an archive parent, three tenths an unmutated clone, the rest random. The archive can be exported with `E`.
It lives in the worker's memory for the run; saving it between sessions is Phase 5 of the worker and renderer design.

### How fitness is scored now (live)

`fitnessV1` (`js/evo/fitness.js`): energy gathered from food and bites, plus 300 per child, plus 0.5 per tick of life (capped at 30,000) once the blob has eaten 500,
plus a capped role term (forager food, predator kills, reproducer children, scout cells explored, defender kin bites absorbed). The archive cell is `descriptorV1` (`js/evo/descriptors.js`): mean speed by mean crowding.
Its known weakness, and the reason for the next work: it rewards luck. In measured worlds most food is eaten by chance contact, one specialisation (the scout) holds the world, and behaviour stops improving.

### The candidate: `fitnessV6` and in-world merit (built, off)

`fitnessV6` (`js/evo/fitness-v6.js`, with `fitness-v6-skill.js`, `-lineage.js`, `-diversity.js`) pays **skill over luck**. The observer classifies each meal or bite as
*deliberate* (the blob had the food or prey in view on a ray, closed on it and turned towards it, `isDeliberate` in `js/sim/merit-state.js`) or *chance*.

| Group     | Pays for                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Skill     | Deliberate intake in full and chance intake nothing; survival and role terms and credits (escape, converged kill) that only count once the blob has fed on purpose (the gate) |
| Born      | Children that were born                                                                                                   |
| Lineage   | Children that reached maturity, descendants still alive at death (gated)                                                  |
| Waste     | A charge for idle calls and smoke and for undefended bites, capped at half the positive score                              |
| Diversity | A multiplier that favours rare niches (specialisation by size tercile)                                                     |

`map-elites-v6` places elites by `descriptorV6`: deliberate share of intake by body plan (size plus vision traits). Exploit bounds (`js/evo/scripted-v6.js`) are scripted blobs that try to farm each term, so a term is shown to be bounded.

**In-world merit** (`js/sim/merit*.js`, `meritEnabled`, off by default) is a decaying per-blob score from sim state alone. When on it scales
the energy a child is born with (`meritBirthBoost`) and gates splitting on deliberate foraging (`splitDeliberateMin`), so selection acts inside the world and not only through the archive.
`?merit=1` turns it on with the trial values `MERIT_PREVIEW`.

Details, constants and decisions: [fitness-and-selection.md](docs/designs/fitness-and-selection.md).

## How agents improve, and how we measure it

There is no gradient training and no reward fed to a network. A blob's weights never change because of a score. Brains
improve only because the ones that live well are copied, mixed and mutated into the next ones. The score decides **which
genomes get copied**; the measurements tell us whether the whole loop is making worlds more skilful and more watchable,
or has stalled ("behaviour stops improving").

### The loop inside one run

```
   +--> seed new blobs: mutate or clone an archive elite, or random
   |                              |
   |                              v
   |              blob lives: senses -> brain -> acts (eat, bite, flee, mate, split)
   |                              |      the observer counts what it did
   |                              v
   |              blob dies: a fitness function scores its life
   |                              |
   |                              v
   +--- MAP-ELITES ARCHIVE <--- offered to the cell its descriptor picks; the best genome per cell stays
        (10 x 10 cells per type)

   In the world, at the same time: mating (crossover) and splitting (a mutated copy) pass genes on
   without the archive. In-world merit (built, off) tilts who mates, how much energy a child gets and who may split.
```

| Step                  | What happens                                                                                                                                                                                                                          | Code                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Watch a life          | The observer keeps per-blob counters: food and bite energy, children, and for `fitnessV6` whether each meal or bite was deliberate, plus chases, pack kills and patches visited                                                      | `js/evo/observer.js` and `observer-*.js`, `life-counters.js`        |
| Score at death        | The live policy `map-elites-v1q` (`LIVE_POLICY`) scores with `fitnessV1`. The candidate `map-elites-v6` scores with `fitnessV6` (skill, born, lineage, watch, waste, diversity; see [the candidate](#the-candidate-fitnessv6-and-in-world-merit-built-off)) | `js/evo/policies/index.js`, `fitness.js`, `fitness-v6.js`           |
| Keep the best         | The blob is offered to the cell its descriptor picks (`descriptorV1`: speed by crowding; `descriptorV6`: deliberate share by body plan). A cell keeps an elite and a challenger                                                      | `js/evo/archive.js`, `descriptors.js`, `policies/map-elites-offer.js` |
| Seed from the archive | Once 10 cells are occupied, a new lineage (initial agent, floor spawn, immigrant) is a mutated archive parent below `archiveShare` (0.5), an unmutated clone up to `cloneShareEnd` (0.8), otherwise random. Both are policy options a screen can vary | `js/evo/policies/map-elites-seed.js`, `policy-options.js`           |
| Select in the world   | Blobs that eat, avoid being eaten and mature pass genes on by mating (crossover of whole neurons) and splitting, whatever the policy. In-world merit (`meritEnabled`, off) biases mate choice, birth energy and the split gate          | `js/evo/crossover.js`, `js/sim/reproduction.js`, `js/sim/merit*.js` |

Only the genome is inherited. The hidden state and the Hebbian `fastOut` weights adapt **within a life** and are zeroed
when a slot is reused (`zeroSlot` in `js/sim/world.js`), so a child gets its parent's genome and never what the parent learned.

### Watching a run live

| What                           | Where                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar                        | Year, season, generation, speed, count per type, `born %`, predators alive, calls per 1000 ticks, the largest type ([The top bar](#the-top-bar))                                                                                                        |
| Charts drawer (`C`)            | Five uPlot charts (`chartDefs` in `js/app/ui/charts.js`): family river, population by type, births against deaths, catch against escape, archive coverage                                                                                              |
| Inspector (`I`)                | The selected blob's inputs in groups, a radar of its rays, the hidden layer as a grid, its 11 outputs and counters such as kills, children and `fitnessSoFar` (`js/app/ui/inspector-data.js`)                                                             |
| Logs and replays               | `npm run replay -- --seed <n> --ticks <n> --level debug` replays a world and writes `.sim/logs/<runId>.jsonl`; `--follow <genomeId>` traces one genome; `--check-invariants` audits the world. `E` and `B` in the app export the archive and a debug bundle that replays the run |
| Events to look for             | `FitnessScored` (debug): a death's score and, for `fitnessV6`, its parts, written when the policy offers the death to the archive. `MeritSummary` (debug): merit mean and p90, blobs ready to split, gated splits (`js/sim/log.js`)                      |
| Telemetry dashboard (optional) | `bash -lic 'npm run aspire:dashboard'`, then run with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`; UI at http://127.0.0.1:18888. Nothing is sent unless that variable is set (`scripts/lib/otel.mjs`)                                           |

### Measuring offline

One run is an anecdote and evolution is noisy, so every claim is measured on many fixed seeds and compared with a
bootstrap. All of this runs headless on the sim core.

| Tool               | Command                                                      | What it answers                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eval               | `npm run eval -- --seeds 16 --ticks 200000 --policy <name>`  | A scorecard of metrics (`js/evo/metrics*.js`) over seeds from `evals/seeds.json`, on a worker pool; reports go to `evals/results/`                                                                                                                             |
| Compare            | `npm run eval:compare -- before.json after.json`            | Per metric, a BCa 95% interval on per-seed differences and a verdict: `better`, `worse` or `no-difference`. It needs the interval to exclude 0 and a change of at least 5% of the before mean (`--min-effect`). It refuses under 16 seeds or mismatched config and seeds |
| Power              | `npm run eval:power -- report.json`                          | How big a change each metric can detect and how often it cries wolf, by resampling one report with no new runs                                                                                                                                                 |
| Screen             | `npm run screen -- --grid evals/screens/<grid>.json`        | A grid of arms (config overrides and `policyOptions`) on a few seeds, resumable per arm; `table.md` and `verdicts.json` land in `evals/screens/results/<grid>/`. A screen cuts bad ideas; it is not a verdict                                                  |
| Skill ladder       | `npm run ladder`                                             | Scripted controllers from `random` up through `wanderer`, `sloppyForager`, `foodSeeker` and `fleer`, then hunter against forager and fleer, in the default world: does skill beat chance there? (`LADDER_RUNGS` in `js/evo/ladder.js`)                         |
| Champion league    | `npm run league -- candidate.json [--admit]`                | A candidate genome plays 8 seeds against every admitted champion and its Elo moves (`evals/league.json`, `js/evo/league.js`, `elo.js`)                                                                                                                         |
| Anti-exploit suite | `test/evo/anti-exploit.slow.test.js`                         | Scripted cheats (`spinner`, `sitter`, `jawSitter`; for `fitnessV6` also `gateThenIdle`, `mateHopper`, `splitSpammer` in `js/evo/scripted-v6.js`) must not out-score an honest `foodSeeker` beyond a bound, so a fitness cannot be farmed                      |
| Determinism        | `test/sim/golden.json`, `npm run browser:hash`              | The same seed and config give the same world hash in Node and in Chromium, so a changed number means a changed world, never noise                                                                                                                              |
| Speed              | `npm run bench`, the `bench-check` gate                      | Milliseconds per tick and per phase against `bench/baseline.json`                                                                                                                                                                                              |

Each eval metric has a direction. `higher` or `lower` gets a verdict from `eval:compare`; `watch` is reported with an
interval and no verdict.

| Group              | Examples                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill, not luck    | `eval.deliberate_food_share` (food eaten after seeing it and closing on it), `eval.pursuit_kill_share`, `eval.evasion_skill`, `eval.skill_trend` (is skill rising across the run?) |
| Predators and prey | `eval.predator_presence`, `eval.predator_births`, `eval.catch_rate`, `eval.escape_rate`, `eval.pack_kill_share`                                                                 |
| Lineage            | `eval.lineages_alive`, `eval.lineage_lifespan_p50`, `eval.child_survival`, `eval.offspring_per_life`                                                                            |
| Diversity          | `eval.spec_dominance` (lower is better), `eval.spec_effective`, `eval.body_plan_coverage`, `eval.trait_spread`, `eval.behaviour_coverage`                                       |
| Worth watching     | `eval.migration_index`, `eval.lineage_turnover`, `eval.idle_signals_per_1k` (call and smoke spam, lower is better), `eval.alarm_precision`, `eval.hunt_call_precision`           |
| World health       | `eval.food_energy_per_1k`, `eval.fed_median_lifespan`, `eval.births_per_1k`, `eval.floor_episodes`, `eval.born_share`                                                           |
| Merit (when on)    | `eval.merit_mean`, `eval.merit_mate_gain`, `eval.split_gated_share`, `eval.merit_fitness_corr`                                                                                  |

Definitions and directions: [evolution-evals.md](docs/designs/evolution-evals.md#metrics).

### How a change is accepted

The `run-evolution-loop` skill (`.claude/skills/run-evolution-loop/SKILL.md`) is the rule for any change that claims to
improve evolution or speed.

1. **Predict first.** Add an entry to `evals/experiments.json` (`id`, `hypothesis`, `prediction`, `targets`, the policies) before running. A prediction written after the result is not one.
2. **Run both arms.** At least 16 seeds per arm, the same seeds on the same machine, on two seed sets (1-16 and 17-32); Targets that need it (lineage metrics, `eval.floor_episodes`) run 32 seeds.
3. **Compare.** `eval:compare` with `--targets` and `--fail-on-worse`. `no-difference` stays `no-difference`; with about 25 metrics one stray verdict is expected by chance (experiment `E0` calibrates this).
4. **Check for exploits.** A fitness gain with no gain in food or lifespan is replayed with `--follow` before it is believed.
5. **Record and act.** Fill in the experiment with its verdicts; keep a `better` change, revert a `no-difference` one, never merge a `worse` target.

A real one is `E47` (`evals/experiments.json`, `evals/experiments/E47-prediction.md`). After the predator fix, a predator
`biteMultiplier` of 12 had cost fed blobs some lifespan. The prediction, written before the run, was that 10 or 8 would
keep the gain in catches and predator births while recovering that lifespan. On 32 seeds of 200,000 ticks, bite 8 against
the reference (seeds 1-16 / 17-32):

| Metric                     | Reference     | Bite 8        | Verdict                      |
| -------------------------- | ------------- | ------------- | ---------------------------- |
| `eval.catch_rate`          | 0.006 / 0.005 | 0.060 / 0.051 | `better` on both sets        |
| `eval.predator_births`     | 3.6 / 5.2     | 127.4 / 39.5  | `better` on both sets        |
| `eval.fed_median_lifespan` | 5802 / 6180   | 5743 / 5760   | `no-difference` on both sets |

Bite 10 lost lifespan on the second set (`worse`, -8.5%), so bite 8 became the default. The prediction was right about
`catch_rate` (about 0.06) and too low about predator births (about 45 expected, 40 to 127 seen).

### Where it is heading

Fitness and selection Phase 4 ([fitness-and-selection.md](docs/designs/fitness-and-selection.md), tasks T43 to T51) turns the candidate into the default:

1. A reference run of the live policy (`E37`), then **round A** (each merit lever alone) and **round B** (pairs, and `fitnessV6` weights through `policyOptions`) as screens, then an **archive round** (`immigrationInterval`, `archiveShare`, `cloneShareEnd`, `descriptorV1` against `descriptorV6`).
2. At most three **finalists** at 16 seeds on two seed sets, with the ladder, the anti-exploit suite and `eval:power`.
3. If a finalist meets the done criteria (for example `eval.deliberate_food_share` at least 0.20 from 0.115, `eval.skill_trend` positive on at least 10 of 16 seeds, `eval.spec_dominance` at most 0.55, `eval.mating_share` at least 0.35), merit is switched on, `LIVE_POLICY` becomes `map-elites-v6`, the golden hashes and baselines are re-pinned, and a 600,000-tick run (`E42`) must show skill still rising.

The goal is worlds that keep getting more skilful and more watchable instead of settling into one dominant type.

`npm run train` does not exist yet. [AGENTS.md](AGENTS.md) lists it as arriving with a planned design doc, and Phase 3 of
[evolution-rework.md](docs/designs/evolution-rework.md) specifies it: a headless trainer that runs generations of episodes on
its own seeds, resumes from an archive file and exports champion genomes for the league. It waits for the work above.
An automated improvement loop is planned separately in [improvement-loop.md](docs/designs/improvement-loop.md). Today the
loop is run by hand, by agents following the skill.

## Determinism, evals and quality

- **Determinism.** `step` in `js/sim/step.js` runs fixed phases in order (`STEP_PHASES`: environment, hash, sense, brain, signal, physics, lifecycle, field, merit, invariants). Randomness comes from named streams of one seeded generator (`js/sim/rng.js`),
  and `Math.tanh`, `exp` and friends are replaced by `det-math.js` so results do not depend on the engine. `test/sim/golden.json` pins a world hash for fixed seeds; `npm run browser:hash` checks it in Chromium.
- **Evals.** Fixed-seed runs, comparisons, screens, the ladder and the league are described in [How agents improve, and how we measure it](#how-agents-improve-and-how-we-measure-it).
- **Quality.** `scripts/check.sh` is the one gate (conventions, design index, format, lint, typecheck, deps, duplicates, tests with a coverage ratchet, benchmark check, build, eval smoke). CI runs the same script. Small modules, size limits and a test for every behaviour are enforced.

Commands, tiers and rules: [AGENTS.md](AGENTS.md) and [docs/coding-standards.md](docs/coding-standards.md). Measuring an evolution change: the `run-evolution-loop` skill in `.claude/skills/`. Verified platform facts and
learnings: [docs/designs/sim-notes.md](docs/designs/sim-notes.md).

## Where we are going

Everything below works towards one goal: a world that is interesting to watch. The principles behind it - no
spinning, no single type taking over, travel, hunting, real selection, many small families, cooperation and pack
hunting - are in [docs/principles.md](docs/principles.md), each with the metrics that measure it.

The order of work is the **Build queue** in [docs/designs/README.md](docs/designs/README.md), which is generated and always current. In short:

1. **Fitness and selection** (priority 1, in progress). Phases 1 to 3 are built: the metric audit and new metrics, the predator survival fix, in-world merit (off), `fitnessV6`, `descriptorV6`, `map-elites-v6` and the exploit bounds.
   Next is a **terrain round** (checking heat stress and terrain deaths, then terrain keys such as `refugeRocks` and refuge food, screened with `npm run screen`), then **Phase 4 tuning**: experiments that choose the weights, switch merit on and make `map-elites-v6` the live policy.
   That will change the default behaviour of the world, so the golden hashes and baselines are re-pinned in the same step.
2. **World balance and biology** ([world-balance.md](docs/designs/world-balance.md)). Phases 1 to 4 are built (sexes, patches, eras, carcasses, traits, leaky memory, Hebbian learning, terrain). Phase 5 settles the balance on a tuning night; Phase 6 adds disease.
3. **Quality gates and test tiers** ([quality-gates-and-test-tiers.md](docs/designs/quality-gates-and-test-tiers.md)). Faster pre-commit checks, mutation testing, a browser smoke test and a pull-request performance job.
4. **Worker and renderer** ([worker-and-renderer.md](docs/designs/worker-and-renderer.md)). The worker, renderer core, interface, director, audio and capture are built; what remains is the dev-machine budget measurements, manual walks, and Phase 5: saving the archive between sessions.
5. **Later.** The evolution trainer and champions ([evolution-rework.md](docs/designs/evolution-rework.md)), an automated improvement loop ([improvement-loop.md](docs/designs/improvement-loop.md)), v6 tidy-up with new screenshots and docs ([v6-tidy-up-and-docs.md](docs/designs/v6-tidy-up-and-docs.md)), and releases and community ([deployment-and-community.md](docs/designs/deployment-and-community.md)).

## Developing

Work is planned and checked the same way every time. Read [AGENTS.md](AGENTS.md) first (it is written for coding agents but is the shortest map of the repo, the commands and the rules), then the design doc for the area you touch.

```bash
npm ci
scripts/check.sh            # the full local gate; add --fix to apply formatting
TEST_SCOPE=fast npx vitest run   # fast tests only
npm run bench               # sim step timings
```

Never commit to `main`: branch `<type>/<short-desc>`, conventional commit subjects, one design-doc phase per pull request.

## License

MIT. Fork it, modify it, evolve it.
