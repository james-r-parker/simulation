// Sprint detector entries (sprint-burst.md, Phase 1).

import { entry } from './entry.js';

export const SCENES_SPRINT = {
    'eval.chase_sprint_lift': entry('scenes-ecology', {
        module: 'js/evo/scene-sprint.js',
        meaning: 'Hunter sprint share during active chases relative to the share outside chases.',
        counts: 'Hunter-ticks with positive SPRINT inside active approaches divided by hunter-ticks inside them, over the same sprint share outside active approaches, after burn-in.',
        unit: 'ratio',
        direction: 'higher',
        nullWhen: ['no chase and non-chase hunter-ticks after burn-in', 'no sprint outside chases after burn-in'],
        arithmetic: 'test/evo/scene-sprint.test.js',
    }),
    'eval.flee_sprint_lift': entry('scenes-ecology', {
        module: 'js/evo/scene-sprint.js',
        meaning: 'Prey sprint share while a threat sighting is current relative to calm prey.',
        counts: 'Prey-ticks with positive SPRINT while a threat is on the ray scan divided by threatened prey-ticks, over the equivalent calm sprint share, after burn-in.',
        unit: 'ratio',
        direction: 'higher',
        nullWhen: ['no threat and calm prey-ticks after burn-in', 'no sprint while calm after burn-in'],
        arithmetic: 'test/evo/scene-sprint.test.js',
    }),
    'eval.sprint_cost_share': entry('scenes-ecology', {
        module: 'js/evo/scene-sprint.js',
        meaning:
            'Nominal configured sprint energy charge relative to total energy removed from agents; can exceed 1 when energy limits clip realized costs.',
        counts: 'For each alive agent-tick with positive SPRINT, sprintCost times juvenile burn for hunters, summed over actual energy removed from agents after burn-in. The numerator is nominal, not clipped, so this ratio can exceed 1.',
        unit: 'ratio',
        direction: 'watch',
        intended: 'higher',
        nullWhen: ['no energy removed from agents after burn-in'],
        arithmetic: 'test/evo/scene-sprint.test.js',
    }),
    'eval.sprint_share.hunter': entry('scenes-ecology', {
        module: 'js/evo/scene-sprint.js',
        meaning: 'Share of hunter-ticks with positive SPRINT output after burn-in.',
        counts: 'Hunter-ticks with positive SPRINT over all hunter-ticks after burn-in.',
        unit: 'share',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no agent-ticks for this role after burn-in'],
        arithmetic: 'test/evo/scene-sprint.test.js',
    }),
    'eval.sprint_share.prey': entry('scenes-ecology', {
        module: 'js/evo/scene-sprint.js',
        meaning: 'Share of prey-ticks with positive SPRINT output after burn-in.',
        counts: 'Prey-ticks with positive SPRINT over all prey-ticks after burn-in.',
        unit: 'share',
        direction: 'watch',
        intended: 'lower',
        nullWhen: ['no agent-ticks for this role after burn-in'],
        arithmetic: 'test/evo/scene-sprint.test.js',
    }),
};
