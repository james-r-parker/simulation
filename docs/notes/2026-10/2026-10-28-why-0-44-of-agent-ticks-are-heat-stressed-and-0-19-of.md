### 2026-10-28 - Why 0.44 of agent-ticks are heat-stressed and 0.19 of deaths are collisions (fitness-and-selection T42a)

Diagnosis only: no world rule changed. Replays tallied by a `stepFn` wrapper around `runReplay` (not committed), live
policy, seeds 1-8, 200000 ticks, burn-in 10000, one sample per 100 ticks (5.69M agent samples, 59,982 deaths), on main
`a422d80` (T15d defaults, bite 8, merit and fitness off). Screen arms are 8 seeds x 200000 ticks, judged by means
only: 8 seeds give no `eval:compare` verdict.

**The numbers reproduce.** The E36 fix arm had bite 12; only the bite differs from today's defaults, and the metrics
match.

| Metric                     | E35 (64 seeds) | E36 fix (32 seeds) | main (16 seeds, sd) | main (8-seed screen) |
| -------------------------- | -------------- | ------------------ | ------------------- | -------------------- |
| `eval.heat_stress_share`   | 0.442          | 0.418              | 0.450 (0.047)       | 0.445                |
| `eval.cold_stress_share`   | 0.055          | 0.062              | 0.056 (0.010)       | 0.062                |
| `eval.terrain_death_share` | 0.194          | 0.188              | 0.191 (0.026)       | 0.188                |

**Heat stress: the heat is the agents' own, and eating is most of it.** There is no heat field: the only terrain
temperature rule is the cold margin (`coldFactor` doubles `temperatureLossPassive` within `coldMarginWidth` of the
north and south edges). Temperature is a body state: moving warms it, eating warms it (`temperatureGainEat` 2 per
`foodEnergy` eaten), time cools it by `temperatureLossPassive` x the season's loss multiplier.

| Measure (replays, 8 seeds)                                           | Value                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Heat per agent-tick: movement / eating and biting / passive loss     | +0.0034 / +0.0054 / -0.0079 (eating is 61% of the gain; net +0.0009)        |
| Net heat per tick by season (spring, summer, autumn, winter)         | -0.0002 / +0.0030 / +0.0007 / -0.0005                                       |
| Hot share by season                                                  | spring 34%, summer 58%, autumn 52%, winter 36%                              |
| Temperature (share of agent-ticks)                                   | under 40: 7%; 40-70: 31%; 70-90: 24%; 90 to 99.99: 37%; at 100: 1.4%        |
| Hot share by energy (under 200 / 200-1k / 1k-5k / 5k and over)       | 16% / 24% / 54% / 75%                                                       |
| Hot share by age (under 600 / 600-5k / 5-15k / 15k and over)         | 1% / 28% / 66% / 51%                                                        |
| Hot share by radius (under 25 / 25-30 / 30 and over)                 | 21% / 25% / 58% (63% of agent-ticks are at 30 or more)                      |
| Hot share, cold margin against the rest                              | 34% against 46%; the margin holds 9.3% of agent-ticks for 14.8% of the area |
| Mean speed fraction by band (40-65 / 70-85 / over 85)                | 0.38 / 0.40 / 0.32                                                          |
| Hot episodes (over 85): mean length; over 5000 ticks; ended by death | 3473 ticks; 22%; 20%                                                        |
| Mate-ready agent-ticks blocked only by heat (`blocksMating`)         | 53.9%                                                                       |

- **It is a thermal budget, not a sensing failure and not a hot biome.** A fed blob (energy over 5000, 20% of
  agent-ticks) is 75% hot because every food adds temperature and the passive loss is only 0.0075 per tick. Cooling
  from 85 to 65 with no movement and no food takes about 2300 ticks in spring, 4800 in summer, 3100 in autumn and 1800
  in winter, against a median lifespan of about 5700. The body-temperature doc's "equilibrium speed fraction 0.75"
  leaves eating out; with eating the balanced speed is about 0.25, below the live policy's mean of about 0.34.
- **The tuning predates the eras.** E11 to E18 tuned the rates with `seasonLength` 3600 (a year of 14400 ticks, so
  every life crossed every season); `erasEnabled` (T53) made a season 36000 ticks, so a life now spends its time in
  one season and summer's loss multiplier 0.55 is a summer-long heat wave. Summer and autumn are the hottest, but
  winter is still 36% hot (eating per tick is highest then, 0.0076, from a thin population), so the season is a part
  of the cause, not all of it.
- **Agents barely respond.** Hot agents move at 0.32 of top speed against 0.38 to 0.40 for the rest, which the 0.6
  thrust efficiency explains without any choice; they hold the cold margin less than its area. The brain has four
  temperature inputs, so the information exists; heat is cheap enough that little rewards using it: passive and size
  costs rise by about 25% on average, and mating is blocked above 85.
- **The cost to the world is small.** Heat blocks 54% of mate-ready agent-ticks, yet in the arms below mating share
  rises 57% with births per 1000 ticks up 6% (no verdict): births are limited by the budget and cap, not by heat.

Heat screen (8 seeds, means; `defaults` is the reference; every key exists, no code change):

