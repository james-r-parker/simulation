# Low-density edge

**Status:** In progress - Phases 1 to 4 are built; Phase 5 (a receptive-mate scent) is falsified (E168: no scent arm holds more seeds, mating does not move), so the scent stays on the unmerged branch `feat/receptive-mate-scent`; Phase 4's clip and the Chromium golden hashes (`npm run browser:hash`) are open.
**Validated:** 38339cbd (2026-11-11)
**Priority:** 4 - the food brake shrinks the world and it still crashes (E152), so the edge under 100 prey is the binding failure, and the crash gates every hunter-skill plan below it ([review-2026-11-11.md](../review-2026-11-11.md) H1, H2)
**Depends on:** [metric-trust.md](metric-trust.md), [carrying-capacity.md](carrying-capacity.md) (its built Phase 1: the `held` guard, `evals/decisions/` and the E151 reference)

The scene this doc serves ([principles.md](../principles.md)): **Boom and bust** - a local population swells, strips a
patch, crashes and is recolonised, not extinguished. Through it, the scenes that need prey to stand and hunters to live
on them: **A real chase**, **Abort**, **Pack, or loner**, **Scavenge**. The rules it enforces: the refusal **Smoothing
away crashes** (the floor guard must not be what holds the world), the trait **Senses are local and lossy** (a mate
counts as found only when it can be reached), and selection rules 4 and 5. The calendar lever (L4) serves the refusal
proposed as P2 in review-2026-11-11.md ("A world rule that reads the calendar or the headcount"), not yet in the
principles.

## Principle - a thin population still breeds

In nature a population at low density keeps breeding: mates find each other within reach, and where no mate can be
reached, a female of a facultatively parthenogenetic species (sharks, Komodo dragons) breeds alone until mates return.
The shark rule exists here (`mateScarce` in `js/sim/mate-scarcity.js`), and three rules stop it working at the edge:

| Rule                                                                                  | What it does under 100 prey                                                                                                   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `noteMatesSeen` resets the drought on any possible mate the rays gather, at any range | A prey that sees a mate it cannot reach (`findMale` pairs only within `mateRange`, 200 edge to edge) neither mates nor splits |
| `splitClonalMax` (3) in `splitKeysAllow`                                              | A line that has split three times in a row stops splitting; a split already needs a drought, so the cap binds only in one     |
| `splitMinEnergy` (900) through `splitMinBySpec` in `readyBeforeGate`                  | In floor-off seed 224570 at 44k to 52k ticks, 18 to 25 of 53 to 56 adult prey held more than 900 (sim-notes T64)              |

`mate` in `js/sim/reproduction.js` also passes `min(1, reproductionBonus / mateChanceScale)` to `findMale`, so the
season's name sets the mating chance (1 in spring, 0.8 in summer, 0.47 in autumn, 0.2 in winter) in every seed at the
same ticks.

## Baseline

| Reading                                                                           | Value                                                                                               | Source                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Seeds whose total population never falls under 100 after `BURN_IN_TICKS` (`held`) | 29 of 128 (0.23)                                                                                    | `evals/decisions/E151/defaults-floor-on.json` |
| Seeds whose population falls under 40                                             | 71 of 128                                                                                           | E151                                          |
| Seeds with hunters alive at the last tick                                         | 95 of 128; all 33 extinctions are in a crashed world                                                | E151, review H2                               |
| `eval.mating_share`, `eval.births_per_1k`                                         | 0.41, 0.175                                                                                         | E151                                          |
| A food brake at 0.5 to 1.5 times the eaten rate                                   | `held` 0 of 16 on every arm against 6 of 16                                                         | `evals/decisions/E152/`, sim-notes T11        |
| A flat mating chance on default food (`flat-defaults`)                            | `held` 4 of 16 against 6 of 16, no keep-rule guard worse at 16 seeds                                | E152                                          |
| Per prey per 2000 ticks under 50 prey (floor off, 16 seeds)                       | mate births 0.03 to 0.05, split births 0.12 to 0.15, starved 0.24 to 0.25, intake 330 to 338 per 1k | sim-notes T66                                 |
| The same at 100 to 400 prey                                                       | mate births 0.15 to 0.18, split births 0.22 to 0.25, starved 0.20 to 0.21, intake 553 to 565 per 1k | sim-notes T66                                 |
| Hunters per prey under 50 prey, against 100 to 400                                | 0.51 against 0.11 to 0.16                                                                           | sim-notes T66                                 |
| A wider fixed `mateRange` (500 to 900); a range that grows when alone             | no lift (E127, E145); the roaming range harms and is deleted (E146)                                 | sim-notes T98 to T103                         |

Mate births, intake per forager and hunters per prey all turn against a thin population. Phase 2 measures which one
decides the edge before any lever is screened.

## What changes

