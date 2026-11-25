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
        scenes: ['Scavenge'],
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
    'eval.refuge_crowding': entry('scenes-ecology', {
        module: 'js/evo/scene-refuge-outcome.js',
        scenes: ['Refuge'],
        meaning: 'How many prey share a ring that holds a threatened prey.',
        counts: 'Mean prey inside a ring over rings that hold a threatened prey, sampled every 10 ticks after burn-in.',
        unit: 'prey',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no ring held a threatened prey'],
        expectedFlat:
            'Null unless a refuge ring holds a threatened prey, which happened on 107 of 128 floor-on seeds (E188); it moves with prey sheltering under threat.',
        arithmetic: 'test/evo/scene-refuge-outcome.test.js',
    }),
    'eval.refuge_eligible_share': entry('scenes-ecology', {
        module: 'js/evo/scene-refuge-outcome.js',
        meaning: 'The share of prey small enough to get through the gap into a ring.',
        counts: 'Prey-samples whose body radius is REFUGE_CLEARANCE_PX or more under refugeSizeMax, over all prey-samples, every 10 ticks after burn-in.',
        unit: 'share',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no prey sample after burn-in'],
        arithmetic: 'test/evo/scene-refuge-outcome.test.js',
    }),
    'eval.predators_at_end_terminal_window': entry('scenes-ecology', {
        module: 'js/evo/scene-terminal-hunters.js',
        meaning: 'Higher means more hunters were alive on average during the last complete season after burn-in.',
        counts: 'Mean alive canHunt count at 1000-tick checkpoints in the last complete season after burn-in, including zero counts. The starting boundary belongs to the season and the ending boundary belongs to the next season.',
        unit: 'agents',
        direction: 'higher',
        nullWhen: ['no complete season after burn-in', 'no complete season checkpoint series'],
        arithmetic: 'test/evo/scene-terminal-hunters.test.js',
        source: 'test/evo/scene-terminal-hunters.test.js',
    }),
};
