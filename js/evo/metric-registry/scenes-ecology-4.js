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
    'eval.defender_bite_break_share': entry('scenes-ecology', {
        module: 'js/evo/scene-defender.js',
        meaning:
            'Higher means more of the bite episodes on prey end in an escape after a defender shoved the biting hunter.',
        counts: 'Bite episodes on non-hunters that resolved after burn-in and escaped (ESCAPE_TICKS from the last bite) with a shove landed on the hunter that bit the victim while the episode was open, over all resolved episodes (escaped, or the victim died).',
        unit: 'share',
        direction: 'higher',
        nullWhen: ['no bite episode resolved after burn-in'],
        expectedFlat: 'zero on defaults: the shove is off',
        arithmetic: 'test/evo/scene-defender.test.js',
        source: 'test/evo/role-metrics-defender.slow.test.js',
    }),
};