| Id  | Change                                                                                                                                                                                                                                               | Lands                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| L1  | `noteMatesSeen` counts a possible mate only within the reach `isPartner` uses in `findMale`                                                                                                                                                          | Screened from an unmerged commit; lands in Phase 4 when no keep-rule guard reads worse |
| H1  | `temperatureCoolingExcess` (new, default 0): `stepTemperature` also cools a body by this much per degree above `temperatureOptimalMax`, so a hot body sheds heat faster                                                                              | Phase 4, when it is the finalist                                                       |
| H2  | `temperatureMatingMax` (new, default 85, read only by `blocksMating` in place of `temperatureHeatStress`) raised, so heat stops blocking mating while thrust, the brain's heat input and `eval.heat_stress_share` still read `temperatureHeatStress` | Phase 4, when it is the finalist                                                       |
| F1  | `foodRegrowPerArea` at the carrying-capacity arms (0.016, 0.024; a brake from the default 0.09) beside the leading heat arm                                                                                                                          | Phase 4, when the combined arm is the finalist                                         |
| L4  | `seasons[].reproductionBonus` and `mateChanceScale` deleted; `findMale` takes no chance                                                                                                                                                              | Phase 4, when no keep-rule guard reads worse                                           |
| L5  | A receptive-mate scent: a fourth pheromone grid and two scent inputs                                                                                                                                                                                 | Phase 5, which opens only when Phase 3 or 4 fails                                      |

Body temperature exists to make over-eating and over-sprinting cost an agent, as cold costs one that sits still (body-temperature.md); a heat lever keeps that pressure and only rebalances its numbers. No flag is added; `temperatureCoolingExcess` (default 0) and `temperatureMatingMax` (default 85, the value `blocksMating` reads today) are numbers whose defaults leave every golden as it is. Any new config key still changes `rulesHash` (`rulesHash` in `js/sim/config.js` hashes the whole config), so the keys stay on the Phase 3 branch until the switch. L1 and L4 are
realism changes and land on the keep rule (no guard worse); H1, H2 and F1 are levers and land only as the finalist
(`held` better). Phase 2 (E155) found that a mating female with a mate in reach is held by heat (body temperature over
`temperatureHeatStress`) in 58% of samples and by no reachable mate in 3.6%, and that split births are not short at the
edge; the clonal and split levers are not screened.

## Detectors

The scene `js/evo/scene-edge.js` (new) samples the alive prey and hunters itself at the existing 1000-tick checkpoint in
`observeScenes` (`js/evo/observer-scenes.js`), as `sampleKinds` does for the trace, and tallies prey births and deaths
by cause from the `AGENT_BORN` and `AGENT_DIED` events the observer already reads. A span runs from one checkpoint after
`BURN_IN_TICKS` to the next. An edge span starts with fewer than `EDGE_PREY` (100) prey; a reference span starts with 100
to 400. A span's prey count is the mean of its start and end counts. Spans are selected on their start count, so their
rates carry some regression to the mean. Prey births are `BORN_CAUSE.MATE` and `BORN_CAUSE.SPLIT` only; floor and
immigrant births are excluded. `held` counts the total population; the edge counts prey.

Each detector is registered in `js/evo/metric-registry/world-3.js` (new, merged in `js/evo/metric-registry/index.js`)
with an arithmetic test, a source test, a liveness read and a power read before a verdict rests on it.

| Detector                                                   | Meaning                                                                                                                                                                                                                                                                                                                                                                                              | Unit, better  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `eval.edge_birth_death_ratio`                              | Prey births over prey deaths, summed over edge spans; `null` when a seed has no edge span or no prey death in one                                                                                                                                                                                                                                                                                    | ratio, higher |
| `eval.edge_mate_births_per_prey`                           | Prey mating births per prey per 1000 ticks over edge spans                                                                                                                                                                                                                                                                                                                                           | rate, higher  |
| `eval.edge_split_births_per_prey`                          | The same for prey split births                                                                                                                                                                                                                                                                                                                                                                       | rate, higher  |
| `eval.edge_starve_per_prey`                                | Prey starvation deaths per prey per 1000 ticks over edge spans                                                                                                                                                                                                                                                                                                                                       | rate, lower   |
| `eval.edge_eaten_per_prey`                                 | Prey deaths by a hunter per prey per 1000 ticks over edge spans                                                                                                                                                                                                                                                                                                                                      | rate, lower   |
| `eval.edge_hunters_per_prey`                               | Mean hunters over mean prey across edge spans                                                                                                                                                                                                                                                                                                                                                        | ratio, lower  |
| `eval.edge_intake_ratio`                                   | Food energy per prey per tick in edge spans over the same in reference spans; `null` when either kind is missing                                                                                                                                                                                                                                                                                     | ratio, higher |
| `eval.edge_mate_unreached_share` (deleted in T16, Phase 4) | At edge checkpoints, the share of ready prey females whose `mateSeenAt` is the checkpoint tick and that have no possible mate within `size[a] + size[b] + mateRange`, by a pass over at most 100 prey; reads 0 by construction once L1 lands                                                                                                                                                         | share, watch  |
| `eval.edge_split_blocked_share.*`                          | At edge checkpoints, over mature, rested, not-pregnant prey, the share held by each gate first, in this order: `seen` (`mateScarce` false), `clonal` (`splitClonalMax`), `energy` (`splitMinBySpec`), `merit` (`splitDeliberateMin` and `splitDeliberateShareMin`), `proof` (`splitBraked`), `other` (`birthBudgetSpent`, `territoryAllows`, `splitMaxPerLife`); the shares sum to the blocked share | share, watch  |

