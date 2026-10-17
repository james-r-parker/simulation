# World balance and biology

**Status:** Proposed - stub: every known balance issue, deliberate-behaviour measures and fitness, the tuning-night method and the biology features; Phase 1 measures deliberate behaviour, Phase 2 rewards it and settles the balance issues, Phase 3 adds the biology features.
**Validated:** bd35cef (2026-10-17)
**Priority:** 3 - the world gate in evolution-rework.md Phase 3 needs these issues settled, and tuning is judged by watching the renderer (rank 2)
**Depends on:** [predator-prey.md](predator-prey.md), [worker-and-renderer.md](worker-and-renderer.md), [evolution-evals.md](evolution-evals.md)

The world is tuned until it passes the world gate in [evolution-rework.md](evolution-rework.md) Phase 3, then the
trainer runs. This doc holds the open balance issues found on the tuning night of 2026-10-16 (experiments `E19` and
`E20`, sweep files in `.claude/worktrees/tune-night-2026-10-16/`), the method each tuning night follows, and the
biology features that change the balance again.

## Open balance issues

| #   | Issue                                                                                                                                                                                                                                                                | Evidence                                                                                                                                               | Decision                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Food may be too easy: with `maxFood` 1600 and `foodTargetPerAgent` 12, random brains no longer die out without the floor, so foragers may thrive by bumping into food rather than seeking it                                                                         | Skill ladder at the tuned defaults (10000 ticks, no floor, seeds 1-3): random 9-24 agents left, sloppy forager, `foodSeeker` and `fleer` all about 320 | Next tuning night searches for the least food that keeps `eval.born_share` above 0.7 (user, 2026-10-17)                         |
| B2  | The top of the skill ladder is flat: sloppy, good and fleeing foragers all fill the world to about 320, so small improvements do not show once the world saturates                                                                                                   | Same ladder; defaults before tuning were smoother (random died out slowly, each rung a little above the last)                                          | Same night: random brains die out slowly and each ladder rung beats the one below without saturating (user)                     |
| B3  | Lineage diversity fell: `eval.lineages_alive` -59% and `eval.lineage_turnover` -45% against `E17`                                                                                                                                                                    | `E20`                                                                                                                                                  | Accepted for now; the biology features in Phase 2 address it (user)                                                             |
| B4  | The anti-exploit bound counts food only, while `fitnessV1` pays bite energy: the scripted `hunter` scores 0.746 of the `foodSeeker` against a bound of 0.5 after jaws and `huntSizeRatio` 1.01 (about 680 bite energy against 260 food per agent in the micro-world) | `test/evo/anti-exploit.slow.test.js` on branch `feat/predator-prey-phase-2` (draft PR 39)                                                              | The anti-exploit bound counts all intake, food plus bite energy (user); applied in predator-prey.md Phase 2                     |
| B5  | 16 seeds no longer separate seed sets on off-target metrics under a self-sustaining population: the calibration gave verdicts on `eval.floor_episodes` (-23.6%) and `eval.lineages_alive` (-20.9%)                                                                   | `E19`                                                                                                                                                  | Verdicts on `eval.floor_episodes`, the lineage metrics and `eval.predator_share_cv` need 32 seeds; 16 stays for the rest (user) |
| B6  | Predators are uneven across seeds: `eval.predator_share_cv` rose from 0.05 to 0.99                                                                                                                                                                                   | `E20`                                                                                                                                                  | -                                                                                                                               |
| B7  | The cold band below `temperatureColdStress` is close to absorbing: a `foodSeeker` started at 20 degrees rarely recovers; raising `temperatureGainEat` to 3, 4 or 6 did not help and cut births                                                                       | Cold-forager checks (2026-10-16) and the sweep's `temperatureGainEat` screens                                                                          | -                                                                                                                               |
| B8  | Alarm calls are mostly noise: callers are rarely near kin (0.2 to 0.4 living kin per agent), so calls cannot be kin-selected; `eval.alarm_response` is small (0.0045)                                                                                                | Seed 1, 100000 ticks, events from tick 50000; T17 figures in `sim-notes.md`                                                                            | -                                                                                                                               |
| B9  | Mating is rare against splitting (28 against 313 births in the 2026-10-16 check), so crossover barely acts                                                                                                                                                           | Same check                                                                                                                                             | -                                                                                                                               |
| B10 | `bench.step_ms@500` has no headroom left: `main` measured 4.50 ms on 2026-10-17 at 04:00 and 4.67 to 4.80 ms later the same day on the same machine, against the 4.63 ms limit (4.03 baseline + 15%), so the local `bench-check` gate fails on `main` itself         | Predator-prey Phase 1 PR 37; `node scripts/bench-compare.mjs` on the renderer Phase 2 branch (head -1.7% against `main`)                               | Profile and optimise `sense` and `brain` (no baseline change), or the user re-baselines after the world gate                    |
| B11 | A 7680 x 4320 world (exactly 2x 4K) is the preferred size for the display; it ran only with `obstacleCount` 10 and was not confirmed at 16 seeds                                                                                                                     | Sweep screens `d11`                                                                                                                                    | Next tuning night tunes at 7680 x 4320 and adopts it when it passes the world gate (user)                                       |

