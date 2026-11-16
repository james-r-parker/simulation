// The social drills (training-stages.md, Scene drills): a hunter against prey that crosses its heading, a forager
// flanked by a hunter, a sibling in the jaws, and three hunters on a prey one cannot kill. Same shape as the drills of
// `drill-scenarios.js`, which lists them after its own seven. A drill's score is a detector; it never enters fitness,
// merit, mate rank or archive rank.

import { around, FORAGER_SPEC, HUNTER_ENERGY, PREDATOR_SPEC, heading } from './memory-probe-scenarios.js';
import { offset, preyDrill, stage, subjectAt } from './drill-staging.js';

const TWO_PI = 6.283185307179586;
const HUNTER_DISTANCE = 500;

/** The prey of `prey-crossing` starts at this many degrees (least, most) off the subject's heading. */
const CROSSING_DEG = Object.freeze([60, 120]);
/** The hunter of `hunter-flank` starts at this many degrees (least, most) off the subject's heading. */
const FLANK_DEG = Object.freeze([90, 150]);

/** @type {import('./drill-staging.js').Drill} a fleeing forager that moves across the predator's heading */
const PREY_CROSSING = preyDrill('prey-crossing', {
    energy: 800,
    maxTicks: 900,
    abort: false,
    preyAngle: (rng, angle) => angle + offset(rng, CROSSING_DEG[0], CROSSING_DEG[1]),
});

/** @type {import('./drill-staging.js').Drill} a hunter closes on the forager from beside it, not from ahead */
const HUNTER_FLANK = {
    name: 'hunter-flank',
    scene: 'A real chase',
    spec: FORAGER_SPEC,
    needsHunter: false,
    plan(rng) {
        const facing = heading(rng);
        const bearing = facing + offset(rng, FLANK_DEG[0], FLANK_DEG[1]);
        const hunter = {
            role: 'hunter',
            ...around(bearing, HUNTER_DISTANCE),
            angle: bearing + TWO_PI / 2,
            spec: PREDATOR_SPEC,
            energy: HUNTER_ENERGY,
        };
        return {
            stage: stage([subjectAt(FORAGER_SPEC, facing), hunter], []),
            timing: null,
            scent: false,
            maxTicks: 600,
            done: (world) => world.alive[0] === 0,
            won: (world) => world.alive[0] === 1,
        };
    },
};

/** The social drills, in the doc's order. */
export const SOCIAL_DRILLS = Object.freeze([PREY_CROSSING, HUNTER_FLANK]);