The per-span reference tallies (births, deaths and intake per prey in reference spans) are kept beside the edge tallies
for the diagnosis, and reach the report as watch metrics, since a report carries each metric per seed: `eval.edge_ref_mate_births_per_prey`,
`eval.edge_ref_split_births_per_prey`, `eval.edge_ref_starve_per_prey` and `eval.edge_ref_eaten_per_prey`, with
`eval.edge_deaths_per_prey` (the edge's all-cause death rate, which the deficit needs). Nothing is allocated per tick; the two share detectors call the read-only predicates once per prey at
an edge checkpoint.

## Phases

### Phase 1 - The keep rule in the docs (built)

**Targets:** none - docs only: review edits P5 to P7 and metric-trust.md T36 and T37

- `docs/principles.md` takes P5 (a scene is proved by a `verified` detector at its registry seed count, or by the
  clip), P6 (the keep rule: `npm run eval:compare -- --keep-rule` on 64 matched floor-on seeds, the smallest detected
  loss, the cost clause, the switch kept until its bundle is read once with it off) and P7 (the adoption bar), as written
  in [review-2026-11-11.md](../review-2026-11-11.md).
- AGENTS.md (the "Keep what does no harm" Boundary and the eval command rows) and the `run-evolution-loop` skill name
  `keepRule`, the 64-seed bar and the smallest detected loss.
- metric-trust.md closes as `Implemented`.
- Done when the three files state the same bar and `scripts/check.sh --docs` passes.

| Chunk | Tasks    | Contents                                     |
| ----- | -------- | -------------------------------------------- |
| A     | T1 to T4 | The rule in three files, metric-trust closed |

### Phase 2 - Measure the edge (built)

**Targets:** none - detectors and a reference run; no sim behaviour changes, and `worldHash` and the goldens stay as they are

- The detectors are built, registered and tested; T5 adds `eval.edge_birth_death_ratio` to the Targets lines of
  Phases 3 to 5 once it is registered.
- `E-LD-1` is recorded before the run.
- One 128-seed floor-on reference of the defaults carries the detectors, its report committed under `evals/decisions/`;
  liveness and power fill their registry rows through `metric-power-write --merge`.
- The diagnosis, per seed with an edge span: for each of mate births, split births, starvation and predation, the edge
  rate is replaced by the same seed's reference-span rate, and the share of the edge deficit (prey deaths minus prey
  births in edge spans) that the swap closes is reported; the ranking is by median share over seeds. It also names the
  gate with the largest blocked share.
- Done when each detector is `verified` or the sim-notes entry says why not, and the entry ranks the rates.

| Chunk | Tasks      | Contents                                              |
| ----- | ---------- | ----------------------------------------------------- |
| B     | T5 to T7   | The detectors and the prediction (code)               |
| C     | T8 to T10a | The reference run, the readings, the diagnosis (runs) |

### Phase 3 - Screen the heat levers, then the food brake

**Targets:** eval.births_per_1k, eval.edge_birth_death_ratio, eval.heat_stress_share

Every arm runs floor on, policy live, 200000 ticks; the first pass on seeds 1 to 16 of `evals/seeds.json`. The first
grid holds the heat and realism arms:

| Arm        | Config or code                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `defaults` | as is                                                                                           |
| `cool-2`   | `temperatureCoolingExcess` 0.002                                                                |
| `cool-5`   | `temperatureCoolingExcess` 0.005                                                                |
| `cool-10`  | `temperatureCoolingExcess` 0.01                                                                 |
| `mate-90`  | `temperatureMatingMax` 90                                                                       |
| `mate-95`  | `temperatureMatingMax` 95                                                                       |
| `flat`     | all four `seasons` entries written in full with `reproductionBonus` 1.5: chance 1 all year (L4) |
| `reach`    | L1 on a commit of an unmerged branch, `npm run eval` on the same seeds and config as `defaults` |

- Each heat arm first passes the purpose guard: the constant-thrust controllers of
  `test/evo/scripted-temperature.slow.test.js` on the arm's config (`thrust0` and `thrust100` die out, `thrust20`
  grows), so a sitter still dies of cold and a rusher of heat; an arm that fails it is dropped before the ranking.
- The first pass ranks only, by `held`, then `alive`, then `eval.edge_birth_death_ratio`, with `eval.heat_stress_share`
  reported beside them; `reach` is ranked from its own report. The leading heat arm is the top-ranked `cool-*` or
  `mate-*` arm.
- The second grid, recorded with its prediction `E-LD-2b` after the first pass and before its run, crosses the leading
  heat arm with the food brake: the heat arm with `foodRegrowPerArea` 0.016, and with 0.024, on seeds 1 to 16, ranked as
  the first pass; the leading combined arm is the better of the two. First pass read (T13): `eat-1` leads, but the
  cooling arms lift births most (59 to 70 percent) and hold fewer seeds, which is the case the food brake is for, so the
  grid crosses `cool-5` as well as `eat-1` (`evals/screens/low-density-edge-heat-food.grid.json`, four combined arms);
  the leading combined arm is the best of the four, and a second heat arm in the second pass is decided at T14.
