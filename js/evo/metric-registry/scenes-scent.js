// Scent-trails detector entries (scent-trails.md, Phase 1).

import { entry } from './entry.js';

export const SCENES_SCENT = {
    'eval.chase_reacquire_share': entry('scenes-ecology', {
        module: 'js/evo/scene-scent.js',
        meaning: 'Share of resolved chases where a prey ray sighting returns after at least one unseen tick.',
        counts: 'Resolved chases with a renewed prey sighting after a gap of 2 to 120 ticks over all resolved chases after burn-in; ray summaries do not expose prey identity.',
        unit: 'share',
        direction: 'higher',
        nullWhen: ['no resolved chases after burn-in'],
        arithmetic: 'test/evo/scene-scent.test.js',
        source: 'test/evo/metric-source-ecology.test.js',
    }),
    'eval.scavenge_approach_share': entry('scenes-ecology', {
        module: 'js/evo/scene-scent.js',
        meaning: 'Share of blob-carcass meals preceded by movement toward the carcass from beyond sight.',
        counts: 'Blob-carcass meals whose eater closed monotonically toward the carcass over at least 3 sampled ticks while the carcass existed, beginning beyond vision range, over blob-carcass meals after burn-in.',
        unit: 'share',
        direction: 'higher',
        nullWhen: ['no carcass meals after burn-in'],
        arithmetic: 'test/evo/scene-scent.test.js',
        source: 'test/evo/metric-source-ecology.test.js',
    }),
};
