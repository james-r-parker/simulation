// Registry entries of the scenes-ecology family (part 4); see index.js and docs/designs/metric-trust.md.

import { entry } from './entry.js';

export const SCENES_ECOLOGY_4 = {
    'eval.herd_carcass_meal_share': entry('scenes-ecology', {
        module: 'js/evo/scene-herd-metrics.js',
        scenes: ['Scavenge'],
        meaning: 'How much of the meat eaten is from herd carcasses.',
        counts: "Herd carcass energy eaten (carcassEatenBySpec) over meat eaten: carcass energy (herd and other) plus hunters' bite energy, after burn-in.",
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no meat eaten after burn-in'],
        arithmetic: 'test/evo/scene-herd-metrics.test.js',
    }),
    'eval.carcass_meal_share': entry('scenes-ecology', {
        module: 'js/evo/scene-herd-metrics.js',
        meaning: 'How much of the meat eaten is from carcasses rather than bites.',
        counts: '(Carcass energy eaten, herd carcasses and other carcasses) over that plus the bite energy gained by hunters, after burn-in.',
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no meat eaten after burn-in'],
        arithmetic: 'test/evo/scene-herd-metrics.test.js',
    }),
};
