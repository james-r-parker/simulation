# Carrying capacity

**Status:** Superseded - by [low-density-edge.md](low-density-edge.md). Phase 1 is built; Phase 2 stopped the plan (2026-11-11, E152): the food brake shrinks the world and it still crashes at low density (sim-notes "Calibration stop (carrying-capacity T11, E152)"). Phases 3 and 4 are not built; low-density-edge.md carries T13 (the calendar in the mating dice), T14 (a mate seen only within reach, as its L1) and T19 (the keep rule in the docs).
**Depends on:** [metric-trust.md](metric-trust.md), [natural-selection.md](natural-selection.md)

The scene this doc serves ([principles.md](../principles.md)): **Boom and bust** - a local population swells, strips a
patch, crashes and is recolonised. Through it, the scenes that need prey to stand and hunters to live on them: **A real
chase**, **Abort**, **Pack, or loner**, **Scavenge**. The rules it enforces: the refusal **Smoothing away crashes** (the cap
and the floor must not be what holds the world), the trait **Senses are local and lossy** (no rule reads the calendar),
and selection rules 4 and 5 (strength is who remains after the bad season; incompetence kills first).

It is one coordinated change, as [natural-selection.md](natural-selection.md) was (#217): instruments first, one
calibration screen, then one switch PR. No flag is added. Attribution is by commit and by config value.

## Principle - food is the brake, the cap and the floor are guards

A population in nature stops growing because food per head falls. Here it stops only at `maxAgents`, and stops falling
only at the mating edge or the floor guard. After this change a world settles under the cap because intake per agent
falls as agents rise, a season reaches a blob only as cold and as less food, and a lone agent can still breed alone.
`maxAgents` and `floorTrigger` stay as guards that a healthy world does not touch.

## Baseline

The defaults on 128 seeds, floor on, 200000 ticks, policy `map-elites-v6`
(`evals/decisions/E151/defaults-floor-on.json`, configHash `ff8d890a5a70c14d`; every reading below that E150 and E151 share
is the same to the digit, since the sim is unchanged). Trace readings use the `pop` series at 1000-tick checkpoints after
`BURN_IN_TICKS` (tick 10000), the cut the detectors and the `held` guard use; the first version of this table cut at tick 20000.

| Reading                                                                       | Value                          | Source                                          |
| ----------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| Seeds that reach 450 agents (`maxAgents` less `splitCapMargin`)               | 90 of 128                      | trace `pop`                                     |
| Share of checkpoints at 450 or more                                           | 0.13 (`eval.cap_share` 0.132)  | trace `pop`                                     |
| Seeds that stay at 100 or more                                                | 29 of 128 (the `held` guard)   | trace `pop`                                     |
| Seeds that fall under 40                                                      | 71 of 128                      | trace `pop`                                     |
| Lowest population, median seed                                                | 17.5                           | trace `pop`                                     |
| Seeds where the floor guard fires                                             | 61 of 128                      | `eval.floor_episodes` (unverified)              |
| Seeds with hunters alive at the last tick                                     | 95 of 128                      | `aliveFlags` in `js/evo/keep-rule.js`           |
| Hunter extinctions among the 71 seeds that fall under 40                      | 33                             | both of the above                               |
| Hunter extinctions among the 57 seeds that stay at 40 or more                 | 0                              | both of the above                               |
| `eval.chase_catch_share`, hunters extinct against alive                       | 0.056 against 0.053            | verified at 16                                  |
| `eval.chance_food_energy_per_1k` against `eval.deliberate_food_energy_per_1k` | 313 against 226                | report                                          |
| `eval.collision_death_share`                                                  | 0.27                           | verified at 32                                  |
| Starvation per prey per 2000 ticks, 50 to 500 prey                            | 0.19 to 0.21 (flat)            | sim-notes 2026-11-06 (T66), 16 seeds, floor off |
| Edible food slots                                                             | about 3,590 of `maxFood` 3,600 | sim-notes 2026-11-06 (T66)                      |
| `eval.food_standing_share`                                                    | 0.947 (SD 0.040)               | E151 report                                     |
| `eval.density_starve_slope`, `eval.density_intake_slope`                      | -0.130 and -0.036 (no brake)   | E151 report                                     |
| Plant meals per tick, 8 seeds                                                 | 1.59 (T66 counted 0.62)        | `npm run food:ratio`, E152                      |

Food supply: `areaExpected` in `js/sim/food.js` asks for about 10.5 items per tick at scarcity 1 (`foodRegrowPerArea`
0.09 on a 14,400 by 8,100 world), and `spawnFood` clips that at `maxFood`. The map is full, so the realised turnover is
what is eaten and what rots: 1.20M and 0.57M slots over 16 runs of 120000 ticks in T66, about 0.9 items per tick. Phase 1
re-measured it (sim-notes 2026-11-11, T6): T66 counted an eaten item only when its slot was still empty at the end of the
tick, and a new item often refills it first, so its eaten figure was about 2.4 times short. On 8 seeds of 200000 ticks the
agents eat 1.59 plant items per tick (0.0075 per agent per tick), 0.33 rot and 1.94 are spawned; rot agrees with T66.
The food ratio is defined as plant meals (`floraMeals[0]`) per tick over the offered rate (10.5 x 0.85 = 8.92), 0.178.
**The gap is settled** by `npm run food:ratio` (`scripts/food-ratio.mjs`, tested), run on the same 8 seeds for 200000
ticks (`evals/decisions/E152/food-ratio-8x200000.json`): 1.587 plant meals per tick at a mean of 210.7 agents (0.0075 per
agent per tick), each meal storing 62.3 energy, not 100 (`foodEnergy` is the energy of the item; a meal stores less after
toxin and the energy cap). Plant energy is 98.8 per tick and carcass energy 16.8, so `eval.food_energy_per_1k` at 539 (548.9
in the probe) is 114 to 116 energy per tick, which is not 1.14 items: the metric counts stored energy from plants and
carcasses, and a plant item is worth 62. The probe's 1.59 stands, and pooling over seeds is not a cause (the mean of the
products and the product of the means agree, 113.9 and 114.3). A food arm brakes the population only when its supply is
under the eaten rate: `foodRegrowPerArea` 0.0160 at the year's mean scarcity of 0.85 (a world of 200 to 350 agents eats
1.5 to 2.6 items per tick, which is 0.015 to 0.026). The formula offers 5.6 times what the world uses. The Phase 2 arms
are 0.008, 0.012, 0.016 and 0.024.

