# Natural selection

**Status:** Proposed - Phase 1 first: the scene and selection detectors, then the flagged changes (floor guard, poor and gated entrants, proven lines, chance-free breeding, mate rank, actor-only social credit, the season input); one switch-on in Phase 2.
**Validated:** d8a8561 (2026-10-29)
**Priority:** 1 - the default world fails the principles (spinning, a scout monoculture, lucky lives that breed, dead genomes that return), and one flagged build with one switch-on avoids a re-pin per tuning round (user, 2026-10-29)
**Depends on:** [fitness-and-selection.md](fitness-and-selection.md) (Phases 1 to 3 built, T48h and T48i built)

Right now a lucky life can still breed and a dead failure can still come back. [principles.md](../principles.md)
(version 2) states the rules: death is final, a lucky life does not found a line, strength is who remains after the bad
season, incompetence kills before fertility ranks, and a payoff must return to the actor's offspring. This doc builds
the changes that enforce them, and the detectors that show whether the scenes appear.

Each change is a config key or policy option that defaults to off or to today's value, so the golden hashes and the
baselines do not move while Phase 1 lands. Phase 2 turns the chosen set on in one PR and re-pins once. Phase 3
attributes the effect of each change with leave-one-out arms.

Out of scope: new sensors, new brain layouts and the brain experiments ([brain-capacity-and-memory.md](brain-capacity-and-memory.md)
follows this doc), and any reward for a scene (principles.md, "Measure scenes, reward them almost never").

## Baseline

Checked in the code on 2026-10-29.

| Fact                                                                                                                                                                                                                                                                                                                                                              | Where                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `fillFloor` spawns up to `minAgents` (40) entrants every tick the world is under it, at a uniformly random point of either basin, with `initialEnergy` 800                                                                                                                                                                                                        | `../../js/sim/population.js`, `../../js/sim/spawn.js`                 |
| An entrant's genome, once the archive has 10 cells: 50% mutated archive child, 30% unmutated archive clone, 20% random; its specialisation is a random elite's (`specMutationRate` 0.002 is above 0)                                                                                                                                                              | `createSeeder` in `../../js/evo/policies/map-elites-seed.js`          |
| `immigrationInterval` 600 adds one entrant from the same seeder whenever the population is under `maxAgents`, whatever the births are doing                                                                                                                                                                                                                       | `fillFloor`                                                           |
| `rescuePredators` adds one hunter entrant every `predatorRescueInterval` (450) ticks while fewer than `predatorRescueMin` (3) hunters live                                                                                                                                                                                                                        | `../../js/sim/predator-rescue.js`                                     |
| `splitGateOpen` opens for every agent when `population < meritSplitFloorPop` (80); otherwise it needs `deliberateIntake >= splitDeliberateMin` (300) and `splitKeysAllow` (deliberate meals over meals at least `splitDeliberateShareMin` 0.2). Only the parent is tested; a child's counters start at 0                                                          | `../../js/sim/reproduction.js`, `../../js/sim/split-gate.js`          |
| Chance food and bites pay `CHANCE_WEIGHT` 0.25 in `fitnessV6` and `meritChanceWeight` 0.25 in merit; `meritMateWeight` and `meritBirthBoost` are 0, so chance reaches breeding through archive rank only                                                                                                                                                          | `../../js/evo/fitness-v6-skill.js`, `../../js/sim/config-defaults.js` |
| `mateScore` is `energy / maxEnergy` at `meritMateWeight` 0                                                                                                                                                                                                                                                                                                        | `../../js/sim/mate-search.js`                                         |
| The `fitnessV6` pack term pays `PACK` 30 to the kin within `callRadius` of where the victim fell, not to the two who bit                                                                                                                                                                                                                                          | `notePackKin` in `../../js/evo/observer-watch-counters.js`            |
| `descriptorV6` places a death at (deliberate share of intake, body plan)                                                                                                                                                                                                                                                                                          | `../../js/evo/descriptors.js`                                         |
| Body inputs 9 and 10 are the sine and cosine of the year phase                                                                                                                                                                                                                                                                                                    | `writeBodyInputs` in `../../js/sim/body-inputs.js`                    |
| Food patches deplete (`foodPatchDepletion` 0.02 stock per food eaten inside, `foodPatchRegrow` 0.0005, a floor of `PATCH_FLOOR_SHARE` 5% of capacity) and `pickPatch` spawns food by stock, so a depleted patch grows little food. Food is seen on rays; there is no food scent (the antennae read danger, attack and hunt pheromones); the stock is not an input | `../../js/sim/food-patches.js`, `../../js/sim/scent-inputs.js`        |

