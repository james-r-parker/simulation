# Unverified metrics triage (2026-11-19)

Source report: `evals/power/defaults-floor-on-E210.json` (128 seeds x 200000 ticks, `rulesHash` `38be2908ad820c86`).

Total unverified: **163** (out of 370 registered metrics; 204 verified, 3 deprecated).

## Summary by reason

| Reason                         | Count |
| ------------------------------ | ----- |
| null share over 0.1            | 26    |
| under 2 distinct values        | 3     |
| false-positive rate over 0.1   | 19    |
| detectable change over the bar | 115   |

## Deprecation candidates

Metrics with null share over 0.1 or under 2 distinct values on the 128-seed defaults (listed only; no metric code changed):

| Metric                                               | Reason                  | Null share | Distinct | `expectedFlat`                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.alarm_hearers_per_call`                        | null share over 0.1     | 90.6%      | 11       | Null unless a lineage evolves alarm calls, which happened on 5 of 128 seeds with floor on and off; it moves with alarm calling.                                                                                     |
| `eval.alarm_hunter_hearers_per_call`                 | null share over 0.1     | 90.6%      | 4        | Null unless a lineage evolves alarm calls, which happened on 5 of 128 seeds with floor on and off; it moves with alarm calling.                                                                                     |
| `eval.alarm_lift`                                    | null share over 0.1     | 90.6%      | 10       | Null unless a lineage evolves alarm calls, which happened on 5 of 128 seeds with floor on and off; it moves with alarm calling.                                                                                     |
| `eval.alarm_response`                                | null share over 0.1     | 91.4%      | 11       | Null unless a lineage evolves alarm calls, which happened on 5 of 128 seeds with floor on and off; it moves with alarm calling.                                                                                     |
| `eval.basin_cluster_divergence`                      | null share over 0.1     | 33.6%      | 84       | Null when a basin holds under BASIN_MIN_ALIVE agents in the last quarter (39 of 128 seeds floor on, 64 floor off); it reads on worlds where both basins stay populated.                                             |
| `eval.basin_divergence`                              | null share over 0.1     | 33.6%      | 85       | Null when a basin holds under BASIN_MIN_ALIVE agents in the last quarter (39 of 128 seeds floor on, 64 floor off); it reads on worlds where both basins stay populated.                                             |
| `eval.basin_spec_divergence`                         | null share over 0.1     | 33.6%      | 85       | Null when a basin holds under BASIN_MIN_ALIVE agents in the last quarter (39 of 128 seeds floor on, 64 floor off); it reads on worlds where both basins stay populated.                                             |
| `eval.defender_repel_per_1k`                         | under 2 distinct values | 0.0%       | 1        | zero on defaults until prey-guilds Phase 2 adds active defender repel                                                                                                                                               |
| `eval.evasion_trend`                                 | null share over 0.1     | 42.2%      | 74       | Null when fewer than 4 compared windows have an escaped bite episode, as where hunters die out (43 of 128 seeds floor on, 66 floor off); it reads where hunters persist.                                            |
| `eval.flora_patch_death_rate`                        | under 2 distinct values | 0.0%       | 1        | Constant 0, the intended value: no patch stays below its floor for patchDieTicks (36000) on the defaults, so no PatchDied is emitted on any of 128 floor-on seeds x 200000 ticks (E188).                            |
| `eval.herd_recolonisations`                          | under 2 distinct values | 0.0%       | 1        | Reads 0 on every seed: no basin lost its herd and regained it at a 1000-tick checkpoint after burn-in; it moves when a basin's herd dies out and returns.                                                           |
| `eval.hunt_call_answer`                              | null share over 0.1     | 100.0%     | 0        | Null unless hunters evolve hunt calls (PackCalled), which happened on 8 of 128 seeds with floor on and off; it moves with pack calling.                                                                             |
| `eval.hunt_call_lift`                                | null share over 0.1     | 100.0%     | 0        | Null unless hunters evolve hunt calls (PackCalled), which happened on 8 of 128 seeds with floor on and off; it moves with pack calling.                                                                             |
| `eval.hunter_kill_rate_by_age.adult`                 | null share over 0.1     | 21.9%      | 54       | Null unless a hunter lives past 4 x juvenileTicks, which happened on 100 of 128 floor-on seeds (E188); hunters turn over quickly on the defaults (median lifespan near 1000 ticks); it moves with hunter longevity. |
| `eval.hunter_kill_rate_by_source.floor`              | null share over 0.1     | 79.7%      | 13       | Needs floor-spawned hunters: null on every seed with floor off, and on the 68 of 128 floor-on seeds where the floor spawned no hunter.                                                                              |
| `eval.hunter_kill_rate_by_source.mate-hunter-parent` | null share over 0.1     | 21.9%      | 59       | Null unless a hunter is born by mating to a hunter mother, which happened on 100 of 128 floor-on seeds (E188); it moves with hunter-to-hunter mating.                                                               |
| `eval.kin_within_call_radius`                        | null share over 0.1     | 90.6%      | 10       | Null unless a lineage evolves alarm calls, which happened on 5 of 128 seeds with floor on and off; it moves with alarm calling.                                                                                     |
| `eval.leak_flee_corr`                                | null share over 0.1     | 14.8%      | 109      | Null unless 100 lives with a flee skill have varied leak rates, which happened on 109 of 128 floor-on seeds (E188); it moves with leak variation among escaped bites.                                               |
| `eval.leak_hunt_corr`                                | null share over 0.1     | 15.6%      | 108      | Null with fewer than 100 hunter lives with a kill, as on 29 of 128 floor-on seeds where few hunters kill; it reads where hunters kill often.                                                                        |
| `eval.lineage_lifespan_p50`                          | null share over 0.1     | 79.7%      | 26       | Needs a lineage founded after burn-in, and after burn-in only floor spawns found one: null on every seed with floor off and on 67 of 128 with floor on.                                                             |
| `eval.pack_lift`                                     | null share over 0.1     | 12.5%      | 111      | Null unless hunters make 30 kills with a hunter as the previous biter, which happened on 112 of 128 floor-on seeds (E188); it moves with pack hunting.                                                              |
| `eval.pred_prey_lag_corr`                            | null share over 0.1     | 25.8%      | 95       | Null with fewer than 5 usable span pairs of catch rate and next evasion skill, as where hunters die out (33 of 128 seeds floor on, 58 floor off); it reads where hunters persist.                                   |
| `eval.predator_end_local_share`                      | null share over 0.1     | 41.4%      | 2        | Null when no hunter is alive at the last tick (33 of 128 seeds floor on, 62 floor off); it reads where hunters persist.                                                                                             |
| `eval.pursuit_trend`                                 | null share over 0.1     | 36.7%      | 81       | Null when fewer than 4 compared windows have a hunter kill, as where hunters die out (45 of 128 seeds floor on, 68 floor off); it reads where hunters persist.                                                      |
| `eval.recruit_replaced_share.floor`                  | null share over 0.1     | 80.5%      | 4        | Null unless a floor-born hunter matures in the cohort, which happened on 25 of 128 floor-on seeds (E188); it moves with floor births, which the hunter population seldom needs.                                     |
| `eval.recruit_replaced_share.mate-hunter-parent`     | null share over 0.1     | 34.4%      | 16       | Null unless a hunter born by mating to a hunter mother matures in the cohort, which happened on 84 of 128 floor-on seeds (E188); it moves with hunter-to-hunter mating.                                             |
| `eval.scout_alarm_lead_share`                        | null share over 0.1     | 99.2%      | 1        | Null unless a scout calls an alarm with a threat seen, which happened on 1 of 128 floor-on seeds (E188; calls with a threat by any caller on 3); it moves with alarm calling.                                       |
| `eval.smoke_escapes`                                 | null share over 0.1     | 100.0%     | 0        | Null unless a bitten agent releases smoke, which happened on 1 of 128 seeds with floor on and off; it moves with smoke use.                                                                                         |
| `eval.smoke_precision`                               | null share over 0.1     | 100.0%     | 0        | Null unless an agent releases smoke, which happened on 7 of 128 seeds with floor on and off; it moves with smoke use.                                                                                               |

## All unverified metrics

| Metric                                               | Reason                         | Seeds needed                                                           | Notes                             |
| ---------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| `eval.alarm_calls_with_threat_per_1k`                | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.alarm_hearers_per_call`                        | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.alarm_hunter_hearers_per_call`                 | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.alarm_lift`                                    | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.alarm_rate`                                    | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.alarm_response`                                | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.archive_lineage_share`                         | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.basin_cluster_divergence`                      | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.basin_divergence`                              | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.basin_families`                                | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.basin_families.east`                           | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.basin_families.west`                           | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.basin_family_effective`                        | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | expectedFlat                      |
| `eval.basin_family_effective.east`                   | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.basin_family_effective.west`                   | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.basin_lineage_effective`                       | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | -                                 |
| `eval.basin_lineage_effective.east`                  | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.basin_lineage_effective.west`                  | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.basin_lineages_alive`                          | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | -                                 |
| `eval.basin_lineages_alive.east`                     | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.basin_lineages_alive.west`                     | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.basin_pop_cv`                                  | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.basin_recolonisations`                         | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.basin_spec_divergence`                         | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.birth_source_share.mate`                       | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | no tests.arithmetic               |
| `eval.birth_source_share.split`                      | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.bite_idle`                                     | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.bite_off_kin_view`                             | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.bite_off_other_view`                           | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.bite_wish_with_kin_in_jaws`                    | detectable change over the bar | ~576 (mde64=0.15, bar=0.05)                                            | -                                 |
| `eval.boom_bust_count`                               | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.call_opportunity_kin`                          | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.call_opportunity_neighbours`                   | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.cap_share`                                     | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.carcass_hunter_share`                          | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.carcass_loss_share.eaten`                      | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.carcass_loss_share.faded`                      | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.carcass_lost_per_1k`                           | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.carcass_meal_share`                            | false-positive rate over 0.1   | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.chase_failed_energy`                           | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | -                                 |
| `eval.chase_net_energy`                              | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.chase_sprint_lift`                             | false-positive rate over 0.1   | ~450 (mde32=0.75, bar=0.2)                                             | -                                 |
| `eval.childshare_by_condition`                       | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.defender_repel_per_1k`                         | under 2 distinct values        | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.deliberate_food_trend`                         | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.density_intake_slope`                          | detectable change over the bar | ~6400 (mde64=1, bar=0.1)                                               | -                                 |
| `eval.density_starve_slope`                          | detectable change over the bar | ~3600 (mde64=0.75, bar=0.1)                                            | -                                 |
| `eval.disease_frequency_slope`                       | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.edge_eaten_per_prey`                           | false-positive rate over 0.1   | ~72 (mde32=0.3, bar=0.2)                                               | expectedFlat                      |
| `eval.edge_mate_births_per_prey`                     | detectable change over the bar | ~18 (mde32=0.15, bar=0.2)                                              | expectedFlat                      |
| `eval.edge_ref_eaten_per_prey`                       | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.edge_split_births_per_prey`                    | detectable change over the bar | ~18 (mde32=0.15, bar=0.2)                                              | expectedFlat                      |
| `eval.edge_split_blocked_share.seen`                 | detectable change over the bar | ~6 (mde32=0.02, bar=0.05)                                              | expectedFlat                      |
| `eval.evasion_trend`                                 | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.flee_sprint_lift`                              | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | -                                 |
| `eval.floor_episodes`                                | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.flora_patch_death_rate`                        | under 2 distinct values        | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.flora_patch_pool_full_share`                   | detectable change over the bar | ~1024 (mde64=0.2, bar=0.05)                                            | -                                 |
| `eval.food_contact_bite_share`                       | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.food_species_share.flower`                     | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.freeze_survival_gain`                          | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.freeze_under_threat`                           | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.gap_crossers`                                  | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.gap_never_share`                               | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.graze_time_share`                              | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.guild_share.defender`                          | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.guild_share.forager`                           | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.guild_share.reproducer`                        | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.guild_share.scout`                             | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.herd_carcass_meal_share`                       | false-positive rate over 0.1   | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.herd_follow_share`                             | false-positive rate over 0.1   | >64 (fpr16=0.20195439739413681, fpr32=0.1276595744680851, fpr64=null)  | -                                 |
| `eval.herd_gap_crossings`                            | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.herd_recolonisations`                          | under 2 distinct values        | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.herd_season_shift`                             | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.herd_stampede_rate`                            | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.hunt_call_answer`                              | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.hunt_call_lift`                                | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.hunter_birth_source_share.initial`             | detectable change over the bar | ~64 (mde64=0.05, bar=0.05)                                             | no tests.arithmetic               |
| `eval.hunter_birth_source_share.split-hunter-parent` | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.hunter_chases_by_age.1k-2k`                    | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_chases_by_age.over2k`                   | detectable change over the bar | ~450 (mde32=0.75, bar=0.2)                                             | -                                 |
| `eval.hunter_chases_by_age.under1k`                  | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_conversion_by_dose`                     | false-positive rate over 0.1   | >64 (fpr16=0.21768707482993196, fpr32=0.25, fpr64=null)                | -                                 |
| `eval.hunter_conversion_gain_hunters`                | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.hunter_conversion_matched.1k-2k`               | detectable change over the bar | ~72 (mde32=0.075, bar=0.05)                                            | -                                 |
| `eval.hunter_first_kill_age`                         | false-positive rate over 0.1   | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_first_kill_km_median`                   | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_global_extinctions`                     | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.hunter_kill_conversion_by_age.over2k`          | false-positive rate over 0.1   | ~72 (mde32=0.075, bar=0.05)                                            | -                                 |
| `eval.hunter_kill_rate_by_age.adult`                 | null share over 0.1            | N/A (flat/null on defaults)                                            | no tests.arithmetic, expectedFlat |
| `eval.hunter_kill_rate_by_age.young`                 | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_kill_rate_by_source.floor`              | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.hunter_kill_rate_by_source.initial`            | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | no tests.arithmetic               |
| `eval.hunter_kill_rate_by_source.mate-hunter-parent` | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.hunter_kill_rate_by_source.spec-flip`          | detectable change over the bar | ~72 (mde32=0.3, bar=0.2)                                               | -                                 |
| `eval.hunter_kills_per_life_p50`                     | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.hunter_lineage_extinctions`                    | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.hunter_median_lifespan`                        | false-positive rate over 0.1   | ~64 (mde64=0.2, bar=0.2)                                               | -                                 |
| `eval.hunter_recoil_per_life`                        | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.hunter_reflex_column_same_kill_rate`           | detectable change over the bar | ~200 (mde32=0.5, bar=0.2)                                              | -                                 |
| `eval.hunter_reflex_column_split_kill_rate`          | detectable change over the bar | ~450 (mde32=0.75, bar=0.2)                                             | -                                 |
| `eval.hunter_reflex_column_split_share`              | detectable change over the bar | ~288 (mde32=0.15, bar=0.05)                                            | -                                 |
| `eval.hunter_starve_age_median`                      | false-positive rate over 0.1   | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.hunter_territory_blocked_share`                | detectable change over the bar | ~128 (mde32=0.1, bar=0.05)                                             | expectedFlat                      |
| `eval.hunter_ticks_last_quarter`                     | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.idle_signals_per_1k`                           | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.juvenile_sibling_distance`                     | detectable change over the bar | ~18 (mde32=0.15, bar=0.2)                                              | -                                 |
| `eval.kin_nearby_threat_gain`                        | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.kin_within_call_radius`                        | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.leak_flee_corr`                                | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.leak_forage_corr`                              | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.leak_hunt_corr`                                | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.lineage_dominance`                             | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.lineage_effective`                             | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.lineage_lifespan_p50`                          | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.lineage_persistence`                           | detectable change over the bar | ~576 (mde64=0.15, bar=0.05)                                            | -                                 |
| `eval.lineage_turnover`                              | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.mate_rank_gap`                                 | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.mating_share`                                  | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.mother_wait_by_condition`                      | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.pack_convergence`                              | detectable change over the bar | ~72 (mde32=0.075, bar=0.05)                                            | -                                 |
| `eval.pack_lift`                                     | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.pollination_rate`                              | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.population_mean`                               | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.pred_prey_lag_corr`                            | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.predation_per_1k`                              | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.predator_births`                               | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.predator_end_local_share`                      | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.predator_presence`                             | detectable change over the bar | ~576 (mde64=0.15, bar=0.05)                                            | -                                 |
| `eval.predator_share_cv`                             | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.predators_at_end`                              | detectable change over the bar | ~900 (mde64=0.75, bar=0.2)                                             | -                                 |
| `eval.prey_extinctions`                              | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.prey_selectivity.defender`                     | false-positive rate over 0.1   | ~450 (mde32=0.75, bar=0.2)                                             | -                                 |
| `eval.prey_selectivity.forager`                      | false-positive rate over 0.1   | ~450 (mde32=0.75, bar=0.2)                                             | -                                 |
| `eval.prey_selectivity.reproducer`                   | false-positive rate over 0.1   | ~800 (mde32=1, bar=0.2)                                                | -                                 |
| `eval.prey_selectivity.scout`                        | false-positive rate over 0.1   | >64 (fpr16=0.15930388219544847, fpr32=0.20961538461538462, fpr64=null) | -                                 |
| `eval.prey_summer_min`                               | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.pursuit_trend`                                 | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.rare_input_saturation_jump`                    | false-positive rate over 0.1   | >64 (fpr16=0.18714555765595464, fpr32=0.14957264957264957, fpr64=null) | -                                 |
| `eval.recruit_cohort`                                | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.recruit_first_kill_share`                      | false-positive rate over 0.1   | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.recruit_matured_hunters`                       | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.recruit_replaced_share.floor`                  | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.recruit_replaced_share.mate-hunter-parent`     | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.recruit_replaced_share.spec-flip`              | detectable change over the bar | ~288 (mde32=0.15, bar=0.05)                                            | -                                 |
| `eval.recruit_replaced_share.split-hunter-parent`    | detectable change over the bar | ~128 (mde32=0.1, bar=0.05)                                             | -                                 |
| `eval.refuge_bite_deficit`                           | false-positive rate over 0.1   | >64 (fpr16=0.12618724559023067, fpr32=0.13043478260869565, fpr64=null) | -                                 |
| `eval.refuge_exit_fed`                               | detectable change over the bar | ~128 (mde32=0.1, bar=0.05)                                             | -                                 |
| `eval.reproducer_recovery_rate`                      | detectable change over the bar | ~288 (mde32=0.15, bar=0.05)                                            | -                                 |
| `eval.reward_events_per_1k.bite`                     | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.scout_alarm_lead_share`                        | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.skill_trend`                                   | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.smoke_escapes`                                 | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.smoke_precision`                               | null share over 0.1            | N/A (flat/null on defaults)                                            | expectedFlat                      |
| `eval.social_return`                                 | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
| `eval.spec_dominance`                                | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.sprint_share.hunter`                           | detectable change over the bar | ~256 (mde64=0.1, bar=0.05)                                             | -                                 |
| `eval.sprint_share.prey`                             | detectable change over the bar | ~144 (mde64=0.075, bar=0.05)                                           | -                                 |
| `eval.strike_miss_energy_ratio`                      | false-positive rate over 0.1   | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.style_separation`                              | detectable change over the bar | ~400 (mde64=0.5, bar=0.2)                                              | -                                 |
| `eval.winter_basin_density`                          | false-positive rate over 0.1   | >64 (fpr16=0.127, fpr32=0.196, fpr64=0.272)                            | -                                 |
| `eval.winter_pop_ratio`                              | detectable change over the bar | ~144 (mde64=0.3, bar=0.2)                                              | -                                 |
| `eval.winter_shelter_distance`                       | detectable change over the bar | >64 (mde > 1.0 at 64 seeds)                                            | -                                 |