## Deliberate behaviour

Fitness and the tuning scorecard reward what an agent meant to do, not what happened to it (user, 2026-10-17).
Random contact - drifting into food, a bite on a prey that blundered into the jaws, a call or smoke with no threat
near - earns little or nothing, and wasted signals cost. Every measure below is computed from the sim's own state
and events (rays, headings, timers, `heard`, positions), draws no randomness, and is credited only when the agent's
recent actions show intent.

| #   | Behaviour            | Counts as deliberate                                                                                                                                                      | Counts as chance or waste                                                                                                                     |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Foraging             | Food eaten after the agent saw it on a ray and closed on it (turned towards it and the distance fell over the preceding ticks)                                            | Food eaten with no food on any ray in the preceding ticks, or while turning away from it                                                      |
| D2  | Hunting              | A bite or kill after the hunter held the prey ahead (inside `biteArc` on its rays) and closed the gap over a pursuit window                                               | A bite on prey that entered the jaws without a pursuit                                                                                        |
| D3  | Pack hunting         | Kills where two or more same-lineage hunters converged on the prey within `packWindow`, or a hunt call was heard and answered by approach                                 | Two hunters biting the same prey by coincidence with no convergence                                                                           |
| D4  | Evasion              | An escape after the prey saw the hunter, turned away or sprinted, or entered smoke                                                                                        | Surviving because the hunter never pursued                                                                                                    |
| D5  | Grouping             | Prey of one lineage staying within call range of each other while a hunter is near, and alarm hearers moving away from the threat                                         | Clumping around one food patch with no threat                                                                                                 |
| D6  | Alarm and hunt calls | A call made while a threat (for alarms) or a prey (for hunt calls) is on the caller's rays, followed by a measurable response from hearers                                | A call with no threat or prey in sight: earns nothing and its energy cost stands; repeated idle calls are penalised                           |
| D7  | Smoke                | Smoke released within a short window of being bitten or with a hunter ahead, followed by an escape                                                                        | Smoke with no hunter near: earns nothing, and the release counts against the agent                                                            |
| D8  | Defence              | Being bitten after the agent saw the hunter and still fled, turned away, released smoke, called or (for a defender) turned to face it; such bites are not held against it | Being bitten with the hunter on its rays and no response: counts against fitness. A bite from a hunter it never saw is luck and counts little |

- Metrics: each row becomes an `eval.*` metric (for example `eval.deliberate_food_share`, `eval.pursuit_catch_share`,
  `eval.pack_convergence`, `eval.evasion_skill`, `eval.group_cohesion_under_threat`, `eval.call_precision`,
  `eval.smoke_precision`) so tuning nights and comparisons can target them.
- Fitness: the fitness that replaces `fitnessV1` pays mostly for D1 to D8, discounts chance intake, and charges
  wasted calls and smoke. The `fitnessV2` terms planned in [predator-prey.md](predator-prey.md) Phase 3 are
  re-planned from this table before that phase is built.
- Anti-exploit: scripted controllers for each "chance or waste" column (a drifter that eats only by contact, a
  hunter that bites only what wanders into its jaws, call and smoke spammers) must score below the matching
  deliberate controller.
- The skill ladder gains rungs for each behaviour, so a tuning night can see that skill beats chance by a clear
  margin at every step.

## Tuning-night method

1. Prediction first, written to the night's `predictions.md`.
2. 4-seed screens (seed offset 28, 200000 ticks, the live policy) ranked against a defaults screen on the same seeds.
3. The best 3 to 5 go to 16 seeds against the reference report, then to fresh seeds 17-32 with `--allow-seed-diff`.
4. The skill ladder (random brains, a sloppy forager, `foodSeeker`, `fleer`; no floor; 10000 ticks; seeds 1-3) runs for
   every finalist.
