### 2026-11-11 - Capacity reference (carrying-capacity T6, E151)

`evals/decisions/E151/defaults-floor-on.json`: the defaults, floor on, 128 seeds of `evals/seeds.json`, 200000 ticks,
policy `live` (`map-elites-v6`), configHash `ff8d890a5a70c14d`, commit 512af1d6 (code-equivalent to the Phase 1 chunk A
merge), 288 metrics, 2792 s on 30 workers. It is the reference Phase 2 sets its arms from.

**The four detectors.**

| Metric                      | Mean   | SD    | Nulls | Liveness (distinct) | Power (FPR, MDE at 16 / 32 / 64)                | `minSeeds` | Status     |
| --------------------------- | ------ | ----- | ----- | ------------------- | ----------------------------------------------- | ---------- | ---------- |
| `eval.cap_share`            | 0.132  | 0.159 | 0     | live (58)           | 0.10 / 0.05 / 0.07; 0.20 / 0.15 / 0.10 absolute | null       | unverified |
| `eval.food_standing_share`  | 0.947  | 0.040 | 0     | live (128)          | 0.09 / 0.04 / 0.00; 0.05 / 0.03 / 0.03 absolute | 16         | verified   |
| `eval.density_starve_slope` | -0.130 | 0.439 | 0     | live (128)          | 0.11 / 0.10 / 0.06; none detected at any size   | null       | unverified |
| `eval.density_intake_slope` | -0.036 | 0.269 | 0     | live (128)          | 0.10 / 0.09 / 0.07; none detected at any size   | null       | unverified |

`eval.cap_share` is zero on 38 seeds, with median 0.068 and maximum 0.69; its spread is too wide for the 0.05 share bar,
so Phase 3's `eval.cap_share` criterion falls back to the exact sign test the plan already names. The two elasticities
have a false-positive rate near 0.10 and no planted step they detect up to 64 seeds (the `trend` bar is an absolute 0.10
and the per-seed SD is 0.3 to 0.4), so they cannot gate; the same sign-test fallback applies, and a screen reads their
mean over the arm with its interval. Liveness: the 284 older metrics read the same null share and distinct count as on
E150, as they must; `metric-liveness --write` rewrote `liveness.js` with E151 as the reference for all 288 (it has no
merge mode, and the reading of an old row is unchanged). Power came from `eval:power --include-watch --sizes 16,32,64
--splits 1000 --power-splits 200` on the four metrics (57 s), merged into `power.js` with `metric-power-write --merge`
(new: it keeps the readings the JSON does not name, so the 284 E150 readings stay).

**Does food brake the population today? No.** The starvation elasticity is -0.130 (standard error 0.039; 51 seeds
positive, 77 negative): starvation per agent does not rise with the crowd, it falls a little, the wrong way for a
food-limited world (boom years are also the years of plenty and the cap; season is held fixed, but time is not). The
intake elasticity is -0.036 (standard error 0.024; 59 positive, 69 negative): a 10% rise in population takes 0.4% off the
food each agent eats, about nothing. The map stands at 0.947 of `maxFood` edible, with the lowest seed at 0.84. The cap
is what stops growth: 90 of 128 seeds reach 450 and the mean seed sits at the cap on 0.132 of its checkpoints.

**Baseline re-read.** The E150 and E151 reports agree on every Baseline reading (same configHash, same sim). The table
used a tick-20000 cut for the trace readings; the detectors and `held` cut at `BURN_IN_TICKS` (tick 10000). At the 20000 cut
the old table is reproduced (89, 0.137, 30, 71, 17.5); at the 10000 cut that the instruments use the readings are:

| Reading                                            | Was (cut 20000) | Now (cut 10000)            |
| -------------------------------------------------- | --------------- | -------------------------- |
| Seeds that reach 450                               | 89 of 128       | 90 of 128                  |
| Share of checkpoints at 450 or more                | 0.14            | 0.132 (= `eval.cap_share`) |
| Seeds that stay at 100 or more (`held`)            | 30 of 128       | 29 of 128 (0.227)          |
| Seeds that fall under 40; median lowest population | 71; 17.5        | 71; 17.5 (unchanged)       |
| Floor guard fires (`eval.floor_episodes` above 0)  | 61              | 61 (unchanged)             |
| Hunters alive at the last tick                     | 95              | 95 (unchanged)             |
| Hunter extinctions under 40 / at 40 or more        | 33 / 0          | 33 / 0 (unchanged)         |
| Chase catch share, hunters extinct against alive   | 0.056 / 0.053   | 0.056 / 0.053              |
| Chance against deliberate food energy per 1k       | 313 / 226       | 313.2 / 225.9              |
| `eval.collision_death_share`                       | 0.27            | 0.270                      |

