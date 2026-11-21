# Role-budget anchors (default config and evals/fair-chase/courser.json), 2026-11-21

Scripts (run from the worktree root): `lib.mjs`, `kinematics.mjs`, `chase.mjs`, `extra.mjs`, `herd.mjs`, `audit-summary.mjs`,
`dump-config.mjs`. Raw outputs: `*.out`, `audit-*.json`. All bodies at storeShare 0.5 (fat factor 0.75), temperature 50
(efficiency 1), season 0 (energyDrain 1), trait genes 0 (vision and size traits 1).
"CF" = closed form; "BF" = brute-force loop of the per-tick law; "SIM" = the real sim (stageArena + step, or the real module).

## Bodies

| Anchor                                                                           | forager / reproducer / scout / defender                                              | predator                                                    | How                        | Tests          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------- | -------------- |
| energy, maxEnergy                                                                | 1000, 2000                                                                           | 5000, 10000                                                 | config                     | size           |
| size                                                                             | 29                                                                                   | 45                                                          | CF = SIM                   | `size`         |
| thrust a cruise / sprint                                                         | 0.525 / 0.7875                                                                       | 0.525 / 0.945                                               | CF                         | `speedStep`    |
| uncapped steady cruise / sprint                                                  | 9.975 / 14.9625                                                                      | 9.975 / 17.955                                              | CF a d/(1-d)               | `speedStep`    |
| cap cruise / sprint (= steady speed)                                             | 8 / 12                                                                               | 8 / 14.4                                                    | CF = bodyTable             | caps           |
| ticks from rest to cap, cruise / sprint                                          | 32 / 32                                                                              | 32 / 32                                                     | CF = BF                    | `ticksToSpeed` |
| turn rate w (rad/tick)                                                           | 0.15                                                                                 | 0.105                                                       | CF                         | `w`            |
| ticks to swing 90 / 180 deg                                                      | 10.47 / 20.94                                                                        | 14.96 / 29.92                                               | CF                         | `swingTicks`   |
| speed on a held full turn, cruise / sprint                                       | 3.231 / 4.846                                                                        | 4.380 / 7.885                                               | CF                         | `turnCircle`   |
| turn radius cruise: CF / BF 80+60 ticks / bodyTable                              | 21.54 / 21.51 / 21.51                                                                | 41.72 / 41.81 / 41.81                                       |                            | `turnCircle`   |
| turn radius sprint: CF / BF / bodyTable                                          | 32.31 / 32.26 / 32.26                                                                | 75.09 / 75.26 / 75.26                                       |                            | `turnCircle`   |
| stop distance from cruise                                                        | 152                                                                                  | 152                                                         | CF cap d/(1-d) = bodyTable | -              |
| energy per 100 ticks cruise / sprint (adult)                                     | 102.72 / 227.72 (scout 104.74 / 229.74; defender 121.92 / 270.93)                    | 97.63 / 317.66                                              | CF                         | `tickCost`     |
| same, bodyTable                                                                  | 102.72 / 227.72 (scout 104.74 / 229.74; defender 121.92 / 270.92)                    | 58.65 / 190.68 (JUVENILE: x juvenileBurn 0.6, + huntUpkeep) | SIM                        | `tickCost`     |
| standing cost per tick                                                           | 0.06725 (scout 0.08743)                                                              | 0.01425 (+0.002 upkeep)                                     | CF                         | resting line   |
| view ahead / at 90 deg / behind (ray reach; add target size for centre distance) | forager 300/300/300; reproducer 250/250/250; scout 400/400/400; defender 300/270/240 | 400 / 280 / 160                                             | CF reachFactor             | `viewReach`    |
| reliableView of a forager-sized (29) target, centre distance                     | 148.65                                                                               | 148.65                                                      | CF 29/sin(pi/16)           | `reliableView` |
| gapAtAwareness of a forager (rear reach + hunter size)                           | -                                                                                    | 345                                                         | CF                         | `seeLead`      |
| forager grazing gait (BITE > 0): a, steady speed                                 | 0.315, 5.985 (handling: 1.197)                                                       | -                                                           | CF                         | `eat`          |
| refill gait                                                                      | THRUST < 0.2: speed under 1.995                                                      | same                                                        | CF                         | `refillTicks`  |

## Store (courser arm; off at the defaults = infinite burst, factor 1)

| Anchor                    | prey specs | predator | How                                     |
| ------------------------- | ---------- | -------- | --------------------------------------- |
| drain per sprint tick     | 0.01       | 0.005    | config                                  |
| ticks at factor 1         | 70         | 140      | CF = SIM (`stepSprintStore`)            |
| ticks with factor above 0 | 100        | 200      | CF = SIM                                |
| refill from empty         | 500        | 500      | CF = SIM (SPRINT <= 0 and THRUST < 0.2) |

## Bite and kill (predator at 5000, victim at storeShare 0.5 = 1000, no flight cost)

| Victim               | bite | kill line | bites to kill | bite gain | gorge | kill income | kick total (first) | carcass held |
| -------------------- | ---- | --------- | ------------- | --------- | ----- | ----------- | ------------------ | ------------ |
| forager / reproducer | 100  | 500       | 5             | 500       | 200   | 700         | 22.25 (5.156)      | 300          |
| scout                | 150  | 500       | 4             | 600       | 160   | 760         | 17.47 (5.156)      | 240          |
| defender             | 50   | 500       | 10            | 500       | 200   | 700         | 87.50 (10.311)     | 300          |

SIM check: gap 60, contact tick 1, kill tick 6, 5 bites over 5 contact ticks (one tick in the six had no contact), hunter net +675.6 (700 - 22.25 kick - costs).
In a real chase the prey burns its flight cost first, so fewer bites: 4 after 80 ticks of flight (gap 240), 2 after 149 ticks (defaults, gap 400).