- The 64-seed pass (T14) waits for the switch of `eat-choice.md` and runs on that world, per its Priority line, with arms `eat-1`, `eat-1-food-24`, `flat` and `reach`. It also reads the median lowest population and `eval.floor_episodes` beside `held`, since `held` penalises a world that settles smaller (sim-notes, 2026-11-11).
- The second pass runs seeds 1 to 64 for five arms: `defaults`, the leading heat arm, the leading combined arm, `flat`
  and `reach`. Each is compared with `defaults` by `npm run eval:compare -- --keep-rule --allow-config-diff <the arm's
keys>`, and the combined arm also with the heat arm alone; the reports are committed under `evals/decisions/`.
- The finalist is one lever arm (a heat arm, or a heat arm with a food value): the one whose `held` guard reads
  `better` with the `alive` guard not worse, a tie going to the higher `eval.edge_birth_death_ratio`. Levers outside
  the finalist do not land.
- `flat` and `reach` land in Phase 4 when their keep-rule output shows no guard worse. When `flat` or `reach` is the
  only arm whose `held` reads `better`, there is no lever finalist and Phase 4 lands it alone.
- When no arm reads `held` `better`, Phase 4 lands only `flat` and `reach` as above, and Phase 5 opens.
- Done when the finalist is named with its keep-rule output at 64 seeds, or the record says why there is none.

| Chunk | Tasks       | Contents                                                                                                                                                          |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D     | T11, T11b   | The heat keys and the `reach` commit, on the unmerged Phase 3 branch: a new config key changes `rulesHash`, so both land with the Phase 4 switch on `season/next` |
| E     | T12 to T15a | The two grids, the passes, the finalist (runs)                                                                                                                    |

**Record (E165, 2026-11-13).** On the eat-choice world, seeds 1 to 64: no arm reads `held` `better` (`E-LD-2`
falsified), and the food brake reads `held` worse than `eat-1` alone (`E-LD-2b` falsified), so there is no lever
finalist. `flat` and `reach` read no guard worse, with each guard seeing only a 17 to 28 seed loss; T15b re-reads them on
seeds 65 to 128; on the 128 matched seeds (E166) neither reads a guard worse, the `alive` guard seeing only a 41 and 45 seed loss, and both land in Phase 4. `eat-1` and `reach` lift the median lowest population after burn-in from 9 to 43 and 44.5 without
moving `held`. The full table is in `evals/decisions/E165/results.md`.

### Phase 4 - The switch

**Targets:** eval.births_per_1k, eval.mating_share, eval.edge_birth_death_ratio, bench.step_ms@500

One PR, a breaking commit (`feat!`) to `season/next`, since `rulesHash` changes.

- L1 lands from its Phase 3 commit and deletes `eval.edge_mate_unreached_share`, which then reads 0 by construction.
  The finalist's values become the defaults. L4 deletes `reproductionBonus` and `mateChanceScale`, and `findMale` takes
  no chance. When the finalist does not use `temperatureCoolingExcess` or `temperatureMatingMax`, or there is no
  finalist, the unused key and its code are deleted (`blocksMating` reads `temperatureHeatStress` again).
- Each change is its own commit; the goldens are re-pinned in Node and Chromium in their own commit; `bench/baseline.json`
  is re-recorded on a quiet machine under the CPU lock in its own commit.
- The paired check on seeds 65 to 128 reads the combined switch: L1, the finalist and L4 together.
- The phase ends with a clip of the default world for the user.

Done criteria, on seeds 65 to 128 of `evals/seeds.json` (64 matched floor-on seeds the screen did not use), head
against `origin/main`:

| Criterion                                                              | Bar                                                                                                          | 128-seed reference |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| `held` guard                                                           | `better`: more seeds gained than lost, exact p under 0.05                                                    | 0.23 of seeds      |
| `alive` guard                                                          | not worse                                                                                                    | 0.74 of seeds      |
| `eval.edge_birth_death_ratio`                                          | higher: `eval:compare` `better` if verified, else an exact sign test on the paired differences, p under 0.05 | read in Phase 2    |
| `eval.lineages_alive`, `eval.spec_effective`, `eval.chase_catch_share` | `eval:compare` not `worse` at their registry seed counts                                                     | -                  |
| `eval.births_per_1k`                                                   | `eval:compare` `better`, or not `worse` with `held` `better`                                                 | 0.175              |
| `eval.mating_share`                                                    | reported, expected to rise when heat stops blocking mating                                                   | 0.41               |
| `bench.step_ms@500`                                                    | within the budget of `bench-check`                                                                           | -                  |

When `held` is not `better` here, Phase 5 opens on top of the switch.