Patch depletion is already perceivable as the absence of food on the rays, and memory covers the rest, so no change to
patches is planned.

What the observer counts today: distinct patches visited per life (a 100-tick sample, `../../js/evo/watch-visits.js`),
bite-episode outcomes caught and escaped (`../../js/evo/observer-combat.js`), deliberate-bite chains
(`../../js/evo/observer-watch-counters.js`), alarm follow-ups, smoke releases and hunt-call answers. No counter exists
for patch residence, hunt aborts, refuge use, carcass meals, wall-gap crossings or per-basin population.

## Config keys and options

Every key is a no-op at its default. `rulesHash` changes with the new keys, so an archive or champion file written
before is rejected by its `rulesHash` check; none is committed.

| Key                 | Type                                   | Default  | Meaning                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floorTrigger`      | int, 0 to `minAgents`                  | 0        | 0: `fillFloor` acts below `minAgents` as today. Above 0: it acts only when the population is under `floorTrigger`, then refills to `minAgents` as a restart. A basin may go extinct; the floor never sees it                                                  |
| `entrantEnergy`     | num, at least 0                        | 0        | Energy of a seeder entrant (floor, immigrant, rescue); the initial population keeps `initialEnergy`. 0 means `initialEnergy`                                                                                                                                  |
| `entrantGateWindow` | int, at least 0                        | 0        | 0: immigrants and rescues fire on their timers. Above 0: they skip while the births of the last `entrantGateWindow` ticks (split and mate) reach the deaths of the same ticks (starved, cold, eaten, old): the living replace themselves. The floor is exempt |
| `establishedRule`   | enum `off`, `archive`, `split`, `both` | `off`    | The proof rule below                                                                                                                                                                                                                                          |
| `mateRank`          | enum `energy`, `skill`, `offspring`    | `energy` | What `mateScore` ranks: `energy` today; `skill` is the candidate's deliberate meals over meals (`mealsDeliberate`, `mealsTotal` of `split-gate.js`); `offspring` is its count of children that reached maturity (the merit child credit of `merit.js`)        |
| `seasonInputs`      | bool                                   | true     | false writes 0 to body inputs 9 and 10; the layout is unchanged                                                                                                                                                                                               |

Policy options of `map-elites-v6` (checked before the run and written to the report, as `archiveShare` is):

| Option                           | Default | Meaning                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `socialCredit`                   | `paid`  | `paid`: the pack, alarm and hunt-call terms as today. `actors`: the pack term pays 0 to the standers-by; the two biters are paid once, by the skill group (`convergedKills`) `returned`: `actors`, and a social term counts only for an actor that left a matured child |
| `fitnessOverrides.CHANCE_WEIGHT` | 0.25    | Existing; 0 removes chance from archive rank                                                                                                                                                                                                                            |

Chance food in merit uses the existing `meritChanceWeight` (0 removes it from mate rank and birth energy).

### The proof rule

An agent is **proven** once, at any age, its own `deliberateIntake` reaches `splitDeliberateMin` and its deliberate meal
share reaches `splitDeliberateShareMin` (the split gate, without the population bypass). A genome is **established**
when its bearer is proven and at least one child of that bearer is proven too: the skill was repeated without anyone
paying for it.

- `archive`: a death enters the archive only if the dead genome is established. The archive records repeated skill.
- `split`: a parent with one split child alive and not yet proven cannot split again. A line grows by proof, not by
  copying.
- `both`: both rules.

Per-slot arrays `proven` and `unprovenKids` and the parent's genome id are derived state beside the split-gate
counters: zeroed by `freeAgent`, outside `worldHash`, no RNG, no allocation per tick.

## Detectors

Each is an observer metric with a test on a hand-built world, direction `watch` unless it says one, no sim state
change (the golden `worldHash` is unchanged) and no per-tick allocation.

| Metric                                                                         | Scene or rule           | Definition                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.patch_stay_depleted`, `eval.patch_leave_depleted`                        | Leave a dying patch     | Of the 100-tick patch samples (`sampleVisits`) of agents inside a patch whose stock is under half of `foodPatchCapacity`, the share still inside that patch 300 ticks later (lower) and the share outside it by then (higher)                 |
| `eval.hunt_abort_rate`                                                         | Abort                   | An approach opens when the intent tracker sees a hunter close on prey (`CLOSING_MIN` of the last `CLOSING_BITS` ticks); it ends in a bite (committed) or lapses with no bite inside `INTENT_WINDOW` (aborted). Aborted over closed approaches |
| `eval.chase_catch_share`, `eval.chase_escape_share`, `eval.chase_giveup_share` | A real chase, rule 6    | The same approaches, from the first closing sighting: ending in a kill, in the prey living past the window after a bite, or lapsing. The shares sum to 1                                                                                      |
| `eval.refuge_use_under_threat`                                                 | Refuge                  | Every 10 ticks, the share of threatened agents (a "can bite me" ray hit at proximity 0.5 or more, as in `eval.group_cohesion_under_threat`) inside a refuge ring, minus the same share for unthreatened agents                                |
| `eval.carcass_meal_share`, `eval.carcass_hunter_share`                         | Scavenge                | Meat energy eaten from carcasses over all meat energy, and the share of carcass energy eaten by `canHunt` agents; the task checks which event carries the food kind (`FOOD_KIND` in `../../js/sim/carcass.js`)                                |
| `eval.gap_crossers`, `eval.gap_never_share`                                    | Cross or stay           | Per lineage with 20 samples or more, the crossings of the wall line (10-tick samples, `../../js/sim/terrain.js`): the mean per lineage, and the share of lineages with none                                                                   |
| `eval.basin_pop_cv`, `eval.basin_recolonisations`                              | Boom and bust, rule 1   | The coefficient of variation of each basin's population at the 1000-tick checkpoints; and the count of basin extinctions (a basin at 0) followed by 5 alive agents with no entrant spawned into that basin since                              |
| `eval.birth_source_share.<split, mate, floor, immigrant, rescue>`              | Rule 1                  | The share of births after burn-in by `BORN_CAUSE`, with rescue births counted from the `PREDATOR_RESCUE` event (a rescue spawns with `BORN_CAUSE.IMMIGRANT`) and taken out of the immigrant share                                             |
| `eval.lineage_persistence`                                                     | Rule 4                  | Of the lineages alive at the start of a winter, the share with an alive member at the start of the next spring; and likewise at the end of a hunted year (a lineage with one of its bearers eaten); per seed, the mean                        |
| `eval.skill_heritability`                                                      | Rules 2 and 9           | Over split and mate births, the correlation between the parent's deliberate meal share at the birth and the child's at its tenth meal. A child with fewer than 10 meals is left out; the child's `bonus` terms are not read                   |
| `eval.niche_replacement`                                                       | Rule 1, diversity bonus | Of the lineages in the rarest quarter of descriptor cells at a checkpoint, the share with a matured child by the next checkpoint                                                                                                              |
| `eval.social_return`                                                           | Rules 7 and 8           | Matured grandchildren of agents with a social credit (pack, alarm, hunt call) minus those of agents without, over agents of equal age; a negative value is the cheater signal                                                                 |
| `eval.proven_share`, `eval.established_share`                                  | Rule 2                  | Of the agents that died after burn-in, the share proven and the share established                                                                                                                                                             |

