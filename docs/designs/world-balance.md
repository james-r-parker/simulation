# World balance and biology

**Status:** Proposed - stub: every known balance issue, the tuning-night method and the biology features that follow; Phase 1 settles the open balance issues before the trainer.
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

## Tuning-night method

1. Prediction first, written to the night's `predictions.md`.
2. 4-seed screens (seed offset 28, 200000 ticks, the live policy) ranked against a defaults screen on the same seeds.
3. The best 3 to 5 go to 16 seeds against the reference report, then to fresh seeds 17-32 with `--allow-seed-diff`.
4. The skill ladder (random brains, a sloppy forager, `foodSeeker`, `fleer`; no floor; 10000 ticks; seeds 1-3) runs for
   every finalist.
5. A setting is kept only with a mechanism and a confirmed 16-seed result; the adopted override is recorded as an
   experiment in `evals/experiments.json` and learnings go to `sim-notes.md`.

## Biology features

- Mate choice by genetic similarity, so crossover joins compatible brains.
- Evolvable body traits with costs (size, sensing range, the share of energy given to a child).
- Patchy food and terrain, so several strategies can hold their own regions.
- Learning within a lifetime (a small Hebbian term) to smooth the climb from random to skilled.
- A lower floor once the world sustains itself, so predator and prey numbers can cycle.

## Phases

### Phase 1 - Settle the open balance issues

**Targets:** eval.fed_median_lifespan, eval.food_energy_per_1k, eval.births_per_1k, eval.floor_episodes, eval.lineages_alive

TBD - stub: the user decided B1 to B5 and B11 (Decision column); Phase 1 is planned in full from them with the `create-plan` skill: a per-metric seed minimum in `eval:compare` (B5), then a tuning night at 7680 x 4320 aimed at B1 and B2.

### Phase 2 - Biology features

**Targets:** none - stub: each feature is planned with its own metrics when this phase is written

TBD - stub: written with the `create-plan` skill after Phase 1.

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

### Phase 1 - Settle the open balance issues

| #   | Task                                                                      | Nature      | Depends on |
| --- | ------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | Plan Phase 1 in full with the `create-plan` skill from the user's answers | [judgement] | -          |
| T2  | Conformance review of Phase 1                                             | [judgement] | T1         |

### Phase 2 - Biology features

| #   | Task                                              | Nature      | Depends on |
| --- | ------------------------------------------------- | ----------- | ---------- |
| T3  | Plan Phase 2 in full with the `create-plan` skill | [judgement] | T2         |
| T4  | Conformance review of Phase 2                     | [judgement] | T3         |

## Verification

TBD - stub: written with the phases.