| Chunk | Tasks      | Contents                                                              |
| ----- | ---------- | --------------------------------------------------------------------- |
| F     | T16 to T20 | The defaults, the deletions, the re-pins (code)                       |
| G     | T21, T22   | The 64-seed paired check and its verdict (runs, kept apart from code) |
| H     | T23, T24   | The clip and the docs, the review                                     |

**Record (E167, 2026-11-13).** The switch (`reach`, `flat`, the unused heat keys deleted) on seeds 65 to 128 against
`main`: no keep-rule guard reads worse, `held` is not `better` (11 seeds harmed, 9 recovered), and `E-LD-3` holds
(hunters alive on 13 of 13 held seeds, `eval.chase_catch_share` +2.5%). `eval.births_per_1k`, `eval.mating_share` and
`eval.edge_birth_death_ratio` do not rise, so Phase 5 opens on top of the switch. The table is in
`evals/decisions/E167/results.md`.

### Phase 5 - A receptive-mate scent

**Targets:** eval.births_per_1k, eval.mating_share, eval.edge_birth_death_ratio

Opens only when Phase 3 names no finalist, or when Phase 4's `held` guard is not `better`.

- A fourth grid, `world.mate`, allocated beside `danger`, `attack` and `hunt` in `js/sim/world.js` and decayed and
  diffused by the same kernel (`update_pheromones` in `wasm/src/field.rs`, called through `updatePheromonesKernel` in
  `js/sim/wasm-field.js`); a ready female (`readyToMate`) deposits `mateScentDeposit` on it each tick through
  `depositPheromone`.
- Two inputs (left and right antenna samples of `world.mate`) join `BODY_INPUT` in `js/sim/brain-layout.js` and are
  written by `writeScentInputs`. `BRAIN_LAYOUT_NAME` moves from `pooled-v5` to `pooled-v6`, so archives and champions
  of `pooled-v5` are refused by `js/evo/genome.js` and `js/evo/archive-codec.js`.
- One screen of `mateScentDeposit` values with the 64-seed keep rule, and the switch, in the shape of Phases 3 and 4.

| Chunk | Tasks      | Contents                                                 |
| ----- | ---------- | -------------------------------------------------------- |
| I     | T25 to T29 | The grid, the inputs, the screen, the switch, the review |

**Record (E168, 2026-11-13).** On the switched world with the scent inputs (`pooled-v6`), `mateScentDeposit` 0.5,
1 and 2 on seeds 1 to 16, then 2 and 4 against the scent off on seeds 1 to 64. No arm reads `held` `better` (`scent-2`
11 seeds harmed, 4 recovered; `scent-4` 9 and 8), `eval.mating_share` is a little lower in both, and
`eval.births_per_1k` reads `no-difference`. The keep rule reads no harm, but the scent is a new brain input and no
scene metric moved, so it does not land: `E-LD-4` is falsified, T28 is not built and season 8 stays. The table is in
`evals/decisions/E168/results.md`.

## Experiments

The labels are for this doc; each prediction takes the next numeric id in `evals/experiments.json` when it is recorded,
before its run.

| Label     | Prediction, written before the run                                                                                                                                   | Falsified when                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `E-LD-1`  | `eval.edge_birth_death_ratio` is under 0.6 on at least half the seeds with an edge span, and the mate-birth swap closes the largest median share of the edge deficit | The ratio is 0.6 or more on more than half those seeds, or the starvation or predation swap closes a larger share |
| `E-LD-2`  | A heat arm, alone or with the food brake, reads `held` `better` at 64 seeds with the `alive` guard not worse, and raises `eval.edge_birth_death_ratio`               | No arm reads `held` `better`, or the leading arm's `alive` guard reads worse, or its edge ratio does not rise     |
| `E-LD-2b` | The leading heat arm with the food brake reads `held` `better` than the heat arm alone at 64 seeds, with the `alive` guard not worse                                 | The combined arm's `held` is not `better` than the heat arm alone; the food value does not land                   |
| `E-LD-3`  | On the switched world hunters are alive at the last tick on 0.9 or more of held seeds, with `eval.chase_catch_share` not worse                                       | Hunters die out on more than 0.1 of held seeds                                                                    |
| `E-LD-4`  | A `mateScentDeposit` arm reads `held` `better` than the scent off at 64 seeds, with the `alive` guard not worse and `eval.mating_share` higher                       | No scent arm reads `held` `better`, or the leading arm's `alive` guard reads `worse`                              |

## Decisions