## What changes

| #   | Change                                                                                                                                                                                                                      | Where                                                                        | Scene or rule                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| C1  | Food supply is cut until intake per agent falls with density and a world settles between 200 and 350 agents. The value comes from the Phase 2 screen, whose arms are set from the eaten rate `E151` measures                | `foodRegrowPerArea` in `js/sim/config-defaults.js`                           | Boom and bust; rule 5                       |
| C2  | The mating chance no longer reads the season. `reproductionBonus` leaves `seasons` and `mate`; the chance is 1 when a pair is eligible, and `mateChanceScale` goes with it                                                  | `mate` in `js/sim/reproduction.js`; `seasons` in `js/sim/config-defaults.js` | Senses are local; Season changes the map    |
| C3  | Mate scarcity is judged by reach, not by sight: `noteMatesSeen` counts a possible mate only when it is within `mateRange`                                                                                                   | `noteMatesSeen` and `isPossibleMate` in `js/sim/mate-scarcity.js`            | Rule 3; the shark rule as written           |
| C4  | The clonal cap is tested on the switched world: with C3 a split already needs no mate in reach, so `splitClonalMax` may bind only where a line is alone. It is deleted only if it harms (the keep rule); otherwise it stays | `splitKeysAllow` and `noteClonalBirth` in `js/sim/split-gate.js`             | Rule 3                                      |
| C5  | The keep rule gains a third seed guard, `held`: the seed's population stays at 100 or more after burn-in. Its test is the exact paired test of the other two, and a seed guard can also read `better`                       | `keepRule` in `js/evo/keep-rule.js`                                          | The detector for the crash                  |
| C6  | Every report a verdict rests on is committed under `evals/decisions/<id>/`, and `scripts/check-experiments.mjs` fails a record from this plan on whose reports are missing                                                  | `scripts/check-experiments.mjs`, `evals/experiments.schema.json`             | AGENTS.md "a claim carries the measurement" |