## Phases

### Phase 1 - Build behind flags

**Targets:** none - every key defaults to the current behaviour; the new `eval.*` metrics are instruments (`watch`), and no existing metric moves

The detectors, the six keys and the `socialCredit` option, each with its tests and its log events. Batches of 2 to 4
tasks per PR, one commit per task. The predator-survival screen (T5) is a screen and is not batched with code.

### Phase 2 - The big switch

**Targets:** eval.spec_dominance, eval.circling_share, eval.output_saturation, eval.alarm_rate, eval.predator_presence, eval.floor_episodes, eval.skill_trend, eval.deliberate_food_share

One PR sets the chosen set as the defaults and in `FEATURES_ON`, re-pins the goldens once and re-records the baselines
once.

| Change                                                | Value in the switch                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| `floorTrigger`                                        | 8                                                                 |
| `meritSplitFloorPop`                                  | 8 (the split bypass opens only at the same near-extinction level) |
| `entrantEnergy`                                       | 200                                                               |
| `entrantGateWindow`                                   | 1800                                                              |
| `predatorRescueMin`                                   | 0, with the cost and prey pair that T5 finds                      |
| `establishedRule`                                     | `both`                                                            |
| `meritChanceWeight`, `fitnessOverrides.CHANCE_WEIGHT` | 0                                                                 |
| `mateRank`                                            | `skill`                                                           |
| `socialCredit`                                        | `actors`                                                          |
| `seasonInputs`                                        | false                                                             |

