### 2026-11-10 - Metric liveness triage (metric-trust T24, E148)

`npm run metric:liveness` on `evals/power/defaults-floor-on.json` and `defaults-floor-off.json` (128 seeds x 200000 ticks):
30 metrics miss the liveness bar with floor on and 44 with floor off, and all 30 floor-on misses also miss with floor off,
so the floor-on readings in `js/evo/metric-registry/liveness.js` hold every metric T24 had to triage. None is deleted:
each is a working detector whose source test plants its answer. The 24 that were not `deprecated` now have an
`expectedFlat` reason; the 6 `deprecated` entries already state theirs. `test/evo/metric-registry/liveness.test.js`
fails any future reading that misses the bar with neither.

| Group                       | Metrics                                                                                                                     | On the defaults                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Rare signals                | `alarm_hearers_per_call`, `alarm_hunter_hearers_per_call`, `alarm_precision`, `alarm_response`, `kin_within_call_radius`    | Alarm calls on 5 of 128 seeds                                                                         |
|                             | `hunt_call_answer`, `hunt_call_precision`                                                                                   | Hunt calls on 8 of 128 seeds                                                                          |
|                             | `smoke_escapes`, `smoke_precision`                                                                                          | Smoke after a bite on 1 seed, any smoke on 7                                                          |
| A basin empties             | `basin_cluster_divergence`, `basin_divergence`, `basin_spec_divergence`, `basin_family_effective`                           | Null on 39 seeds floor on, 64 floor off                                                               |
| Hunters die out             | `evasion_trend`, `pursuit_trend`, `pred_prey_lag_corr`, `predator_end_local_share`                                          | Null on 33 to 45 seeds floor on, 58 to 68 floor off                                                   |
| Needs floor spawns          | `hunter_kill_rate_by_source.floor`, `lineage_lifespan_p50`                                                                  | Null on every floor-off seed; after burn-in only floor spawns found a lineage                         |
| Never reaches the threshold | `weight_clamp_share`, `hebb_drift_clamped_share`, `leak_slow_share`, `leak_at_floor_share`, `herd_recolonisations`          | 0 on every seed: no weight at the clamp, no slow or floored leak gene, no herd lost and regained      |
| Already `deprecated`        | `birth_source_share.immigrant`, `champion_elo`, `champion_win_rate`, `leak_flee_corr`, `leak_forage_corr`, `leak_hunt_corr` | Nothing spawns immigrants; only `runLeague` sets the league pair; `freeAgent` clears the genome first |

The 14 metrics that miss only with floor off (`floor_episodes`, the `birth_source_share.floor` pair, `born_share`,
`archive_lineage_share`, three basin family and lineage counts, three winter reads, `season_map_distance`, `skill_trend`,
`deliberate_food_trend`) are live on the floor-on reference and need no reason.
