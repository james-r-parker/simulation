### 2026-11-10 - Metric renames (metric-trust T25)

T2 to T7 listed 34 names that misstate what they count. A name is renamed when it says something false about the
quantity; when the name is only vague and the registry's `meaning` and `counts` say the rest, it stays.

| Old name                           | New name                             | Why                                                                |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `eval.catch_rate`                  | `eval.hunter_catches_per_1k`         | A speed (eaten deaths with a hunter killer per 1k hunter-ticks)    |
| `eval.hunter_kills_per_life`       | `eval.hunter_kills_per_life_p50`     | A median; the new `eval.hunter_kills_per_life_mean` sits beside it |
| `eval.pack_kill_share`             | `eval.pack_kills_per_eaten_death`    | Divides by all eaten deaths, not by hunter kills                   |
| `eval.escape_rate`                 | `eval.escape_share`                  | A share of resolved bite episodes, not a rate                      |
| `eval.evasion_skill`               | `eval.evasion_response_share`        | The responded share of escaped episodes, not a skill score         |
| `eval.group_cohesion_under_threat` | `eval.kin_nearby_threat_gain`        | Threatened minus calm mean same-lineage neighbours                 |
| `eval.deliberate_food_per_1k`      | `eval.deliberate_food_energy_per_1k` | Counts energy, not items                                           |
| `eval.chance_food_per_1k`          | `eval.chance_food_energy_per_1k`     | Counts energy, not items                                           |
| `eval.alarm_precision`             | `eval.alarm_lift`                    | Calls above the callers' base rate, per call; can be negative      |
| `eval.hunt_call_precision`         | `eval.hunt_call_lift`                | As alarm                                                           |
| `eval.mate_skill_gap`              | `eval.mate_rank_gap`                 | A percentile gap of mate rank, not of skill                        |
| `eval.reward_events.*`             | `eval.reward_events_per_1k.*`        | A rate per 1k hunter-ticks, not a count                            |
| `eval.terrain_death_share`         | `eval.collision_death_share`         | The share of `COLLISION` deaths                                    |

Kept, with what the registry says instead: `hunter_first_kill_age` (survivor bias is in `meaning`),
`hunter_chases_by_age.*` and `hunter_conversion_gain_hunters` (the names already say count), `hunter_kill_conversion_by_age.*`,
`pursuit_kill_share` and `leak_hunt_corr` (kill-rule notes, fixed by T14), `herd_carcass_share.*`, `refuge_use_under_threat`,
`herd_recolonisations`, `prey_extinctions`, `flora_patch_death_rate`, `basin_families` (families are genetic clusters by
definition), `social_return`, `juvenile_parent_pull`, `hidden_persistence`, `leak_rate_mean`, `sigma_mean`,
`mean_energy_share`, `energy_over_split`, `merit_mean`, `migration_index`, `predator_births`, `predator_presence`,
`alarm_rate` and the two `birth_source_share` families.

The mean is not named `eval.hunter_kills_per_life`: an old report holds the median under that name and
`withCurrentNames` maps it to `_p50`, so reusing the name for the mean would pair a median with a mean.
Design docs, `docs/principles.md`, README, grids, configs and tests use the new names; `evals/experiments.json`,
stored reports and earlier sim-notes entries keep the old ones, which `renamedFrom` maps.
