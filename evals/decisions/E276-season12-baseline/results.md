# E276 - season-12 baseline after step 5 (metric-noise T27)

128 seeds x 200000 ticks, floor on, `map-elites-v6`, the step 5 defaults (`rulesHash` `4110c4d043dd1658`), 24 workers, 2924 s:
`evals/power/defaults-floor-on-E276.json`. Power over all 430 metrics at 16, 32 and 64 seeds with `--include-watch`:
`evals/power/power-E276.json`, and with its source hash and batches `evals/power/metric-noise-E276.json`. Two of the four
disjoint batches were compared with the combined run: 648 rows, none differ.

## Gate 2 (metric-noise.md Phase 6)

| Condition                                     | Reading                                                                                                                                                 | Met                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| (a) a fresh 128-seed baseline under season 12 | this run; `baseline:status` reads current                                                                                                               | yes                         |
| (b) a defender metric live at the defaults    | `eval.defender_repel_per_1k` above 0 on 127 of 128 seeds (mean 0.081; 0 on all of E254), `eval.defender_bite_break_share` on 123 (mean 0.096, verified) | yes                         |
| scout (not a gate condition)                  | `eval.alarm_lift` non-null on 2 seeds, `eval.alarm_response` on 1, `eval.scout_alarm_lead_share` on 0                                                   | no: waits on alarm-calls.md |

## Role metrics, E276 against E254

| Role       | Metric                               | E276 mean | Seeds above 0 | E254 mean |
| ---------- | ------------------------------------ | --------- | ------------- | --------- |
| predator   | `eval.chase_catch_share`             | 0.251     | 128           | 0.266     |
| predator   | `eval.hunter_catches_per_1k_settled` | 1.416     | 128           | 1.385     |
| forager    | `eval.deliberate_food_share`         | 0.364     | 128           | 0.374     |
| reproducer | `eval.child_survival`                | 0.905     | 128           | 0.889     |
| herd       | `eval.herd_dodge_share`              | 0.899     | 128           | 0.974     |
| defender   | `eval.defender_repel_per_1k`         | 0.081     | 127           | 0         |
| all        | `eval.cold_stress_share`             | 0.019     | 128           | 0.120     |

## Status changes

215 of 430 metrics verified (179 before), 212 unverified, 3 deprecated. Became verified (41): `eval.chase_failed_energy`,
`eval.hunter_first_kill_age`, `eval.hunter_juvenile_death_share_settled`, `eval.hunter_kill_conversion_by_age.1k-2k`,
`eval.hunter_kill_rate_by_source.spec-flip`, `eval.hunter_median_lifespan`, `eval.hunter_starve_age_median`,
`eval.pursuit_kill_share_settled`, `eval.recruit_first_kill_share`, `eval.alarm_calls_with_threat_per_1k`,
`eval.chase_overshoot_share`, `eval.chase_reacquire_share`, `eval.defender_bite_break_share`,
`eval.food_species_share.flower`, `eval.freeze_under_threat`, `eval.herd_carcass_meal_share`, `eval.refuge_episode_entry`,
`eval.refuge_prey_use_under_threat`, `eval.refuge_use_under_threat`, `eval.sprint_share.hunter`, `eval.sprint_share.prey`,
`eval.basin_family_effective.west`, `eval.effect_share.alert`, `eval.effect_share.chilled`, `eval.effect_share.hoarse`,
`eval.effect_share.staggered`, `eval.knockout_unit_share`, `eval.knockout_unit_share.hunter`,
`eval.reward_events_per_1k.bite`, `eval.birth_source_share.split`, `eval.gene_spread.childShare`, `eval.gene_spread.size`,
`eval.gene_spread.vision`, `eval.winter_pop_ratio`, and through a new `expectedFlat` reason `eval.effect_share.answered`,
`eval.effect_share.huddled`, `eval.effect_share.panicked`, `eval.effect_share.rallied`, `eval.effect_share.shaken`,
`eval.effect_share.wounded` and `eval.gene_edge_share`. Lost it (5): `eval.bite_wish_with_prey_in_jaws`,
`eval.hunter_conversion_matched.under1k`, `eval.sprint_cost_share`,
`eval.edge_ref_split_births_per_prey`, `eval.hunter_birth_source_share.spec-flip`.

Finding: `eval.alarm_calls_with_threat_per_1k`, `eval.effect_share.alert` and `eval.effect_share.hoarse` are nonzero on
1 seed of 128 and still meet the liveness bar (2 distinct values). The two `knockout_unit_share` metrics are 0 on every
seed and are verified through `expectedFlat`. metric-noise T28 sets a minimum nonzero share.

## Flat reasons added

40 metrics missed the liveness bar with no reason. Each now has an `expectedFlat` reason: the `wounded`, `panicked`, `shaken`,
`answered` and `huddled` effect shares and `eval.huddle_cold_gain` (their strength key is 0 at the defaults);
`eval.effect_share.rallied`, `eval.rally_bite_share` and `eval.hoarse_call_share` (no alarm or hunt call fires); the
`eval.gene_spread.<trait>` and `eval.gene_sd.<trait>` entries of the 14 new body traits (body-genes T18b keeps their spans
at 0); `eval.gene_edge_share` (no body reaches 90% of a span); `eval.hunter_death_share.other` (no hunter dies of old
age or poison); `eval.hunter_conversion_matched.over2k` (null on 11% of seeds, too few old hunters). `eval.lineages_alive`
and `eval.qd_score` now need 64 seeds (32 on E254).