The economy of the E64 winner (`maxEnergy` 2000, scout `moveCostMultiplier` 1) is adopted in the same PR; it is the
base the screens ran on.

### Phase 3 - Attribution and tuning

**Targets:** eval.spec_dominance, eval.circling_share, eval.output_saturation, eval.alarm_rate, eval.lineage_persistence, eval.skill_heritability, eval.predator_presence, eval.skill_trend

`E65`: a 16-seed screen (`evals/screens/selection.grid.json`, seeds 33-48, 200000 ticks) of the arm `pre` (every
changed key at its pre-switch value), the arm `all-on` (the Phase 2 defaults) and nine leave-one-out arms `no-<change>`
(all-on with one row of the Phase 2 table at its pre-switch value: floor, entrants, gate window, rescue, proof, chance,
mate rank, social credit, season input). A change's effect is `all-on` against `no-<change>` on the same seeds. The
verdicts are judged on the scene detectors, the selection metrics and the mess metrics. A change whose arm shows no
benefit and a regression on the mess or detector metrics returns to its pre-switch value in a commit of its own. Then
the long run (`E66`, 16 seeds x 600000 ticks) and the clip review.

## Done criteria

Against `E63` (the T48g defaults) and `E64`'s `ref` arm for the economy metrics, 16 seeds, `eval:compare` with the
default minimum effect. The fitness-and-selection.md Phase 4 Done table is judged here.

| Criterion                                                                                                                                                                                                     | Measured by                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Watchable: `eval.spec_dominance` mean at most 0.5; `eval.circling_share`, `eval.output_saturation` and `eval.alarm_rate` each `better` than `E63`                                                             | `eval:compare`; the user's watch |
| Death is final: the share of births from `floor`, immigrants and rescues together is under 0.05 after burn-in; `eval.floor_episodes` under 3 per seed                                                         | `eval.birth_source_share.*`      |
| Predators persist on their own: `eval.predator_presence` mean at least 0.60 with `predatorRescueMin` 0                                                                                                        | `eval:compare`                   |
| The skill is repeated: `eval.skill_heritability` is positive on at least 12 of 16 seeds; `eval.skill_trend` is `better` than `E63` and positive in `E66`                                                      | the report; `eval:compare`       |
| Strength is persistence: `eval.lineage_persistence` is not `worse` than `E63`                                                                                                                                 | `eval:compare`                   |
| Scenes appear: at least five of the detectors in the table above are `better` in their intended direction than `E63`, none `worse` by the minimum effect; each has a clip or a replay frame the user can name | `eval:compare`; `Shift+P` clip   |
| Local extinction exists and is recolonised: `eval.basin_recolonisations` is at least 1 on at least 8 of 16 seeds                                                                                              | the report                       |
| The world holds: `seedChecks` pass with "population above `minAgents`" read as above `floorTrigger` when it is set; `eval.fed_median_lifespan` and `eval.food_energy_per_1k` not `worse` than `E64`'s winner  | `seedChecks`; `eval:compare`     |
| Social genes are real: `eval.social_return` is not negative, or the pack, alarm and hunt-call terms are set to 0 in `fitnessOverrides`                                                                        | the report                       |
| Mating stays a floor only: `eval.mating_share` mean at least 0.10 (user, 2026-10-29)                                                                                                                          | the report                       |

## Decisions