5. Ranking uses the deliberate-behaviour metrics (D1 to D8) alongside food, births and fed lifespan; a world where
   chance does nearly as well as skill is rejected.
6. A setting is kept only with a mechanism and a confirmed 16-seed result; the adopted override is recorded as an
   experiment in `evals/experiments.json` and learnings go to `sim-notes.md`.

## Biology features

- Mate choice by genetic similarity, so crossover joins compatible brains.
- Two sexes with female choice: only females carry a pregnancy, and a willing female mates with the strongest male in
  range by an honest quality signal (energy, size or skill), so males compete and sexual selection adds a second
  route up the fitness landscape. The existing `pregnancyTicks` (480) and `reproductionCooldown` (300) stop a female
  remating at once; males are limited by `mateCost` and their cooldown. Built only once the world is dense enough
  that pairings are common (mating is 28 against 313 splits today, issue B9).
- Evolvable body traits with costs (size, sensing range, the share of energy given to a child).
- Patchy food and terrain, so several strategies can hold their own regions.
- Learning within a lifetime (a small Hebbian term) to smooth the climb from random to skilled.
- A lower floor once the world sustains itself, so predator and prey numbers can cycle.

## Phases

### Phase 1 - Measure deliberate behaviour

**Targets:** none - stub: instruments first; the D1 to D8 metrics are recorded for `baseline-v5` and the live policy

TBD - stub: planned in full with the `create-plan` skill: the D1 to D8 metrics, the per-metric seed minimum (B5), the
chance-or-waste scripted controllers and the extended skill ladder.

### Phase 2 - Reward deliberate behaviour and settle the balance

**Targets:** eval.fed_median_lifespan, eval.food_energy_per_1k, eval.births_per_1k, eval.floor_episodes, eval.lineages_alive

TBD - stub: the fitness built on D1 to D8 (re-planning `fitnessV2` in predator-prey.md Phase 3), then a tuning night
at 7680 x 4320 aimed at B1 and B2 with the deliberate metrics on the scorecard.

### Phase 3 - Biology features

**Targets:** none - stub: each feature is planned with its own metrics when this phase is written

TBD - stub: written with the `create-plan` skill after Phase 2.

## Delivery requirements

| Concern                 | Requirement                                               |
| ----------------------- | --------------------------------------------------------- |
| Architecture            | TBD - stub: decided when the phases are planned           |
| Unit tests              | TBD - stub: decided when the phases are planned           |
| Headless e2e            | TBD - stub: decided when the phases are planned           |
| Performance budget      | TBD - stub: `bench.step_ms@500` headroom is issue B10     |
| Evolution metrics       | TBD - stub: the world gate in evolution-rework.md Phase 3 |
| Determinism             | TBD - stub: decided when the phases are planned           |
| Config and persistence  | TBD - stub: decided when the phases are planned           |
| Logging and diagnostics | TBD - stub: decided when the phases are planned           |
| Browser compatibility   | N/A - balance and biology live in `js/sim/` and `js/evo/` |
| Docs                    | TBD - stub: decided when the phases are planned           |
| Verification            | TBD - stub: decided when the phases are planned           |

## Task breakdown

### Phase 1 - Measure deliberate behaviour

| #   | Task                                              | Nature      | Depends on |
| --- | ------------------------------------------------- | ----------- | ---------- |
| T1  | Plan Phase 1 in full with the `create-plan` skill | [judgement] | -          |
| T2  | Conformance review of Phase 1                     | [judgement] | T1         |

### Phase 2 - Reward deliberate behaviour and settle the balance

| #   | Task                                              | Nature      | Depends on |
| --- | ------------------------------------------------- | ----------- | ---------- |
| T3  | Plan Phase 2 in full with the `create-plan` skill | [judgement] | T2         |
| T4  | Conformance review of Phase 2                     | [judgement] | T3         |

### Phase 3 - Biology features

| #   | Task                                              | Nature      | Depends on |
| --- | ------------------------------------------------- | ----------- | ---------- |
| T5  | Plan Phase 3 in full with the `create-plan` skill | [judgement] | T4         |
| T6  | Conformance review of Phase 3                     | [judgement] | T5         |

## Verification

TBD - stub: written with the phases.
