# E264 - role metric liveness and power (metric-noise T23)

Prediction (committed with the results, since the run was not gated on it): the predator, forager, reproducer and herd metrics are live on the defaults; the scout's three are null on most seeds and the defender's shove count reads 0 on every seed at the defaults; with the shove on the defender's metrics read non-zero.

- BASE: `base.json`, commit 837fa6db, live policy, 16 seeds x 200000 ticks, current defaults (season 12 rules).
- SHOVE: `shove.json`, the same seeds with `defenderRepelEnergy` 40 and `defenderRepelImpulse` 4 (`evals/role-metric-shove-config.json`).
- POWER: `evals/power/defaults-floor-on-E254.json` (128 seeds, rulesHash 38be2908ad820c86). **It predates season 12**: `npm run baseline:status` reads STALE. A 16-seed report cannot be split into 16-v-16 arms (`eval:power` needs 32 seeds), so power comes from E254 only, for the metrics that existed then. `eval.defender_bite_break_share` and `eval.hunter_defender_bite_ratio` are not in it.
- Command: `node scripts/role-metric-table.mjs base.json shove.json defaults-floor-on-E254.json e254-power.json (`npm run eval:power -- evals/power/defaults-floor-on-E254.json --include-watch --sizes 16,32,64 --metrics <the role metrics> --json`)`. Seeds is the fewest of 16, 32 and 64 at which the false-positive rate is at most 0.10 and the detectable change is within the bar for the unit (`minSeedsFromPower`).

Liveness is nulls / seeds, distinct values and mean. MDE is the detectable change at 16 / 32 / 64 seeds per arm (`a` absolute, otherwise relative).

| Role       | Metric                               | Base 16                                | Shove 16                               | E254 128                                | MDE 16/32/64 (a = absolute) | Seeds        |
| ---------- | ------------------------------------ | -------------------------------------- | -------------------------------------- | --------------------------------------- | --------------------------- | ------------ |
| predator   | `eval.chase_catch_share`             | 0/16 null, 16 distinct, mean 0.245     | 0/16 null, 16 distinct, mean 0.25      | 1/128 null, 127 distinct, mean 0.266    | 0.05a / 0.05a / -a          | 16           |
| predator   | `eval.pursuit_kill_share`            | 0/16 null, 16 distinct, mean 0.673     | 0/16 null, 16 distinct, mean 0.708     | 0/128 null, 127 distinct, mean 0.685    | 0.1a / 0.075a / 0.05a       | 64           |
| predator   | `eval.hunter_catches_per_1k_settled` | 0/16 null, 16 distinct, mean 1.44      | 0/16 null, 16 distinct, mean 1.54      | 0/128 null, 128 distinct, mean 1.38     | 0.5 / 0.3 / 0.2             | 64           |
| predator   | `eval.hunter_kills_per_life_mean`    | 0/16 null, 16 distinct, mean 1.37      | 0/16 null, 16 distinct, mean 1.55      | 0/128 null, 128 distinct, mean 1.39     | 0.3 / 0.2 / 0.15            | 32           |
| predator   | `eval.bite_idle`                     | 0/16 null, 16 distinct, mean 0.626     | 0/16 null, 16 distinct, mean 0.629     | 0/128 null, 128 distinct, mean 0.61     | 0.2a / 0.15a / 0.1a         | more than 64 |
| predator   | `eval.hunter_juvenile_death_share`   | 0/16 null, 16 distinct, mean 0.845     | 0/16 null, 16 distinct, mean 0.858     | 0/128 null, 128 distinct, mean 0.856    | 0.15a / 0.05a / 0.05a       | 32           |
| forager    | `eval.deliberate_food_share`         | 0/16 null, 16 distinct, mean 0.402     | 0/16 null, 16 distinct, mean 0.397     | 0/128 null, 128 distinct, mean 0.374    | 0.075a / 0.05a / 0.03a      | 32           |
| forager    | `eval.food_energy_per_1k`            | 0/16 null, 16 distinct, mean 405       | 0/16 null, 16 distinct, mean 431       | 0/128 null, 128 distinct, mean 422      | 0.3 / 0.15 / 0.1            | 32           |
| forager    | `eval.births_per_1k`                 | 0/16 null, 16 distinct, mean 0.188     | 0/16 null, 16 distinct, mean 0.208     | 0/128 null, 128 distinct, mean 0.209    | 0.3 / 0.15 / 0.1            | 32           |
| forager    | `eval.chase_escape_share`            | 0/16 null, 16 distinct, mean 0.356     | 0/16 null, 16 distinct, mean 0.374     | 1/128 null, 127 distinct, mean 0.336    | 0.075a / 0.05a / -a         | 32           |
| reproducer | `eval.child_survival`                | 0/16 null, 16 distinct, mean 0.9       | 0/16 null, 16 distinct, mean 0.886     | 0/128 null, 128 distinct, mean 0.889    | 0.05a / 0.03a / 0.03a       | 16           |
| reproducer | `eval.offspring_per_life`            | 0/16 null, 16 distinct, mean 1.42      | 0/16 null, 16 distinct, mean 1.4       | 0/128 null, 128 distinct, mean 1.39     | 0.1 / 0.1 / 0.1             | 16           |
| reproducer | `eval.childshare_by_condition`       | 0/16 null, 16 distinct, mean -0.000233 | 0/16 null, 16 distinct, mean -0.000168 | 0/128 null, 128 distinct, mean 0.000291 | - / - / -                   | more than 64 |
| scout      | `eval.alarm_lift`                    | 15/16 null, 1 distinct, mean 0         | 16/16 null, 0 distinct, mean -         | 116/128 null, 10 distinct, mean 0.107   | - / - / -                   | more than 64 |
| scout      | `eval.alarm_response`                | 16/16 null, 0 distinct, mean -         | 16/16 null, 0 distinct, mean -         | 117/128 null, 11 distinct, mean -0.0417 | - / - / -                   | more than 64 |
| scout      | `eval.scout_alarm_lead_share`        | 16/16 null, 0 distinct, mean -         | 16/16 null, 0 distinct, mean -         | 127/128 null, 1 distinct, mean 0        | -a / -a / -a                | more than 64 |
| defender   | `eval.defender_repel_per_1k`         | 0/16 null, 1 distinct, mean 0          | 0/16 null, 16 distinct, mean 0.0705    | 0/128 null, 1 distinct, mean 0          | - / - / -                   | more than 64 |
| defender   | `eval.defender_bite_break_share`     | 0/16 null, 1 distinct, mean 0          | 0/16 null, 16 distinct, mean 0.129     | absent                                  | not in E254                 | -            |
| defender   | `eval.hunter_defender_bite_ratio`    | 1/16 null, 15 distinct, mean 1.35      | 1/16 null, 15 distinct, mean 1.5       | absent                                  | not in E254                 | -            |
| herd       | `eval.herd_dodge_share`              | 0/16 null, 16 distinct, mean 0.885     | 0/16 null, 16 distinct, mean 0.897     | 1/128 null, 127 distinct, mean 0.974    | 0.05a / -a / -a             | 16           |
| herd       | `eval.trampled_share`                | 0/16 null, 16 distinct, mean 0.0505    | 0/16 null, 16 distinct, mean 0.0503    | 0/128 null, 128 distinct, mean 0.0381   | 0.03a / 0.03a / 0.03a       | 16           |
| herd       | `eval.herd_stampede_rate`            | 0/16 null, 16 distinct, mean 30        | 0/16 null, 15 distinct, mean 29        | 0/128 null, 125 distinct, mean 38.9     | 1 / 0.75 / 0.5              | more than 64 |