## Hearing (defaults)

| Anchor                                       | Value                                            | How                                                                   |
| -------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| loudness at 0.5 x callRadius (150 px), t = 0 | 0.5                                              | CF                                                                    |
| first tick with loudness under 0.1           | t = 49 (t = 48 reads 0.10000000149 after fround) | BF of `hearOne` formula                                               |
| last audible tick                            | t = 59                                           | CF (timer callTicks at the call, -1 per tick before the hearing pass) |

## Herd (defaults)

| Anchor                                                                                   | Value                                                                                               | How                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| ring radius, herdSize 8                                                                  | 224.09                                                                                              | CF = SIM                  |
| half-width: ring + herdRadius + body size                                                | 333.09 (predator 349.09)                                                                            | CF                        |
| ticks to clear it sideways from the centre line, from rest, cruise / sprint              | forager 53 / 39; predator 55 / 36                                                                   | BF speedStep              |
| warning ticks at herdRunSpeed, herd first on the forward ray: (visionRange - size) / 6.5 | forager 41.7; reproducer 34.0; scout 57.1; defender 41.7 (behind 32.5); predator 54.6 (behind 17.7) | CF (doc model)            |
| trample loss, standing body: run 6.5 / walk 1.5                                          | size 29: 306.3 / 16.3; size 45: 475.3 / 25.3                                                        | CF                        |
| herd ramp to run speed (if nothing held it back)                                         | 65 ticks, 315 px                                                                                    | BF v += (6.75 - v) x 0.05 |
| REAL stampede (herd.mjs): mean speed at t+10/20/40/64/80/120/240                         | 2.91 / 4.46 / 5.14 / 4.31 / 3.87 / 1.32 / 0.46 (never 6.5)                                          | SIM                       |
| REAL stampede: centroid travel at t+80 / t+360                                           | 329 / 516 px (not 6.5 x 360 = 2340)                                                                 | SIM                       |
| REAL stampede: half-width of centres at t+0 / 80 / 160 / 360                             | 224 / 175 / 98 / 66                                                                                 | SIM                       |
| REAL trample of a standing forager 400 px beyond the ring                                | 43.3, 9.6, 2.8, 1.2 (not 306)                                                                       | SIM                       |

## Straight chase, predator sprinting from tick 0 at effort 1, forager fleeing straight and always sprinting, both from rest

Gap = centre distance at tick 0; contact = first tick with centre gap < 74. Scalar = speedStep + store; SIM = real world.

| Gap | courser scalar | courser SIM contact / kill | courser scalar, hunter at graded effort 0.5 | defaults scalar | defaults SIM contact / kill | defaults effort 0.5 |
| --- | -------------- | -------------------------- | ------------------------------------------- | --------------- | --------------------------- | ------------------- |
| 60  | 1              | 1 / 6                      | 1 (already touching)                        | 1               | 1 / 6                       | 1                   |
| 120 | 31             | 31 / 35                    | 119                                         | 31              | 31 / 35                     | never               |
| 180 | 56             | 56 / 60                    | 138                                         | 56              | 56 / 60                     | never               |
| 240 | 79             | 80 / 83                    | 156                                         | 81              | 82 / 85                     | never               |
| 300 | 93             | 93 / 96                    | 175                                         | 106             | 107 / 109                   | never               |
| 329 | 98             | 98 / 101                   | 184                                         | 118             | 119 / 121                   | never               |
| 400 | 109            | 109 / 112                  | 206                                         | 148             | 149 / 150                   | never               |

Largest gap closed inside 250 ticks (scalar): courser 796 (contact at tick 199), courser effort 0.5: 540; defaults 647; defaults effort 0.5: 73.
Courser with the ORACLES' play (hunter sprints while gap <= 400 and level > floor; prey sprints while gap < 360 and level > floor),
hunter facing: 80:10, 160:48, 240:74, 320:87, 380:97, 400:100, 401: never.

## audit:chase predator:forager, --trials 2 (16 trials per distance; bearings -180..135)

| Run                       | 80 px  | 160 px | 240 px | 320 px | 400 px |
| ------------------------- | ------ | ------ | ------ | ------ | ------ |
| courser, breaking evader  | 0.625  | 0.50   | 0.625  | 0.625  | 0.1875 |
| courser, --straight       | 0.8125 | 0.875  | 0.625  | 0.625  | 0.1875 |
| defaults, breaking evader | 0.25   | 0      | 0      | 0      | 0      |
| defaults, --straight      | 0.875  | 0.875  | 0.875  | 0.75   | 0.625  |

Bearing grids are in `audit-grid.out`: under courser the misses at 240 px and beyond are the rear bearings (-180, +-135), and at 400 px
everything but bearing 0 and -45 (the distance jitter of +-5% puts the prey past the hunter oracle's "in view" sprint gate).

## Other constants the calculator needs

world 14400 x 8100, maxAgents 500, initialAgents 100, maturityTicks 600, maxAgeTicks 72000, juvenileTicks 3000, predatorRestTicks 60,
digestTicks 10, handlingTicks 20, handlingThrust 0.2, grazeThrust 0.6, satiationShare 0.95, split gate 900 (predator 540, but birthReserve
300 at childEnergyShare 0.5 makes it 600), mateMinEnergy 200, entrantEnergy 200, initialEnergy 800, patchFoodDensity (doc formula) 4.387e-4 per px2
(spacing 47.7 px), prey-ahead drill gap 0.6 x 400 = 240 px, JINK_RANGE 120, MAX_TICKS 250.
