# Principles

The goal of Blob Evolution is a world that is interesting to watch. Every design doc, tuning change and done
criterion is judged against the principles below (user, 2026-10-29). A scorecard that passes while the world on
screen breaks one of them is a wrong scorecard: fix the scorecard, then the world.

Each principle names the metrics that stand for it, so "it looks better" stays a measurement. The current values
are the E63 screen (current defaults, 16 seeds x 200000 ticks) and E42 (the same defaults, 16 seeds x 600000 ticks),
both recorded in [sim-notes.md](designs/sim-notes.md) on 2026-10-29. A metric marked "none yet" has no measurement
and is a gap to plan.

## What the world must not look like

| #   | Failure                                  | Metrics                                                                                  | Now (E63 / E42)                                                                                                        |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| N1  | Agents spinning on the spot              | `eval.circling_share`, `eval.output_saturation`                                          | 25-65% circling at 200k ticks (diagnosis, 4 seeds); the metrics are new in T48h                                        |
| N2  | Every agent the same type                | `eval.spec_dominance`, `eval.spec_effective`                                             | 0.74 / 0.85 dominance; 2.19 / 1.66 effective types. The live app showed 97% scouts                                     |
| N3  | Agents that never travel across the map  | `eval.migration_index`; a ground-covered measure (none yet)                              | 0.066 / 0.079                                                                                                          |
| N4  | No hunting                               | `eval.predator_presence`, `eval.predator_births`, `eval.pursuit_kill_share`              | presence 1.0 / 1.0; births 70 / 1101 per seed (one seed carries most); pursuit kills 0.075 / 0.22                      |
| N5  | No evolution: bad agents living too long | `eval.skill_trend`, `eval.lineage_turnover`, `eval.energy_over_split`, `eval.alarm_rate` | skill trend +0.003 / +0.036; turnover 4.5 / 1.7; agents hold 3-8x the split threshold; alarms are free and meaningless |

## What the world should look like

| #   | Goal                                                                      | Metrics                                                                                                | Now (E63 / E42)                                                              |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| G1  | Many different gene pools: small families fighting to survive             | `eval.lineages_alive`, `eval.lineage_dominance`, `eval.lineage_turnover`, `eval.spec_effective`        | 20 / 20 lineages; dominance 0.39 / 0.65 (one family takes over in long runs) |
| G2  | Families and groups working together                                      | `eval.kin_within_call_radius`, `eval.alarm_response`, `eval.hunt_call_answer`                          | kin nearby 1.6 / 2.1; alarm response about 0; hunt-call answer 0.015 / 0.025 |
| G3  | Hunting in packs                                                          | `eval.pack_kill_share`                                                                                 | 0.030 / 0.059                                                                |
| G4  | Natural-world behaviour: foraging trips, fleeing, seasonal movement, rest | `eval.escape_rate`, `eval.deliberate_food_share`, `eval.migration_index`; seasonal movement (none yet) | escape 0.81 / 0.87; deliberate food 0.17 / 0.17                              |

## How the principles are used

- A plan's done criteria cite the principles its phase serves. A phase does not close while it leaves an N failure
  worse, or while an N failure it set out to fix is still visible in the app.
- Natural selection does the work. The world punishes waste hard enough that a failing behaviour dies out rather
  than living on stored energy; rewards are added only for behaviour that selection cannot find on its own.
- The app is checked by eye as well as by metrics: a phase that changes behaviour ends with a clip of the default
  world (`Shift+P`) for the user.
- A gap marked "none yet" is planned as a metric before a change claims to fix it.
