// Expected outputs from a sourceRun with two after-burn-in starvation deaths and no scene activity.
export default {
    'eval.basin_families': {
        value: null,
        reason: 'both basins held under 20 agents in the last quarter',
    },
    'eval.basin_family_effective': {
        value: null,
        reason: 'both basins held under 20 agents in the last quarter',
    },
    'eval.basin_spec_divergence': {
        value: null,
        reason: 'basin 0 held 0 agents (under 20) in the last quarter',
    },
    'eval.basin_cluster_divergence': {
        value: null,
        reason: 'basin 0 held 0 agents (under 20) in the last quarter',
    },
    'eval.basin_divergence': {
        value: null,
        reason: 'basin 0 held 0 agents (under 20) in the last quarter',
    },
    'eval.juvenile_parent_distance': {
        value: null,
        reason: 'no juvenile hunter with a living parent and a living sibling at a checkpoint',
    },
    'eval.juvenile_sibling_distance': {
        value: null,
        reason: 'no juvenile hunter with a living parent and a living sibling at a checkpoint',
    },
    'eval.juvenile_parent_pull': {
        value: null,
        reason: 'no juvenile hunter with a living parent and a living sibling at a checkpoint',
    },
    'eval.skill_heritability': {
        value: null,
        reason: 'fewer than 10 children with ten meals after burn-in',
    },
    'eval.social_return': {
        value: null,
        reason: 'no age with both a credited and an uncredited mature death',
    },
    'eval.mate_rank_gap': {
        value: null,
        reason: 'no mating with a chosen mate after burn-in',
    },
    'eval.mate_hunter_lean': {
        value: null,
        reason: 'no mating with a ready adult in view after burn-in',
    },
    'eval.niche_replacement': {
        value: null,
        reason: 'no rare-niche lineage followed to a next checkpoint after burn-in',
    },
    'eval.style_separation': {
        value: null,
        reason: 'no lineage with 20 deaths after burn-in',
    },
    'eval.condition_gait_shift': {
        value: null,
        reason: 'no agent sampled in both a neutral and a pregnant, cold or starving condition',
    },
    'eval.mother_wait_by_condition': {
        value: null,
        reason: 'fewer than 6 mother waits after burn-in',
    },
    'eval.childshare_by_condition': {
        value: null,
        reason: 'no lineage with 20 mate births after burn-in',
    },
    'eval.basin_families.east': { value: null, reason: 'no checkpoint in the last quarter' },
    'eval.basin_families.west': { value: null, reason: 'no checkpoint in the last quarter' },
    'eval.basin_family_effective.east': { value: null, reason: 'no checkpoint in the last quarter' },
    'eval.basin_family_effective.west': { value: null, reason: 'no checkpoint in the last quarter' },
};