| Decision                                                                                                | Why                                                                                                                                                                                  | By      | Date       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------- |
| Selection and watchability changes live in this doc, built behind flags and switched on once (big bang) | Re-pinning the goldens and baselines after every tuning round costs more than it buys; flags plus leave-one-out arms keep each change attributable                                   | User    | 2026-10-29 |
| The proof rule gates archive entry and further splits (`establishedRule`), with `both` in the switch    | "A child must clear the bar before its line is established" needs one definition; archive entry records repeated skill, and the split brake stops a line growing on one lucky parent | Manager | 2026-10-29 |
| Patch depletion stays as it is; no perceivable-depletion task                                           | Patches already deplete (`foodPatchDepletion`) and `pickPatch` spawns by stock, so a depleted patch looks empty on the food rays; no food scent exists and none is added             | Manager | 2026-10-29 |
| The floor becomes a total-extinction guard through `floorTrigger`; `minAgents` stays the restart size   | The floor of 40 is hit 92 times per 200000 ticks in the E64 winner; a basin must be allowed to crash                                                                                 | Manager | 2026-10-29 |
| The season input is zeroed here (`seasonInputs`) and removed from the layout by the brain plan's T24    | The flag lets the switch happen before the layout change; the layout change makes it permanent                                                                                       | Manager | 2026-10-29 |
| Experiment ids continue at `E65`                                                                        | `E48` to `E60` are reserved by the brain plan and `E61` to `E64` are recorded                                                                                                        | Manager | 2026-10-29 |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/`: `floorTrigger` in `fillFloor`, `entrantEnergy` in `spawnAgent`, the gate in a new `js/sim/entrant-gate.js`, the proof rule in a new `js/sim/proof.js` beside `split-gate.js`, `mateRank` in `mateScore`, `seasonInputs` in `writeBodyInputs`. `js/evo/`: a new `metrics-scenes.js` and `observer-scenes.js` for the detectors, `metrics-selection.js` for the selection metrics, `socialCredit` in `fitness-v6-watch.js` and `map-elites-v6.js`, the archive-entry check in the policy's death hook. Worker, renderer and UI unchanged                             |
| Unit tests              | `test/sim/entrant-gate.test.js`, `test/sim/proof.test.js`, `test/sim/floor-trigger.test.js`, `test/sim/mate-rank.test.js`, `test/sim/season-inputs.test.js` (each key's bound; the default reproduces today's behaviour bit-for-bit; the gate against a naive window count); `test/evo/metrics-scenes.test.js`, `test/evo/metrics-selection.test.js` (each detector on a hand-built world with a known answer); `test/evo/social-credit.test.js`; `test/evo/chance-breed.test.js` (with both chance weights 0, chance energy moves no mate score, birth gift or archive rank) |
| Headless e2e            | Phase 1: the four golden cases in `../../test/sim/golden.json` keep their `worldHash`; `eval-smoke` runs with the detectors. Phase 2: the four cases are re-pinned once, in Node and in Chromium (`npm run browser:hash`)                                                                                                                                                                                                                                                                                                                                                     |
| Performance budget      | Counters update at birth, death and the existing 100-tick and 1000-tick samples only. `bench.step_ms@500` within 15% of `bench/baseline.json` in Phase 1; `scripts/alloc-check.mjs` reports no per-tick allocation. Phase 2 re-records `bench/baseline.json` once, on a quiet machine under `flock /tmp/claude-1000/cpu.lock`                                                                                                                                                                                                                                                 |
| Evolution metrics       | The Done table; `E65` and `E66` with `eval:compare` output attached; `npm run eval:power` on the new metrics in Phase 1 so each detector has a false-positive rate and a detectable change before it is cited                                                                                                                                                                                                                                                                                                                                                                 |
| Determinism             | No new RNG draw: the gate, the guard, the proof rule and the mate rank read state only. The entrant stream order is unchanged when a gate skips a spawn (the seeder draws only on a spawn). Everything replays from seed and config                                                                                                                                                                                                                                                                                                                                           |
| Config and persistence  | The keys and option above, each a no-op by default; `rulesHash` and the archive version change with them, so older archive and champion files are refused by field name; `establishedRule` changes what the archive stores, so Phase 2 bumps `ARCHIVE_VERSION`                                                                                                                                                                                                                                                                                                                |
| Logging and diagnostics | `EntrantGated` (debug: tick, source, windowBirths, windowDeaths), `FloorGuard` (info: tick, population, spawned; replaces the unconditional `PopulationFloor` field set only when `floorTrigger` is above 0), `LineProven` (debug: tick, genomeId, parentId), `ArchiveRefused` (debug: genomeId, reason `unestablished`). Replay: `npm run replay -- --seed 1 --ticks 200000 --level debug --policy map-elites-v6 --config <file with the Phase 2 values>`. Nothing logs per agent per tick                                                                                   |
| Browser compatibility   | N/A - the keys run in the worker's sim core and the detectors in the eval observer; no new browser API. The Phase 2 golden hashes are checked in Chromium                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Docs                    | [principles.md](../principles.md) (detector names fill the "none yet" cells as they land), [evolution-evals.md](evolution-evals.md) (Metrics table), [headless-sim-core.md](headless-sim-core.md) (config table), [fitness-and-selection.md](fitness-and-selection.md) (status), [sim-notes.md](sim-notes.md) (a learned entry per phase). This doc becomes the as-built description of the selection rules                                                                                                                                                                   |
| Verification            | `scripts/check.sh` green; the Done table met by `E65` and `E66`; the manual browser walk below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Task breakdown

### Phase 1 - Build behind flags

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                         | Nature       | Depends on                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| T1  | Scene detectors: the patch, abort, chase, refuge, carcass, wall-gap and basin metrics of the Detectors table in `js/evo/metrics-scenes.js` and `js/evo/observer-scenes.js`, each with a direction or `watch` and a test; first confirm in the observer what exists (it counts none of them) and reuse `sampleVisits` and the intent tracker. Serves Leave a dying patch, Abort, A real chase, Refuge, Scavenge, Cross or stay, Boom and bust | [judgement]  | -                                       |
| T2  | Selection detectors: `eval.birth_source_share.*`, `eval.lineage_persistence`, `eval.skill_heritability`, `eval.niche_replacement`, `eval.social_return`, `eval.proven_share`, `eval.established_share` (the last two read `null` until T6), each tested on a hand-built world. Serves rules 1, 2, 4, 7, 8 and 9                                                                                                                              | [judgement]  | -                                       |
| T3  | The floor as a total-extinction guard: `floorTrigger` in `fillFloor`, the `FloorGuard` event, `meritSplitFloorPop` documented as the same level, `scripts/lib/screen-verdict.mjs` reading `floorTrigger` for "population above floor", tests that a basin can reach 0 and stay 0 while the world is above the trigger. Serves Boom and bust and rule 1                                                                                       | [judgement]  | -                                       |
| T4  | Poor, gated entrants: `entrantEnergy` in `spawnAgent`, `entrantGateWindow` with the births and deaths window counters (derived state, outside `worldHash`) skipping immigrants and rescues while the living replace themselves, the `EntrantGated` event, tests against a naive window count. Serves rule 1                                                                                                                                  | [judgement]  | T3                                      |
| T5  | Predator survival without rescue: a screen (`evals/screens/predator-cost.grid.json`, 8 seeds, `predatorRescueMin` 0 with `huntUpkeep` and `biteEnergy` arms) and a sim-notes entry naming the cost and prey pair that holds `eval.predator_presence` at 0.60; uses the existing keys `huntUpkeep`, `biteEnergy` and `predatorRescueMin`. Serves rule 4 and A real chase                                                                      | [judgement]  | T4, T2                                  |
| T6  | The proof rule: `establishedRule` with the `proven` and `unprovenKids` arrays in `js/sim/proof.js`, the archive-entry check in the policy's death hook, the `LineProven` and `ArchiveRefused` events, tests (proof needs the child; a childless proven genome is not established; the split brake). Serves rule 2                                                                                                                            | [judgement]  | T2                                      |
| T7  | Chance-free breeding: a test that with `meritChanceWeight` and `fitnessOverrides.CHANCE_WEIGHT` at 0 chance energy moves no mate score, birth gift or archive rank, and that `fitnessOverrides` accepts `CHANCE_WEIGHT`; adds the key to the override list if it does not. Serves rule 2                                                                                                                                                     | [mechanical] | -                                       |
| T8  | Mate rank: `mateRank` in `mateScore` (`skill`, `offspring`), tests against a naive ranking. Serves rule 5                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T7                                      |
| T9  | Social credit: the `socialCredit` option (`actors`, `returned`) in `fitness-v6-watch.js` and the policy, tests that `actors` pays the biters only and `returned` needs a matured child. Serves rules 7 and 8                                                                                                                                                                                                                                 | [judgement]  | T2                                      |
| T10 | The season input flag: `seasonInputs` in `writeBodyInputs`, a test that false writes 0 to inputs 9 and 10 and nothing else. Serves Season changes the map and the trait "senses are local"                                                                                                                                                                                                                                                   | [mechanical] | -                                       |
| T11 | Conformance review of Phase 1: a fresh agent reads this doc and the diff; runs in parallel with `scripts/check.sh`; the goldens are unchanged; the same PR moves the Status line and marks the phase `(built)`                                                                                                                                                                                                                               | [judgement]  | T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 |

PR batches: T1 and T2; T3 and T4; T6, T7 and T8; T9 and T10. T5 is a screen and runs alone.

### Phase 2 - The big switch

| #   | Task                                                                                                                                             | Nature       | Depends on    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------- |
| T12 | Set the Phase 2 table as the defaults and in `FEATURES_ON`, with the E64 economy; update the tests that pin the defaults; bump `ARCHIVE_VERSION` | [judgement]  | T11           |
| T13 | Re-pin the four golden cases in Node and Chromium, in a commit of its own                                                                        | [mechanical] | T12           |
| T14 | Re-record `baseline-v5`, `baseline-v5-o16` and `bench/baseline.json` on a quiet machine                                                          | [mechanical] | T13           |
| T15 | Conformance review of Phase 2; the same PR moves the Status line and marks the phase `(built)`                                                   | [judgement]  | T12, T13, T14 |

### Phase 3 - Attribution and tuning

| #   | Task                                                                                                                                                                                                                                      | Nature       | Depends on         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------ |
| T16 | Record the `E65` prediction, write `evals/screens/selection.grid.json` (`pre`, `all-on`, nine `no-<change>` arms), run `npm run screen`, and write the per-change attribution table (`all-on` against each `no-<change>`)                 | [mechanical] | T15                |
| T17 | Decide against the Done table: keep each change that earns its place, return the rest to the pre-switch value in a commit of its own, record `E65` in `evals/experiments.json` and a sim-notes entry; report a partial result to the user | [judgement]  | T16                |
| T18 | Run `E66` (16 seeds x 600000 ticks) with the adopted defaults; check `eval.skill_trend` stays positive; run `scripts/check.sh` and `npm run bench`                                                                                        | [mechanical] | T17                |
| T19 | Move the Status lines of this doc and [fitness-and-selection.md](fitness-and-selection.md) (Phase 4 built), update the Docs row, regenerate the index                                                                                     | [mechanical] | T18                |
| T20 | Conformance review of Phase 3, with a recorded clip of the default world for the user (`Shift+P`); a fresh agent reads this doc and the diff in parallel with `scripts/check.sh`                                                          | [judgement]  | T16, T17, T18, T19 |

## Verification

1. `scripts/check.sh` is green, including the golden test, `bench-check`, `eval-smoke` and the shuffled tests.
2. Phase 1: `npm run replay -- --seed 1 --ticks 20000 --level debug --policy map-elites-v6 --config <file with the Phase 2 values>`
   with each key at its Phase 2 value logs `FloorGuard`, `EntrantGated`, `LineProven` and `ArchiveRefused` events and no error.
3. Phase 1: `npm run eval:power -- <E63 report>` prints a false-positive rate and a detectable change for every new
   metric; a metric with no power is not cited in a verdict.
4. Phase 2: `npm run browser:hash` prints the re-pinned hashes from a Chromium worker.
5. Phase 3: `npm run eval:compare -- <E63 report> <E65 all-on report>` meets the Done table.
6. Manual browser walk: `npm run dev`, open http://localhost:5173, start the live policy at 500 agents and watch for 10
   minutes. Name a life aloud for each: a forager leaving a depleted patch, a hunter turning back, a lineage that never
   crossed a wall gap, a basin emptying and refilling, an inspector view with no season sine or cosine. The console is
   free of errors.
