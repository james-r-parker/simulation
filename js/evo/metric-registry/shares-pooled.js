// The pooled share metrics (metric-noise.md Phase 2, "Pooled share family"): each old share beside a twin that carries its
// own numerator and denominator per seed in the report (`report-pooled.js`), read as the ratio of sums with whole seeds
// resampled. The old metrics keep their names, computations and values. Liveness and power are unread: the entries stay
// unverified until a 128-seed run carries the cells.

import { entry } from './entry.js';

export const SHARES_POOLED = {
    'eval.food_contact_bite_share_pooled': entry('world', {
        module: 'js/evo/scene-eat.js',
        meaning:
            'Higher means more of the contacts of foragers with food they can eat come with BITE held, across all the seeds of a run.',
        counts: "Pooled eval.food_contact_bite_share: the sum over seeds of contacts of non-hunters with edible food while canEatNow holds whose BITE output is above 0, over the sum of all such contacts after burn-in; the report keeps each seed's two sums, and a seed with no contact adds no exposure.",
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no non-hunter contact with edible food after burn-in'],
        arithmetic: 'test/evo/scene-eat.test.js',
        source: 'test/evo/metric-source-shares-pooled.test.js',
    }),
    'eval.carcass_hunter_share_pooled': entry('scenes-ecology', {
        module: 'js/evo/scene-herd-metrics.js',
        scenes: ['Scavenge'],
        meaning: 'How much of the carcass energy eaten is eaten by hunters, across all the seeds of a run.',
        counts: "Pooled eval.carcass_hunter_share: the sum over seeds of carcass energy eaten by agents of hunting specialisations, over the sum of all carcass energy eaten, after burn-in; the report keeps each seed's two sums, and a seed that ate no carcass adds no exposure.",
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no carcass eaten after burn-in'],
        arithmetic: 'test/evo/scene-herd-metrics.test.js',
        source: 'test/evo/metric-source-shares-pooled.test.js',
    }),
    'eval.mating_share_pooled': entry('core', {
        module: 'js/evo/metrics.js',
        meaning:
            'How many births come from two parents mating rather than from a split, across all the seeds of a run.',
        counts: "Pooled eval.mating_share: the sum over seeds of MATE births, over the sum of MATE plus SPLIT births, whole run (burn-in included); the report keeps each seed's two sums, and a seed with neither adds no exposure.",
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no mating or split birth'],
        arithmetic: 'test/evo/metrics.test.js',
        source: 'test/evo/metric-source-shares-pooled.test.js',
    }),
    'eval.gap_never_share_pooled': entry('scenes-ecology', {
        module: 'js/evo/scene-terrain.js',
        scenes: ['Cross or stay'],
        meaning: 'The share of lineages that never cross the wall, across all the seeds of a run (lower is intended).',
        counts: "Pooled eval.gap_never_share: the sum over seeds of lineages with at least MIN_LINEAGE_SAMPLES agent-samples and no crossings, over the sum of all such lineages; the report keeps each seed's two sums, and a seed with no such lineage adds no exposure.",
        unit: 'share',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no lineage with MIN_LINEAGE_SAMPLES wall samples after burn-in'],
        arithmetic: 'test/evo/scene-terrain.test.js',
        source: 'test/evo/metric-source-shares-pooled.test.js',
    }),
};