| Decision                                | Choice                                                                                                      | If it fails                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Which levers first                      | Brain-free rules (L1 to L4) before a new sense                                                              | Phase 5 opens: the scent moves the brain layout and costs the saved champions                      |
| Realism changes and levers              | L1 and L4 land on the keep rule (no guard worse); H1, H2 and F1 land only as the finalist                   | -                                                                                                  |
| Heat before the split rules             | E155: heat holds 58% of in-reach mating samples; split births are not short at the edge                     | -                                                                                                  |
| The food brake joins the heat arm       | Births balance deaths at every density (E155); a heat arm lifts births, the food brake holds the top (E152) | When the combined arm reads `held` no better than the heat arm alone, the food value does not land |
| L1 is screened from an unmerged commit  | It changes splits and every golden, so it lands with the Phase 4 re-pin                                     | -                                                                                                  |
| The 16-seed first pass gives no verdict | It ranks; a verdict needs 64 matched seeds (P6)                                                             | -                                                                                                  |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/scene-edge.js` (new: the detectors and their `metrics` function, fed at the checkpoint in `observeScenes`), `js/evo/metric-registry/world-3.js` (new) merged in `js/evo/metric-registry/index.js`; `noteMatesSeen` in `js/sim/mate-scarcity.js` (L1); `stepTemperature` and `blocksMating` in `js/sim/temperature.js`, with their keys in `js/sim/config-defaults.js` and `js/sim/config-validate.js` (H1, H2); `mate` in `js/sim/reproduction.js` and `findMale` in `js/sim/mate-search.js` (L4); `js/sim/config-defaults.js`, `js/sim/config-rules.js` and `js/sim/config-validate.js` (the switch); Phase 5: `js/sim/world.js`, `js/sim/pheromones.js`, `js/sim/wasm-field.js`, `wasm/src/field.rs`, `js/sim/scent-inputs.js` and `js/sim/brain-layout.js`; nothing in the worker or the app                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Unit tests              | `test/evo/scene-edge.test.js`: each detector against a hand-built span series; floor births are not counted; a seed with no edge span reads `null` with its reason; the gate shares sum to the blocked share; the span prey count is the mean of start and end. `test/evo/metric-source-edge.test.js`: a scripted world with a known edge (prey under 100, births and deaths placed by construction). `test/sim/mate-scarcity.test.js`: a mate in view beyond `mateRange` does not reset the drought, one inside it does. `test/sim/reproduction.mating.test.js`: an eligible pair mates in every season once L4 lands. `test/sim/temperature.test.js`: at `temperatureCoolingExcess` 0 the cooling term is skipped (`if (temperatureCoolingExcess > 0)`), so the step is unchanged by construction, and above 0 a body over `temperatureOptimalMax` cools by the excess times the degrees above it; `blocksMating` reads `temperatureMatingMax` on the heat side, and at its default 85 every case matches today. Phase 5: the pheromone and scent-input tests pin that the mate grid decays and diffuses like the others and that the two inputs sample it; the genome tests pin that a `pooled-v5` genome is refused |
| Headless e2e            | Phases 1 to 3 change no `worldHash` on `main` (L1 lives on an unmerged commit until Phase 4); the golden cases in `test/sim/golden.json` are re-pinned once in Phase 4 (T19) with the Chromium hashes (`npm run browser:hash`), and again in Phase 5 when it opens; `eval-smoke` passes on each new default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin of `bench/baseline.json`; L1 adds one distance test per gathered agent row in `noteMatesSeen`; the share detectors cost one pass over at most 100 prey per edge checkpoint; the baseline is re-recorded in T20. Phase 5's grid costs one more field update per tick, measured with `npm run bench:micro -- --area wasm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Evolution metrics       | Phase 3's finalist and landing rules and Phase 4's Done criteria: `keepRule` with `held` and `alive` at 64 matched seeds; `eval:compare` on the verified Targets at their registry seed counts; the edge detectors by `eval:compare` when verified, else the sign test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Determinism             | No new RNG stream. L4 stops `findMale` drawing its chance float from the `lifecycle` stream, which shifts that stream, so every golden changes; replay from seed and config holds. Phase 5 draws nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Config and persistence  | New keys in Phase 3: `temperatureCoolingExcess` (number, at least 0, default 0) and `temperatureMatingMax` (number, default 85, above `temperatureColdStress`), with their rules in `js/sim/config-validate.js`. Deleted keys in Phase 4: `seasons[].reproductionBonus` and `mateChanceScale` (L4), and `temperatureCoolingExcess` or `temperatureMatingMax` when the finalist does not use it. Changed defaults: the finalist's `temperatureCoolingExcess`, `temperatureMatingMax`, `temperatureGainEat` or `foodRegrowPerArea`. `rulesHash` changes, so archives of the old rules are refused by `js/evo/archive-codec.js` as for any rule change. Phase 5 adds `mateScentDeposit` (number, the screen's value) and moves `BRAIN_LAYOUT_NAME` to `pooled-v6`, refused against `pooled-v5` by `js/evo/genome.js`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Logging and diagnostics | No new sim log event. A failure reads as `held` 0 in the keep-rule output and as an edge detector unchanged; `npm run replay -- --seed <n> --ticks 200000 --level debug` reproduces a seed, and its birth, death and blocked-birth records with the trace `prey` series show the fall                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Docs                    | Phase 1: `docs/principles.md` (P5 to P7), AGENTS.md, `.claude/skills/run-evolution-loop/SKILL.md`, metric-trust.md (`Implemented`), review-2026-11-11.md (status). Phase 4: README.md (the season and mating rows), world-balance.md Phase 6 closed. `docs/designs/metrics.md` regenerated with each detector change; sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 4, or after Phase 5 when it opens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 4's Done criteria table; the clip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Task breakdown

### Phase 1 - The keep rule in the docs (built)