## Per role: the metric a training decision rests on

| Role       | Decision metric              | Liveness (16 seeds, defaults)                                               | Seeds | Why, or what is missing                                                                                                                                              |
| ---------- | ---------------------------- | --------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| predator   | `eval.chase_catch_share`     | 0/16 null, 16 distinct, mean 0.245                                          | 16    | Share, MDE 0.05 absolute at 16 and 32. The keep-rule guard `eval.hunter_catches_per_1k_settled` needs 64; `eval.bite_idle` never reaches the bar                     |
| forager    | `eval.deliberate_food_share` | 0/16 null, 16 distinct, mean 0.402                                          | 32    | `eval.births_per_1k` and `eval.food_energy_per_1k` also need 32; `eval.chase_escape_share` 32 with 1 null seed in E254                                               |
| reproducer | `eval.child_survival`        | 0/16 null, 16 distinct, mean 0.9                                            | 16    | `eval.offspring_per_life` also 16; `eval.childshare_by_condition` is live but centred on 0 and has no usable MDE                                                     |
| scout      | none yet                     | alarm_lift 15/16 null; alarm_response and scout_alarm_lead_share 16/16 null | -     | Null on nearly every seed (E254: 116, 117 and 127 of 128 null): no alarm events at the defaults, so nothing to power                                                 |
| defender   | none yet                     | repel_per_1k 0 on all 16 seeds; with the shove 0.07, 16 distinct            | -     | Dead at the defaults, live with the shove on, but no 128-seed shove baseline exists to power it; bite_break_share (0, then 0.129) and the bite ratio are not in E254 |
| herd       | `eval.trampled_share`        | 0/16 null, 16 distinct, mean 0.0505                                         | 16    | MDE 0.03 absolute at every size. `eval.herd_dodge_share` meets 16 but E254 read 0.974 against 0.885 now; `eval.herd_stampede_rate` needs more than 64                |

Caveat: the E254 power reading predates season 12. A decision on a metric whose mean moved since (`eval.herd_dodge_share`, `eval.trampled_share`, the defender's) needs a fresh 128-seed baseline first.