| Arm                                         | heat  | cold  | mating share | births/1k | population | fed lifespan | spec dominance |
| ------------------------------------------- | ----- | ----- | ------------ | --------- | ---------- | ------------ | -------------- |
| `defaults`                                  | 0.445 | 0.062 | 0.196        | 0.107     | 365        | 5767         | 0.68           |
| `temperatureGainEat` 1                      | 0.210 | 0.162 | 0.308        | 0.113     | 337        | 5770         | 0.77           |
| `temperatureLossPassive` 0.01125 (+50%)     | 0.261 | 0.211 | 0.308        | 0.111     | 361        | 5639         | 0.70           |
| `temperatureGainMove` 0.005                 | 0.339 | 0.107 | 0.191        | 0.124     | 366        | 5440         | 0.60           |
| `temperatureSeasonSlope` 0                  | 0.420 | 0.044 | 0.175        | 0.113     | 341        | 5564         | 0.69           |
| `coldMarginWidth` 1200                      | 0.419 | 0.095 | 0.214        | 0.100     | 403        | 6066         | 0.70           |
| `temperatureHeatStress` 95 (moves the line) | 0.309 | 0.061 | 0.259        | 0.121     | 363        | 5603         | 0.59           |

Every arm moves heat; none moves fed lifespan or births by a clear margin. The defaults arm sits at mating share
0.196, just under the Phase 4 collapse line of 0.2. `temperatureGainEat` 1 and `temperatureLossPassive` 0.01125 each
trade heat for cold (cold stress 0.16 and 0.21) and lift mating share to 0.31, so a middle value should land heat near
0.3 with cold under 0.1. `coldMarginWidth` 1200 raises population 10% and fed lifespan 5% with heat at 0.42.

**Collision deaths: starvation with a bump, and most bumps are at the world edge.**

| Measure (replays, 8 seeds)                                              | Value                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Deaths by cause (starved / eaten / collision / old age)                 | 72.3% / 0.6% / 20.2% / 7.0%                                            |
| Collision deaths: world edge / wall / refuge rock outside / inside ring | 58.7% / 20.2% / 11.6% / 9.5%                                           |
| Bumps (energy drop of 45 to 70 in a tick, near an edge or rock)         | edge 56.7%, wall 19.3%, refuge outside 17.6%, refuge inside 6.4%       |
| Bumps per 1000 agent-ticks; share that kill                             | 1.245; 1.7%                                                            |
| Energy lost to bumps per agent-tick                                     | 0.062, about the base passive cost (0.06)                              |
| Energy before the fatal bump: 60 or less / median / 90th percentile     | 99.6% / 26 / 45                                                        |
| Drain of a blob at 60 energy or less                                    | 0.168 per tick, so the median fatal-bump blob had about 155 ticks left |
| Age at death, collision (all deaths): under 600 / 600-5k / 5-15k / 15k+ | 15.3% / 55.3% / 23.4% / 5.9% (6.0% / 47.6% / 27.6% / 18.8%)            |
| Specialisation `spec3` (78% of the population)                          | 74.3% of collision deaths                                              |
| Radius at death: under 25 / 30 and over                                 | 32.5% / 12.4%                                                          |

- **`eval.terrain_death_share` mostly measures the world edge, and mostly labels deaths that were coming.** 59% of
  collision deaths are at the world edge (`wallDamage`, which is not terrain), 41% at rocks. A fatal bump takes a blob
  with 60 energy or less, so the death moves forward by a median of about 150 ticks. The real cost is the drain:
  every approach to an edge or rock costs 50 whatever the speed, and a blob loses about 0.062 energy per tick to
  bumps, as much as its base passive cost.
- **Newborns are over-represented (15% of collision deaths against 6% of deaths); no specialisation is.** `spec3` is
  78% of the population and 74% of collision deaths. Deaths cluster on starving blobs, not on a kind.
- **Refuges are used at chance and trap a little.** Over 3 seeds x 100000 ticks, 0.22% of agent-ticks were inside a
  refuge against 0.27% of the world's area. After a blob reached a ring it entered on 35% of approaches under radius
  25, 17% at 25 to 30 and 1.3% at 30 or more, and 63% of agent-ticks are at 30 or more. Refuge rocks are 24% of bumps,
  with no food, no predation and no reason to go there. The earlier note's concern holds: the gap is 60 px against a
  blob diameter of 50 to 70.

Damage screen (8 seeds, means; existing keys, no code change):

| Arm                                  | terrain death share | population | fed lifespan | births/1k | mating share |
| ------------------------------------ | ------------------- | ---------- | ------------ | --------- | ------------ |
| `defaults`                           | 0.188               | 365        | 5767         | 0.107     | 0.196        |
| `obstacleDamage` 0 (rocks)           | 0.131               | 400        | 6096         | 0.098     | 0.203        |
| `wallDamage` 0 (the edge)            | 0.107               | 396        | 6663         | 0.094     | 0.201        |
| `obstacleDamage` and `wallDamage` 25 | 0.168               | 384        | 6072         | 0.103     | 0.222        |

Zero damage still leaves 0.11 to 0.13 labelled collision (the last loss before a starvation). Removing the bump adds
30 to 35 agents and 6% (rocks) to 16% (edge) fed lifespan: the edge is the bigger drain, and it is not terrain.

**What the evidence supports for T42b and T42c.**

- Wider entrances (`refugeRocks` 6 or 5, `refugeSizeMax` 45 or 60) fix the clearance, but refuges have no pull, so
  occupancy would only rise toward the area share (0.3%): `refugeFood` is needed for use, and a reason to be there
  (no predator bit near a refuge in the earlier note). Fewer rocks also cut refuge bumps (24% of all bumps).
- `wallGaps` 6 with `wallGapWidth` 400 relieves the wall's 19% of bumps; the migration index stayed at 0.064 to 0.067
  in every arm here.
- Not in the plan: the bump itself. A lower `wallDamage` and `obstacleDamage`, or a damage that scales with impact
  speed, removes most of the drain; `wallDamage` 0 is the largest single gain here.