| #   | Task                                                                                                                                                                                 | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T1  | (built: 2026-11-11) `docs/principles.md`: apply P5, P6 and P7 from review-2026-11-11.md as written; the review's status line records them applied                                    | [mechanical] | -          |
| T2  | (built: 2026-11-11) AGENTS.md and `.claude/skills/run-evolution-loop/SKILL.md`: name `keepRule`, `--keep-rule`, the 64-seed bar and the smallest detected loss (metric-trust.md T36) | [mechanical] | T1         |
| T3  | (built: 2026-11-11) metric-trust.md: T36 and T37 marked built by this doc, the status `Implemented`                                                                                  | [mechanical] | T2         |
| T4  | (built: 2026-11-11, review: the skill gained the smallest-loss, cost and switch clauses) Conformance review of Phase 1, in parallel with `scripts/check.sh --docs`                   | [judgement]  | T3         |

### Phase 2 - Measure the edge (built)

| #    | Task                                                                                                                                                                                                                                                                                       | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T5   | (built: 2026-11-11) `js/evo/scene-edge.js`: the span tallies and the seven rate and ratio detectors, registered in `world-3.js`, with arithmetic and source tests; `docs/designs/metrics.md` regenerated; `eval.edge_birth_death_ratio` added to the Targets of Phases 3 to 5              | [judgement]  | T4         |
| T6   | (built: 2026-11-11) The two share detectors, sampled at edge checkpoints, with tests                                                                                                                                                                                                       | [judgement]  | T5         |
| T7   | (built: 2026-11-11, as E155) `E-LD-1` recorded in `evals/experiments.json` before the run                                                                                                                                                                                                  | [mechanical] | T5         |
| T8   | (built: 2026-11-11, E155) Run the 128-seed floor-on defaults reference with the detectors; commit the report under `evals/decisions/`                                                                                                                                                      | [mechanical] | T6, T7     |
| T9   | (built: 2026-11-11, E155: the four reference rates are read; the 15 edge-span metrics are unverified, as eval-power voids a split with any null seed) Liveness and power for the new detectors from T8, merged into the registry; `docs/designs/metrics.md` regenerated                    | [mechanical] | T8         |
| T10  | (built: 2026-11-11, E155 falsified on its ratio clause; the premise is flagged in sim-notes, the grid left as planned) The diagnosis by rate swap, the gate with the largest blocked share, the `E-LD-1` verdict, a sim-notes entry, and Phase 3's grid adjusted where the ranking says so | [judgement]  | T9         |
| T10a | (built: 2026-11-11, by the delegating review: T8 to T10 conform; the premise flag led to the heat-first Phase 3) Conformance review of Phase 2, in parallel with `scripts/check.sh`                                                                                                        | [judgement]  | T10        |

### Phase 3 - Screen the heat levers, then the food brake