Not changed: brains, fitness, the archive, senses, the map, `maxAgents`, `floorTrigger`, `minAgents`, `capBirthsEnabled`
and `splitCapMargin`. No reward is added.

## What it deletes

| Deleted                                                         | Condition                                                                                                                                                                                                                                                    | Task |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `reproductionBonus` (four season entries) and `mateChanceScale` | Always (approved by the user, 2026-11-11, with the refusal of a world rule that reads the calendar, review P2). Animals breed by season through day length and condition, which a blob feels as temperature and food; no blob has a dice that knows the date | T13  |
| `splitClonalMax`, `world.clonalDepth` and `noteClonalBirth`     | Only if the cap harms: on 64 matched seeds at the head, the cap on reads `WORSE` than `splitClonalMax` 100000 on a keep-rule guard. Aphids do cap clonal runs, so no harm means it stays                                                                     | T15  |
| world-balance.md T79 to T96 and its "Open balance issues" table | With the docs task; none of those rows can run                                                                                                                                                                                                               | T19  |

No flag is added, so `scripts/flag-ledger.json` gains no row. `capBirthsEnabled` keeps its ledger row: it is the
control for T22.

## Detectors

| Detector                    | Meaning                                                                                                                                                                                                                                                                                                                                                                     | Unit, better           | Module                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------- |
| `held` (seed guard)         | 1 when the trace `pop` never falls under `HELD_POPULATION` (100) after burn-in                                                                                                                                                                                                                                                                                              | share of seeds, higher | `js/evo/keep-rule.js`            |
| `eval.cap_share`            | Share of checkpoints after burn-in with the population at `maxAgents` less `splitCapMargin` or more                                                                                                                                                                                                                                                                         | share, lower           | `js/evo/scene-capacity.js` (new) |
| `eval.food_standing_share`  | Mean over checkpoints of edible food slots over `maxFood`                                                                                                                                                                                                                                                                                                                   | share, watch           | `js/evo/scene-capacity.js`       |
| `eval.density_starve_slope` | Per seed, the elasticity at the season means of starvation deaths per agent per checkpoint window with respect to the population at the window's start (the least-squares slope times mean population over mean rate), over windows after burn-in, fitted inside each season and averaged, since season and time are confounded (T66); a season with mean rate 0 is skipped | trend, higher          | `js/evo/scene-capacity.js`       |
| `eval.density_intake_slope` | The same elasticity at the season means for food energy taken per agent                                                                                                                                                                                                                                                                                                     | trend, lower           | `js/evo/scene-capacity.js`       |

Each metric is registered in `js/evo/metric-registry/world-2.js` with an arithmetic test, a source test, a liveness
read and a power read before any verdict rests on it (metric-trust.md). The existing metrics read beside them are in
Targets.

## Phases

### Phase 1 - Instruments and the reference

**Targets:** none - detectors, the `held` guard and the reports directory; no sim behaviour changes and `worldHash` and the golden cases stay as they are.

- The four `eval.*` detectors and the `held` guard are built and tested.
- `evals/decisions/` exists. The E150 pair stays in `evals/power/`, where the registry's power and liveness rows already
  point, and the `E151` record's `before` names it; nothing is moved or copied.
- One 128-seed floor-on reference of the defaults carries the new metrics (`E151`); `eval:power` and
  `npm run metric:liveness` fill their registry rows.
- Done when each new metric is `verified` or its row says why it cannot be, and the baseline table above is re-read
  from `E151` with the food ratio measured.
