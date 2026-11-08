// Expected outputs from a sourceRun with two after-burn-in starvation deaths and no scene activity.
export default {
    'eval.seasonal_diet_shift': {
        value: null,
        reason: 'fewer than two seasons with plant meals after burn-in',
    },
    'eval.pollination_rate': {
        value: 0,
    },
    'eval.flora_hue_spread': {
        value: null,
        reason: 'no live pollinated species at checkpoints after burn-in',
    },
    'eval.flora_patch_pool_full_share': {
        value: null,
        reason: 'no patch-pool checkpoints after burn-in',
    },
    'eval.flora_patch_death_rate': {
        value: 0,
    },
    'eval.flora_seed_bank_occupancy_share': {
        value: null,
        reason: 'no seed-bank checkpoints after burn-in',
    },
    'eval.toxic_avoidance': {
        value: null,
        reason: 'no plant meals or plant availability checkpoints after burn-in',
    },
    'eval.toxic_death_share': {
        value: 0,
    },
    'eval.sick_share': {
        value: 0,
    },
    'eval.food_species_share.grass': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.food_species_share.berry': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.food_species_share.nut': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.food_species_share.flower': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.food_species_share.fungus': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.food_species_share.toxiccap': {
        value: null,
        reason: 'no plant meals after burn-in',
    },
    'eval.trampled_share': {
        value: 0,
    },
    'eval.dodge_skill': {
        value: null,
        reason: 'no completed herd-approach episodes after burn-in',
    },
    'eval.herd_grazed_share': {
        value: null,
        reason: 'no herd grazing or blob plant meals after burn-in',
    },
    'eval.trample_unavoidable_share': {
        value: null,
        reason: 'no trample deaths after burn-in',
    },
    'eval.herd_stampede_rate': {
        value: 0,
    },
    'eval.herd_animals': {
        value: null,
        reason: 'no herd checkpoints after burn-in',
    },
    'eval.herd_gap_crossings': {
        value: 0,
    },
    'eval.herd_recolonisations': {
        value: null,
        reason: 'no herd checkpoints after burn-in',
    },
    'eval.herd_follow_share': {
        value: null,
        reason: 'no patch had 3 herded and bare checkpoints with blobs present',
    },
    'eval.dung_food_share': {
        value: null,
        reason: 'no plant energy eaten after burn-in',
    },
    'eval.herd_seeded_patches': {
        value: 0,
    },
    'eval.herd_carcass_meal_share': {
        value: null,
        reason: 'no meat eaten after burn-in',
    },
    'eval.carcass_meal_share': {
        value: null,
        reason: 'no meat eaten after burn-in',
    },
    'eval.carcass_hunter_share': {
        value: null,
        reason: 'no carcass eaten after burn-in',
    },
    'eval.herd_carcass_share.forager': {
        value: null,
        reason: 'no meals for forager after burn-in',
    },
    'eval.herd_carcass_share.predator': {
        value: null,
        reason: 'no meals for predator after burn-in',
    },
    'eval.herd_carcass_share.reproducer': {
        value: null,
        reason: 'no meals for reproducer after burn-in',
    },
    'eval.herd_carcass_share.scout': {
        value: null,
        reason: 'no meals for scout after burn-in',
    },
    'eval.herd_carcass_share.defender': {
        value: null,
        reason: 'no meals for defender after burn-in',
    },
    'eval.disease_deaths_share': {
        value: 0,
    },
    'eval.strains_per_100k': {
        value: 0,
    },
    'eval.strain_family_focus': {
        value: null,
        reason: 'no-infections',
    },
    'eval.disease_frequency_slope': {
        value: null,
        reason: 'few-points',
    },
    'eval.winter_basin_density': {
        value: null,
        reason: 'no winter checkpoint and no other checkpoint after burn-in with eras on',
    },
    'eval.winter_shelter_distance': {
        value: null,
        reason: 'no winter and no other checkpoint with an alive agent after burn-in',
    },
    'eval.winter_band_shift': {
        value: null,
        reason: 'no winter and no other checkpoint with an alive agent after burn-in',
    },
    'eval.winter_patch_proximity': {
        value: null,
        reason: 'no winter and no other checkpoint with an alive agent after burn-in',
    },
    'eval.season_map_distance': {
        value: null,
        reason: 'no winter checkpoint and no checkpoint in each summer half with an alive agent after burn-in',
    },
    'eval.herd_season_shift': {
        value: null,
        reason: 'no winter checkpoint and no checkpoint in each summer half with a herd group after burn-in',
    },
    'eval.basin_pop_cv': {
        value: null,
        reason: 'no 1000-tick checkpoint after burn-in',
    },
    'eval.basin_recolonisations': {
        value: 0,
    },
    'eval.predators_at_end': {
        value: 0,
    },
    'eval.prey_types_at_end': {
        value: 0,
    },
    'eval.basin_lineages_alive': {
        value: null,
        reason: 'no basin held 20 agents in the last quarter',
    },
    'eval.basin_lineage_effective': {
        value: null,
        reason: 'no basin held 20 agents in the last quarter',
    },
    'eval.refuge_prey_use_under_threat': {
        value: null,
        reason: 'no threatened and calm prey sample after burn-in',
    },
    'eval.refuge_episode_entry': {
        value: null,
        reason: 'fewer than 20 threatened and calm episodes after burn-in',
    },
    'eval.refuge_dwell_ticks': {
        value: null,
        reason: 'fewer than 20 ring exits after burn-in',
    },
    'eval.refuge_exit_fed': {
        value: null,
        reason: 'fewer than 20 ring exits after burn-in',
    },
    'eval.refuge_crowding': {
        value: null,
        reason: 'no ring held a threatened prey',
    },
    'eval.refuge_eligible_share': {
        value: null,
        reason: 'no prey sample after burn-in',
    },
    'eval.cold_margin_use_under_threat': {
        value: null,
        reason: 'no threatened and calm prey sample after burn-in',
    },
    'eval.refuge_bite_deficit': {
        value: null,
        reason: 'under 100 prey-samples in a ring, or no bite outside one, after burn-in',
    },
    'eval.refuge_use_under_threat': {
        value: null,
        reason: 'no threatened and unthreatened sample after burn-in',
    },
    'eval.gap_crossers': {
        value: null,
        reason: 'no lineage with 20 wall samples after burn-in',
    },
    'eval.gap_never_share': {
        value: null,
        reason: 'no lineage with 20 wall samples after burn-in',
    },
    'eval.patch_leave_depleted': {
        value: null,
        reason: 'no depleted-patch sample resolved after burn-in',
    },
    'eval.patch_stay_depleted': {
        value: null,
        reason: 'no depleted-patch sample resolved after burn-in',
    },
    'eval.prey_extinctions': {
        value: null,
        reason: 'no 1000-tick checkpoint after burn-in',
    },
    'eval.boom_bust_count': {
        value: null,
        reason: 'no 1000-tick checkpoint after burn-in',
    },
    'eval.prey_summer_min': {
        value: null,
        reason: 'no summer checkpoint after burn-in',
    },
    'eval.prey_cover_distance': {
        value: null,
        reason: 'fewer than 100 prey samples after burn-in',
    },
    'eval.prey_within_dash_share': {
        value: null,
        reason: 'fewer than 100 prey samples after burn-in',
    },
    'eval.prey_in_patch_share': {
        value: null,
        reason: 'fewer than 100 prey samples after burn-in',
    },
};