| #    | Task                                                                                                                                                                                                                                                                                                                                                                                         | Nature       | Depends on |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T11  | (built: 2026-11-11) `temperatureCoolingExcess` (a last, separate term in `stepTemperature`, skipped at 0) and `temperatureMatingMax` (read by `blocksMating`), in `config-defaults.js` and `config-validate.js`, with `test/sim/temperature.test.js`; no golden moves                                                                                                                        | [mechanical] | T10a       |
| T11b | L1 on a commit of an unmerged branch: `noteMatesSeen` counts a possible mate only within `isPartner` reach, with the `mate-scarcity` tests                                                                                                                                                                                                                                                   | [judgement]  | T10a       |
| T12  | (built: 2026-11-11) The purpose guard (the constant-thrust check on each heat arm's config, a script with a test), `evals/screens/low-density-edge-heat.grid.json` and `E-LD-2` recorded before the run                                                                                                                                                                                      | [judgement]  | T11        |
| T13  | (built: 2026-11-11) First pass: the heat grid on seeds 1 to 16, and `npm run eval` at T11b on the same seeds; ranked by `held`, `alive`, the edge ratio and heat stress                                                                                                                                                                                                                      | [mechanical] | T11b, T12  |
| T13a | (built: 2026-11-11, E157 falsified on held) The second grid (the leading heat arm with `foodRegrowPerArea` 0.016 and 0.024) and `E-LD-2b` recorded before its run; its first pass on seeds 1 to 16                                                                                                                                                                                           | [judgement]  | T13        |
| T14  | (built: 2026-11-13, E165) Second pass on seeds 1 to 64: `defaults`, the leading heat arm, the leading combined arm, `flat` and `reach`, each against `defaults` with `--keep-rule --allow-config-diff`, and the combined arm against the heat arm alone, reading `eval.diversity`, `eval.lineages_alive` and `eval.toxic_avoidance` beside the guards (eat-choice.md T25); reports committed | [mechanical] | T13a       |
| T15  | (built: 2026-11-13, E165: no finalist; `flat` and `reach` re-read on seeds 65 to 128, T15b) Name the finalist and the realism changes that land, or record that there is none and why; the `E-LD-2` and `E-LD-2b` verdicts; a sim-notes entry                                                                                                                                                | [judgement]  | T14        |
| T15b | (built: 2026-11-13, E166: no guard worse on 128 seeds; both land) `flat` and `reach` on seeds 65 to 128 against `defaults`, each with `--keep-rule`; they land in Phase 4 when no guard reads worse on the 128 matched seeds                                                                                                                                                                 | [mechanical] | T15        |
| T15a | (built: 2026-11-13; three record fixes) Conformance review of Phase 3                                                                                                                                                                                                                                                                                                                        | [judgement]  | T15        |

### Phase 4 - The switch

| #   | Task                                                                                                                                                                                                    | Nature       | Depends on    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| T16 | (built: 2026-11-13) L1 from T11b when it landed by T15, deleting `eval.edge_mate_unreached_share`; the finalist's values as the defaults (none when there is no finalist); the config tests             | [mechanical] | T15a          |
| T17 | (built: 2026-11-13) L4 when it landed by T15: delete `seasons[].reproductionBonus` and `mateChanceScale` from the config, the validation rules and `mate`; tests                                        | [mechanical] | T15a          |
| T18 | (built: 2026-11-13) Delete `temperatureCoolingExcess` or `temperatureMatingMax` and its code when the finalist does not use it, or there is no finalist; tests                                          | [mechanical] | T16           |
| T19 | (built: 2026-11-13, Node only; Chromium not run) Re-pin the goldens in Node and Chromium                                                                                                                | [mechanical] | T16, T17, T18 |
| T20 | (built: 2026-11-13) Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                                                                               | [mechanical] | T19           |
| T21 | (built: 2026-11-13, E167) Run the paired check on seeds 65 to 128 at the head against `origin/main`; reports committed                                                                                  | [mechanical] | T20           |
| T22 | (built: 2026-11-13, E167: no harm, `held` not better, E-LD-3 holds; Phase 5 opens) Read the Done criteria from T21: `keepRule`, `eval:compare`, the sign tests; the `E-LD-3` verdict; a sim-notes entry | [judgement]  | T21           |
| T23 | The clip of the default world for the user; README.md and world-balance.md Phase 6 closed                                                                                                               | [judgement]  | T22           |
| T24 | (built: 2026-11-13; the README and contracts doc fixed, the Chromium hashes open) Conformance review of Phase 4, in parallel with `scripts/check.sh`; status line moved                                 | [judgement]  | T23           |

### Phase 5 - A receptive-mate scent

| #   | Task                                                                                                                                                                                                                            | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T25 | (built on `feat/receptive-mate-scent`, unmerged: E168) The `world.mate` grid and the deposit by ready females; decay and diffusion in `wasm/src/field.rs`, rebuilt with `scripts/build-wasm.sh` (Rust work goes to Opus); tests | [judgement]  | T15a       |
| T26 | (built on `feat/receptive-mate-scent`, unmerged: E168) Two inputs in `BODY_INPUT` written by `writeScentInputs`, `BRAIN_LAYOUT_NAME` `pooled-v6`, `pooled-v5` refused by `genome.js`; tests                                     | [judgement]  | T25        |
| T27 | (built: 2026-11-13, E168: E-LD-4 falsified, the scent does not land) The `mateScentDeposit` grid, its prediction, and the 16-seed and 64-seed passes with `--keep-rule`; reports committed                                      | [judgement]  | T26        |
| T28 | (not built: E168 falsified E-LD-4, so there is nothing to switch) The switch: the screen's value as the default, goldens and bench re-pinned, the 64-seed paired check on seeds 65 to 128                                       | [mechanical] | T27        |
| T29 | (built: 2026-11-13; the record only, no code lands) Conformance review of Phase 5, in parallel with `scripts/check.sh`; status line moved                                                                                       | [judgement]  | T28        |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, `docs/principles.md`, AGENTS.md and the `run-evolution-loop` skill name the same bar: `keepRule` on
   64 matched floor-on seeds.
3. After Phase 2, `node scripts/metrics-doc.mjs --check` passes, each `eval.edge_*` detector is `verified` or the
   sim-notes entry says why not, and the entry ranks the rates by the swap.
4. After Phase 3, the grid, both passes' reports and the keep-rule output are under `evals/decisions/`, and the record
   names the finalist and the realism changes that land, or why there are none.
5. After Phase 4, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads
   `held` `better` and `alive` not worse, and the clip shows a world that falls and is recolonised.

| H3 | `temperatureGainEat` lowered from 1.5, so an ordinary meal warms less and only repeated eating overheats | Phase 4, when it is the finalist |
| `eat-1` | `temperatureGainEat` 1.0 |
| Heat stays a pressure | A heat arm passes the constant-thrust purpose guard before it is ranked; heat is rebalanced, not removed | An arm that fails the guard is dropped |
| The food grid crosses two heat arms | `eat-1` (the leading heat arm) and `cool-5` (the largest birth lift with a bounded `alive` loss) each with `foodRegrowPerArea` 0.016 and 0.024 (the hypothesis is about cooling above all) | The first pass reads cooling arms hold fewer seeds only for want of a brake; if no combined arm holds more seeds than its heat arm alone, the food value does not land |