- Why each unverified metric is so (`E151` power read, T6): `eval.cap_share` has a detectable change of 0.20, 0.15 and
  0.10 at 16, 32 and 64 seeds against the 0.05 share bar; `eval.density_starve_slope` and `eval.density_intake_slope`
  detect no planted step up to 64 seeds and have a false-positive rate of about 0.10. Phase 3 judges all three by the
  exact sign test on paired differences, not by `eval:compare`. `eval.food_standing_share` is verified at 16 seeds.

| Chunk | Tasks    | Contents                                                                         |
| ----- | -------- | -------------------------------------------------------------------------------- |
| A     | T1 to T4 | The guard, the detectors, the decisions directory and its check                  |
| B     | T5 to T7 | The reference run, the registry readings and the review (runs, not a code chunk) |

### Phase 2 - Calibrate on config alone

**Targets:** eval.births_per_1k, eval.lineages_alive, eval.spec_effective, eval.deliberate_food_share, eval.collision_death_share, eval.cap_share, eval.density_starve_slope, eval.food_standing_share

One screen on the unchanged code, floor on, policy live, 200000 ticks, on seeds 1 to 64 of `evals/seeds.json`. Arms
are config values only: a full factorial of four food values by two season settings, and the defaults.

| Factor | Values                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Food   | `foodRegrowPerArea` at 0.5, 0.75, 1.0 and 1.5 times the value whose supply equals the eaten rate of `E151` (about 0.008, 0.012, 0.016 and 0.024; T66's 0.003 to 0.009 undercounted) |
| Season | as the defaults; or flat: all four `seasons` entries written in full with `reproductionBonus` 1.5, so the chance is 1 all year                                                      |

- The grid (`evals/screens/carrying-capacity.grid.json`) has 10 arms: the defaults, the four food values, the same four on a flat season, and a flat season on default food (the arm `E-CC-1` says does not lift `held`).
- `createConfig` replaces `seasons` whole, so a flat arm lists the four entries with their other fields unchanged.
- A flat arm still draws the chance float in `findMale` (`js/sim/mate-search.js`, the `lifecycle` stream); the Phase 3
  code does not, so an arm and the switch are close, not bit-equal. The Phase 3 check is the judge.
- The first pass is 16 seeds and ranks only: it reads the `held` and `alive` counts and `eval.cap_share`, and gives no
  verdict.
- The two leading arms run all 64 seeds against the defaults. The finalist is the arm with the highest `held` share
  whose `alive` guard is not worse and whose `eval.cap_share` is lowest among ties.
- The predictions are recorded before the run.
- The plan stops, and nothing is switched, when no arm reads `held` better, or when the food arms read `held` or
  `alive` worse: starvation is already more than half of prey deaths with the map full (T66), so less food may only
  deepen the fall. The record then carries intake per agent under 50 prey for each arm.
- Done when a finalist is named with its `keepRule` output at 64 seeds, or the record says why the plan stops.

| Chunk | Tasks      | Contents                                      |
| ----- | ---------- | --------------------------------------------- |
| C     | T8 to T11a | The grid, the two passes, the finalist (runs) |

### Phase 3 - The switch

**Targets:** eval.births_per_1k, eval.lineages_alive, eval.spec_effective, eval.deliberate_food_share, eval.chase_catch_share, eval.collision_death_share, eval.cap_share, eval.density_starve_slope, eval.food_standing_share, bench.step_ms@500

One PR, a breaking commit (`feat!`) to `season/next`, since `rulesHash` changes.

- The finalist's food value becomes the default (C1). `reproductionBonus` and `mateChanceScale` are deleted (C2).
  Scarcity is judged by reach (C3). The clonal cap is deleted only if the head-on-head arm of T15 shows it harms (C4).
- Each change is its own commit. The 64-seed paired check runs at the commit before C3 and at the head, so C3 is
  attributed by commit.
- Goldens are re-pinned in Node and Chromium in their own commit; `bench/baseline.json` is re-recorded on a quiet
  machine under the CPU lock in its own commit.
- The docs commit applies the principle edits the user approves from the review (P1 to P10), writes `keepRule` and its
  smallest detected loss into AGENTS.md and the `run-evolution-loop` skill (metric-trust.md T36), and adds K17 to K19.
- The phase ends with a clip of the default world for the user.

Done criteria, on seeds 65 to 128 of `evals/seeds.json` (64 matched floor-on seeds the screen did not use), head against `origin/main`:

| Criterion                                                                                                                  | Bar                                                                                                                       | Now           |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `held` guard                                                                                                               | `better`: more seeds gained than lost, exact p under 0.05                                                                 | 0.23 of seeds |
| `alive` guard                                                                                                              | not worse                                                                                                                 | 0.74 of seeds |
| `eval.cap_share`                                                                                                           | lower: `eval:compare` `better` if the metric is verified, else an exact sign test on the paired differences, p under 0.05 | 0.13          |
| `eval.density_starve_slope`                                                                                                | higher, by the same test as `eval.cap_share`                                                                              | -0.13         |
| Seeds where the floor guard fires                                                                                          | reported; not a bar (`eval.floor_episodes` is unverified)                                                                 | 61 of 128     |
| `eval.births_per_1k`, `eval.lineages_alive`, `eval.spec_effective`, `eval.deliberate_food_share`, `eval.chase_catch_share` | `eval:compare` not `worse`; a fall in `eval.births_per_1k` is expected and is read against the population it sustains     | -             |
| `bench.step_ms@500`                                                                                                        | within the budget of `bench-check`                                                                                        | -             |

| Chunk | Tasks      | Contents                                                    |
| ----- | ---------- | ----------------------------------------------------------- |
| D     | T12 to T17 | The defaults, the deletions, the scarcity rule, the re-pins |
| E     | T18, T18a  | The 64-seed paired check and its verdict                    |
| F     | T19 to T21 | Docs, the clip, the review                                  |

### Phase 4 - Read the held world

**Targets:** none - a reading of the new defaults and a queue proposal; no code changes.

- One 128-seed floor-on and floor-off reference of the new defaults replaces E150 as the power reference.
- The scene table of the review is re-read on it, and the hunter extinctions are split by `held` again. Hunters alive
  on fewer than 0.9 of the held seeds reopens the frozen hunter-skill plans; otherwise they stay frozen.
- `capBirthsEnabled` false is run once on 32 seeds as a control: a world that food holds does not need the cap.
- The Build queue is proposed from the reading.

| Chunk | Tasks      | Contents                              |
| ----- | ---------- | ------------------------------------- |
| G     | T22 to T25 | The references, the control, the read |

## Experiments

The labels are for this doc; each prediction takes the next numeric id when T8 records it in `evals/experiments.json`.

| Label    | Prediction, written before the run                                                                                                                                                                                                                 | Falsified when                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `E-CC-1` | A food arm at or under the eaten rate raises the `held` share from about 0.23 to 0.6 or more on 64 seeds and lowers `eval.cap_share`. A flat season with default food does not. `eval.chance_food_energy_per_1k` falls below the deliberate figure | No food arm reads `held` `better`, or a food arm reads `held` or `alive` `worse`              |
| `E-CC-2` | On the held seeds of the switched world, hunters are alive at the last tick on 0.9 or more, with `eval.chase_catch_share` unchanged                                                                                                                | Hunters die out on more than 0.1 of held seeds: skill or hunter economy is a cause of its own |
| `E-CC-3` | On the switched world the clonal cap does no harm: cap on against `splitClonalMax` 100000 reads no guard `WORSE`                                                                                                                                   | A guard reads `WORSE` with the cap on: the cap is deleted (T15)                               |

## Decisions

| Decision                                         | Choice                                                                        | If it fails                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The lever for density dependence                 | Food supply, the lever nature uses                                            | No food arm lifts `held`: the mating edge is primary. The next screen is a receptive-mate scent on the pheromone field (natural-selection.md T65 names it as never screened), in a new plan                                                                                                          |
| Flags                                            | None; arms are config values and commits                                      | -                                                                                                                                                                                                                                                                                                    |
| Density metrics are elasticities                 | Scale-free: slope times mean population over mean rate, per season, averaged  | The `trend` power bar is an absolute 0.10 (and `NEAR_ZERO_MEAN` uses the same), so a raw slope of about 1e-3 would always pass it                                                                                                                                                                    |
| The bar for "held"                               | 100 agents, the edge found in T66                                             | Phase 1 re-reads the edge on `E151`; the constant moves once, before Phase 2                                                                                                                                                                                                                         |
| Seeds                                            | 16 to rank; seeds 1 to 64 pick the finalist, seeds 65 to 128 judge the switch | -                                                                                                                                                                                                                                                                                                    |
| Unevolved brains starve on scarce food at tick 0 | The screen shows it: the `alive` and `held` guards read it                    | The finalist keeps a spring of plenty through `foodScarcity` only if the screen needs it; no rescue is added                                                                                                                                                                                         |
| Hunters on a smaller prey base                   | Guarded by `alive`; read in `E-CC-2`                                          | The hunter economy (`huntUpkeep`, carcass values) is screened in the plan that reopens                                                                                                                                                                                                               |
| Skipping T10 after the first pass                | The stop rule held at 16 seeds, so the 64-seed pass is not run                | Every food arm reads `held` 0/16 against 6/16 on the defaults (exact p 0.031 on each), and the traces show deeper, more frequent crashes at a smaller size; a second pass on 64 seeds could not turn that into a finalist. The mating Allee edge (world-balance Phase 6, review H1) is the next plan |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/scene-capacity.js` (new, the four detectors, fed at the trace checkpoints); `keepRule` in `js/evo/keep-rule.js` (the `held` guard); `js/sim/reproduction.js`, `js/sim/mate-scarcity.js`, `js/sim/split-gate.js`, `js/sim/config-defaults.js`, `js/sim/config-validate.js` (the switch); nothing in the worker or the app                                                                                                                                                                                 |
| Unit tests              | `test/evo/scene-capacity.test.js`: each detector against a hand-built series, a flat series reads slope 0, `null` with a reason when no window follows burn-in. `test/evo/keep-rule.test.js`: `held` flags from a trace, the exact test on planted flips. `test/sim/reproduction.test.js`: an eligible pair mates in every season. `test/sim/mate-scarcity.test.js`: a mate in view beyond `mateRange` does not reset the wait; one inside it does. `test/sim/split-gate.test.js`: the cap rows, deleted with it |
| Headless e2e            | The golden cases in `test/sim/golden.json` are re-pinned once, in T16, with the Chromium hashes (`npm run browser:hash`); `eval-smoke` passes on the new defaults                                                                                                                                                                                                                                                                                                                                                |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin of `bench/baseline.json`; fewer food items are expected to lower `bench.phase_ms.sense@500`; the baseline is re-recorded in T17                                                                                                                                                                                                                                                                                                                              |
| Evolution metrics       | The Done criteria table of Phase 3: `keepRule` with `held` at 64 matched seeds, `eval:compare` on the verified Targets at their registry seed counts                                                                                                                                                                                                                                                                                                                                                             |
| Determinism             | No new RNG stream. `findMale` in `js/sim/mate-search.js` stops drawing its chance float from the `lifecycle` stream, which shifts that stream, so every golden changes; replay from seed and config holds                                                                                                                                                                                                                                                                                                        |
| Config and persistence  | Deleted keys: `seasons[].reproductionBonus`, `mateChanceScale`, and `splitClonalMax` if T10 allows. Changed default: `foodRegrowPerArea`. `rulesHash` changes, so saved archives of the old rules are refused by `js/evo/archive-codec.js` as they are today for any rule change                                                                                                                                                                                                                                 |
| Logging and diagnostics | No new sim log event. A failure reads as `held` 0 in the keep-rule output; `npm run replay -- --seed <n> --ticks 200000 --policy map-elites-v6` reproduces a seed, and the trace `pop`, `prey` and `hunters` series show the fall                                                                                                                                                                                                                                                                                |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Docs                    | `docs/principles.md` (approved edits, K17 to K19), AGENTS.md and `.claude/skills/run-evolution-loop/SKILL.md` (the keep rule from the code), README.md (food and season rows), `docs/designs/metrics.md` (regenerated), world-balance.md (closed), sim-notes.md (one entry per run)                                                                                                                                                                                                                              |
| Verification            | `scripts/check.sh` green under the CPU lock; the Done criteria table; the clip                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Task breakdown

### Phase 1 - Instruments and the reference

| #   | Task                                                                                                                                                                                       | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T1  | (built: 2026-11-11) `held` seed guard and `HELD_POPULATION` in `js/evo/keep-rule.js`, printed by `formatKeepRule`, with tests                                                              | [mechanical] | -          |
| T2  | (built: 2026-11-11) `js/evo/scene-capacity.js`: the four detectors, registered in the metric registry, with arithmetic and source tests; `docs/designs/metrics.md` regenerated             | [judgement]  | -          |
| T3  | (built: 2026-11-11) A seed guard reads `better` as well as `worse` (the exact test in the good direction), printed by `formatKeepRule`, with tests                                         | [mechanical] | T1         |
| T4  | (built: 2026-11-11) `evals/decisions/` and the rule in `scripts/check-experiments.mjs` that a record from `E151` on names committed reports                                                | [mechanical] | -          |
| T5  | (built: 2026-11-11) Run `E151`: the defaults, 128 seeds, floor on, with the new metrics; commit the report under `evals/decisions/E151/`                                                   | [mechanical] | T2, T4     |
| T6  | (built: 2026-11-11) Liveness and power readings for the new metrics from `E151`; re-read the Baseline table and the food ratio; sim-notes entry                                            | [judgement]  | T5         |
| T7  | (built: 2026-11-11, review: no code fault; E150 wording, food-ratio source and gap, unverified reasons, nullWhen fixed) Conformance review of Phase 1, in parallel with `scripts/check.sh` | [judgement]  | T3, T6     |

### Phase 2 - Calibrate on config alone

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                            | Nature       | Depends on |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T8   | (built: 2026-11-11, gap settled: stored energy per plant meal is 62, `npm run food:ratio`) Set the food arms from the eaten rate of `E151`; `evals/screens/carrying-capacity.grid.json`; the three predictions recorded in `evals/experiments.json` under numeric ids. First settle the food-ratio gap (1.14 against 1.59 items per tick, Baseline), ideally with a committed probe or a metric | [judgement]  | T7         |
| T9   | (built: 2026-11-11) First pass: 16 seeds per arm; rank by `held`, `alive` and `eval.cap_share`                                                                                                                                                                                                                                                                                                  | [mechanical] | T8         |
| T10  | (not run: the stop rule held at 16 seeds; trace evidence in sim-notes) Second pass: the two leading arms on seeds 1 to 64 against the defaults; `keepRule` output; reports committed                                                                                                                                                                                                            | [mechanical] | T9         |
| T11  | (built: 2026-11-11, stop recorded: E-CC-1 falsified) Name the finalist or record why the plan stops, with intake per agent under 50 prey per arm; sim-notes entry                                                                                                                                                                                                                               | [judgement]  | T10        |
| T11a | Conformance review of Phase 2                                                                                                                                                                                                                                                                                                                                                                   | [judgement]  | T11        |

### Phase 3 - The switch

| #    | Task                                                                                                                                                                                                               | Nature       | Depends on    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| T12  | The finalist's `foodRegrowPerArea` as the default, with the config tests                                                                                                                                           | [mechanical] | T11a          |
| T13  | Delete `reproductionBonus` and `mateChanceScale` from the config, the validation rules and `mate`; tests                                                                                                           | [mechanical] | T12           |
| T14  | `noteMatesSeen` counts a possible mate only within `mateRange`; tests                                                                                                                                              | [judgement]  | T13           |
| T15  | Run the head with `splitClonalMax` 100000 against the head on 64 matched seeds; delete `splitClonalMax`, `world.clonalDepth` and `noteClonalBirth` only when the cap reads `WORSE`; otherwise record that it stays | [judgement]  | T14           |
| T16  | Re-pin the goldens in Node and Chromium                                                                                                                                                                            | [mechanical] | T15           |
| T17  | Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                                                                                                              | [mechanical] | T16           |
| T18  | Run the paired check on seeds 65 to 128 at the commit of T13 and at the head against `origin/main`; reports committed                                                                                              | [mechanical] | T16           |
| T18a | Read the Done criteria table from T18: `keepRule`, `eval:compare`, the sign tests; the verdict and a sim-notes entry                                                                                               | [judgement]  | T18           |
| T19  | Docs: the approved principle edits, K17 to K19, the keep rule in AGENTS.md and the `run-evolution-loop` skill (metric-trust.md T36), README.md, world-balance.md closed                                            | [judgement]  | T18a          |
| T20  | The clip of the default world for the user                                                                                                                                                                         | [mechanical] | T18a          |
| T21  | Conformance review of Phase 3, in parallel with `scripts/check.sh`; status line moved                                                                                                                              | [judgement]  | T17, T19, T20 |

### Phase 4 - Read the held world

| #   | Task                                                                                                                             | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T22 | 128-seed floor-on and floor-off references of the new defaults; `capBirthsEnabled` false on 32 seeds; reports committed          | [mechanical] | T21        |
| T23 | Power and liveness re-read into the registry from the new reference                                                              | [mechanical] | T22        |
| T24 | Re-read the scene table and `E-CC-2`; diagnose `eval.collision_death_share` on the new world; propose the Build queue; sim-notes | [judgement]  | T23        |
| T25 | Conformance review of Phase 4; status to `Implemented`                                                                           | [judgement]  | T24        |

## Verification

1. `scripts/check.sh` passes under `flock /tmp/claude-1000/cpu.lock` at the head of each chunk PR.
2. `npm run eval:compare -- <origin-main-report> <head-report> --keep-rule` on seeds 65 to 128 prints the three
   seed guards and meets the Done criteria table.
3. `npm run browser:hash` matches the re-pinned goldens.
4. The user watches the clip of the default world at x1 for one season and can point at a patch that was stripped and
   refilled.

## Review notes

Fresh-agent review, 2026-11-11, read-only against `origin/main` 572c3172. It recomputed the Baseline table from the E150
report and confirmed every figure but one, confirmed every named symbol, and found no reward or rescue in the plan.

| Finding                                                                                                                                 | Outcome                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The first food range (0.012 to 0.035) sat above the realised turnover of about 0.9 items per tick, so no arm would have made food short | Fixed: the Baseline states formula and realised supply; the arms are set from `E151` in T8 |
| Prediction ids `E-CC-n` fail the ledger schema                                                                                          | Fixed: labels here, numeric ids in the ledger                                              |
| The grid needed "the best food arm" before it was known                                                                                 | Fixed: a full factorial                                                                    |
| The clonal cap's deletion test inverted the keep rule and ran before C3                                                                 | Fixed: tested at the head, deleted only on harm                                            |
| The chance draw is on the `lifecycle` stream in `findMale`, and a flat arm is not bit-equal to the switch                               | Fixed                                                                                      |
| `summerSeeds` is already a seed count, not a mean test                                                                                  | Fixed: the row is dropped                                                                  |
| Two Done criteria were fixed thresholds on metrics that may stay unverified; the slope is confounded with season                        | Fixed: paired tests, a within-season slope                                                 |
| The finalist was picked and judged on the same seeds                                                                                    | Fixed: seeds 1 to 64 pick, 65 to 128 judge                                                 |
| T66 is also evidence against the cut: starvation is over half of prey deaths with the map full                                          | Fixed: a stop rule in Phase 2 and `E-CC-1`                                                 |
| Deleting `reproductionBonus` rests on a refusal the user has not yet approved                                                           | Closed: the user approved the plan with the deletion on 2026-11-11                         |
| The median lowest population is 17.5, not 13                                                                                            | Fixed                                                                                      |
| `keepRule` had no `better` verdict; T18 mixed a run with a verdict                                                                      | Fixed: T3, T18a                                                                            |
