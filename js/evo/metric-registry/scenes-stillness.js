// Stillness detector entries (stillness.md, Phase 1).

import { entry } from './entry.js';

export const SCENES_STILLNESS = {
    'eval.ambush_kill_share': entry('scenes-ecology', {
        module: 'js/evo/scene-stillness.js',
        meaning: 'Share of caught approaches opened after the hunter held still for at least 60 ticks.',
        counts: 'Caught approaches whose hunter had at least 60 consecutive post-burn-in ticks below RING_SPEED before opening, over all caught approaches after burn-in.',
        unit: 'share',
        direction: 'higher',
        nullWhen: ['no caught approaches after burn-in'],
        arithmetic: 'test/evo/scene-stillness.test.js',
        source: 'test/evo/metric-source-ecology.test.js',
    }),
    'eval.freeze_survival_gain': entry('scenes-ecology', {
        module: 'js/evo/scene-stillness.js',
        meaning: 'Survival share of still-at-first-sight prey episodes minus the share for moving prey episodes.',
        counts: 'Completed contiguous current-threat-ray episodes after burn-in, grouped by stillness at first sample; ray loss while alive survives, and death while the episode is open fails.',
        unit: 'share difference',
        signed: true,
        direction: 'higher',
        nullWhen: ['no completed episodes in both still and moving groups after burn-in'],
        arithmetic: 'test/evo/scene-stillness.test.js',
        source: 'test/evo/metric-source-ecology.test.js',
    }),
    'eval.freeze_under_threat': entry('scenes-ecology', {
        module: 'js/evo/scene-stillness.js',
        meaning: 'Mean per-prey still-tick share under current threat rays minus the share during calm ticks.',
        counts: 'For each prey sampled in both states after burn-in, still ticks divided by threat ticks minus still ticks divided by calm ticks; the per-prey differences are averaged.',
        unit: 'share difference',
        signed: true,
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no prey sampled both current-threat and calm ticks after burn-in'],
        arithmetic: 'test/evo/scene-stillness.test.js',
        source: 'test/evo/metric-source-ecology.test.js',
    }),
};
