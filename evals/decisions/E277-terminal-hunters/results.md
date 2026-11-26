# E277 - the terminal hunter count on 600000-tick runs (metric-noise T4)

128 seeds x 600000 ticks per floor setting, `map-elites-v6`, the season 12 defaults (`rulesHash` `4110c4d043dd1658`):
`evals/power/long-floor-on-E277.json` and `evals/power/long-floor-off-E277.json` (`--config evals/floor-off-config.json`),
both on the batch 1 code. Power read with `eval:power --include-watch --sizes 16,32,64` on the batch 3 code, so with the
studentised interval at every size (metric-noise D8).

## The prediction

Held. `eval.predators_at_end_terminal_window` fails the 0.20 detectable-change bar at 64 seeds on both floor settings,
and is live on both.

| Floor | Metric                                  | Seeds at 0 | Median | False positives 16 / 32 / 64 | Detectable change 16 / 32 / 64 |
| ----- | --------------------------------------- | ---------- | ------ | ---------------------------- | ------------------------------ |
| On    | `eval.predators_at_end_terminal_window` | 4          | 2.8    | 0.093 / 0.058 / 0.062        | none / 1.0 / 0.75              |
| On    | `eval.predators_at_end`                 | 57         | 1      | 0.100 / 0.068 / 0.069        | none / none / 1.0              |
| Off   | `eval.predators_at_end_terminal_window` | 18         | 1.75   | 0.067 / 0.048 / 0.059        | none / 1.0 / 0.75              |
| Off   | `eval.predators_at_end`                 | 67         | 0      | 0.088 / 0.070 / 0.066        | none / none / 1.0              |

At 200000 ticks (E210, E276) the candidate read 0.75 at 64 too. The terminal-window mean runs from 0 to 48 hunters
between worlds on floor on (0 to 36 on floor off): the noise is between worlds, which a longer run does not shrink.

## What follows

The candidate stays unverified and Phase 3 has no replacement to migrate to for `eval.predators_at_end`. A multi-season
mean would average more checkpoints of the same world and meet the same between-world spread, so it is not run.