The edge for `held` stands at 100: by lowest population after burn-in, seeds under 40 hold hunters alive on 38 of 71, and
every one of the 57 seeds at 40 or more keeps its hunters (9 of 9 at 40 to 60, 19 of 19 at 60 to 100, 29 of 29 at 100 or
more); no seed whose lowest population is 80 or more ends under 80 (0 of 38), while 51 of the 99 seeds that dip under 100
and 38 of the 58 whose lowest is under 10 do (so the guard keeps its constant, 100). Hunters die only in worlds that
crashed, as the plan says.

**The food ratio.** The plan wants the eaten rate that sets the food arms. The report holds no item counts, so a
throwaway driver (`createWorld` and `step` with the live policy, seeds 313056, 337535, 612370, 446985, 639124, 888035,
654502, 275725 of `evals/seeds.json`, 200000 ticks, defaults, floor on; it only reads `floraMeals[0]`, `foodGone` and
`foodCount`, so the sim is untouched) counted per tick: plant meals eaten (`floraMeals[0]`), items rotted (`foodGone`
ROTTED, exact because rot empties a slot late in the tick) and spawned (the change in `foodCount` plus both).

| Per tick, 8 seeds, 1.6M ticks | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Offered by the formula        | 10.5 x mean scarcity 0.85 = 8.93 (`foodRegrowPerArea` 0.09)                |
| Spawned (map full, clipped)   | 1.94                                                                       |
| Eaten (plant meals)           | 1.59, 0.0075 per agent per tick at a mean of 211 agents (0.0064 to 0.0082) |
| Rotted                        | 0.33 (17% of leavers)                                                      |
| Eaten against offered         | 0.18 (0.03 in the extinct worlds, 0.33 in the booming ones)                |
| Eaten against spawned         | 0.82                                                                       |

So **the food ratio is 0.18**: the formula offers about 5.6 times what the agents eat, and the map clips the rest. By
season the eaten rate is 1.56, 2.07, 0.97 and 1.50 per tick (the four `seasons` entries in order, scarcity 1.2, 1.0, 0.8
and 0.4), lowest in the third. The population that eats a given supply is supply over 0.0075: 1.5 to 2.6 items
per tick for 200 to 350 agents.

**T66's eaten rate was low.** The T66 driver counted an eaten item as a slot empty at the end of the tick. The feed phase
empties it and `spawnFood` in the same tick's field phase often refills the slot first, so those meals vanish from the
count. The same scan on these runs gives 0.67 eaten per tick against the true 1.59 (a ratio of 0.42), which matches T66's
0.62; its rot figure (0.30) matches the 0.33 here because rot empties slots after the spawn. The T66 turnover of 0.9 per
tick was therefore about 1.9.

**Open gap in the food ratio.** The ratio is plant meals (`floraMeals[0]`) per tick over the offered rate, from 8 seeds of
200000 ticks and an uncommitted throwaway probe, so it cannot be reproduced from the committed report. `E151`'s
`eval.food_energy_per_1k` (539) at `foodEnergy` 100 implies about 1.14 plant items per tick at 211 agents, against the
probe's 1.59. Candidate causes, none checked: carcass energy in the metric, how the time mean is pooled (agent-ticks
against ticks), and energy per item not being 100 (the probe saw 63 stored per meal). The arms below bracket both
estimates: 1.14 is about 0.0115 and 1.59 about 0.016. T8 should settle the gap first, ideally with a committed probe or a
metric.

**What Phase 2 T8 needs.**

- **Set the arms from 1.59 items per tick, not 0.6.** The `foodRegrowPerArea` whose supply equals the eaten rate is
  1.59 / (116.64 x 0.85) = 0.016, so the arms at 0.5, 0.75, 1.0 and 1.5 times it are 0.008, 0.012, 0.016 and 0.024. The
  plan's 0.003 to 0.009 would give a fifth to a half of the eaten rate and read as starvation
  (`E-CC-1` could fail on the arms, not on the idea). A world held at 200 to 350 agents eats 0.015 to 0.026 worth, so
  the 1.0 and 1.5 arms (supply for about 210 and 320 agents) are the ones that can settle in the target band; the 0.5 and
  0.75 arms (about 105 and 160) sit at or near the `held` edge, which is exactly the "less food only deepens the fall"
  risk the stop rule names. Read the
  per-arm intake under 50 prey as the plan says.
- **The detectors will move with food.** An arm brakes if `eval.density_starve_slope` turns positive and
  `eval.density_intake_slope` turns clearly negative against -0.13 and -0.04; both are unverified and cannot gate, so the
  arm table reads their mean and the share of seeds with the right sign beside `held`, `alive` and `eval.cap_share`.
- **`eval.cap_share` cannot be a verified metric at 64 seeds** (MDE 0.10 absolute at 64); judge it by the paired sign test.
- **`eval.food_standing_share` is verified at 16 seeds** and reads 0.947 now; a food arm that bites should pull it well
  under that, and it is the cheapest check that an arm made food short.
- **The `held` constant stays at 100**; the plan row for moving it does not fire.
- **Caveats on the probe**: plant meals only (carcass meals and herd grazing are not in the 1.59), 8 seeds, and the
  eaten rate follows population, so it is a reference rate, not a ceiling.
