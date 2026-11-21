// The social drills (training-stages.md, Scene drills): a hunter against prey that crosses its heading, a forager
// flanked by a hunter, a sibling in the jaws, and three hunters on a prey one cannot kill. Same shape as the drills of
// `drill-scenarios.js`, which lists them after its own seven. A drill's score is a detector; it never enters fitness,
// merit, mate rank or archive rank.

import { detCos, detSin } from '../sim/det-math.js';
import { createKinTrace, noteKin } from './drill-kin-trace.js';
import { ARM_NAMES } from './drill-arms.js';
import { offset, killed, preyDrill, stage, subjectAt } from './drill-staging.js';
import { createPreyTrace, lostReason, noteTick, traceFields } from './drill-trace.js';
import { GROUP_ARENA_RULES, GROUP_CONTROL, TRIO, huntPlan } from './memory-probe-group.js';
import {
    CENTRE_X,
    CENTRE_Y,
    HUNTER_ENERGY,
    PREY_VIEW_SHARE,
    SUBJECT_ENERGY,
    around,
    heading,
} from './memory-probe-scenarios.js';
import { SPEC } from '../sim/specs.js';

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
    spec: SPEC.FORAGER,
    needsHunter: false,
    plan(rng) {
        const facing = heading(rng);
        const bearing = facing + offset(rng, FLANK_DEG[0], FLANK_DEG[1]);
        const hunter = {
            role: 'hunter',
            ...around(bearing, HUNTER_DISTANCE),
            angle: bearing + TWO_PI / 2,
            spec: SPEC.PREDATOR,
            energy: HUNTER_ENERGY,
        };
        return {
            stage: stage([subjectAt(SPEC.FORAGER, facing), hunter], []),
            timing: null,
            scent: false,
            maxTicks: 600,
            done: (world) => world.alive[0] === 0,
            won: (world) => world.alive[0] === 1,
        };
    },
};

/** The parent id the subject and its sibling share (any nonzero id makes two agents kin). */
const SHARED_PARENT = 7777;
/** The sibling stands this far from the subject: inside the sum of their radii, so the first tick pushes the pair to touch. */
const SIBLING_GAP = 40;
/** The prey of `kin-spared` starts at this many degrees (least, most) off the subject's heading, as in `prey-ahead`. */
const KIN_PREY_DEG = Object.freeze([0, 45]);
/** The sibling stands this many degrees off the subject's heading, on the side away from the prey: inside the jaws (a half-angle of 90). */
const SIBLING_DEG = 45;
/** The lost-trial reason of a trial in which the subject wished to bite the sibling. */
export const BIT_KIN = 'bit-kin';

/**
 * @param {import('./drill-trace.js').PreyTrace} preyTrace the chase's trace
 * @param {import('./drill-kin-trace.js').KinTrace} kin the sibling's trace
 * @returns {string} why a trial was lost: `bit-kin` when the subject wished to bite its sibling, else the chase's reason
 */
export function lostReasonOf(preyTrace, kin) {
    return kin.biteTicks > 0 ? BIT_KIN : lostReason(preyTrace);
}

/** @type {import('./drill-staging.js').Drill} a sibling stands in the jaws and a fleeing forager runs: eat the forager only */
const KIN_SPARED = {
    name: 'kin-spared',
    scene: 'Kin is not a stranger',
    spec: SPEC.PREDATOR,
    needsHunter: true,
    plan(rng, view) {
        const angle = heading(rng);
        const side = offset(rng, KIN_PREY_DEG[0], KIN_PREY_DEG[1]);
        const spot = around(angle + side, PREY_VIEW_SHARE * view);
        const bearing = angle - Math.sign(side) * SIBLING_DEG * (TWO_PI / 360);
        const prey = { role: 'prey', ...spot, angle: heading(rng), spec: SPEC.FORAGER, energy: SUBJECT_ENERGY };
        const sibling = {
            role: 'sibling',
            x: CENTRE_X + SIBLING_GAP * detCos(bearing),
            y: CENTRE_Y + SIBLING_GAP * detSin(bearing),
            angle,
            spec: SPEC.PREDATOR,
            energy: HUNTER_ENERGY,
            parents: [SHARED_PARENT, 0],
        };
        const subject = { ...subjectAt(SPEC.PREDATOR, angle), parents: [SHARED_PARENT, 0] };
        const preyTrace = createPreyTrace();
        const kin = createKinTrace();
        return {
            stage: stage([subject, prey, sibling], []),
            timing: null,
            scent: false,
            maxTicks: 900,
            trace: (won) => ({
                ...traceFields(preyTrace, won),
                kinJawTicks: kin.jawTicks,
                kinBiteTicks: kin.biteTicks,
                reason: won ? null : lostReasonOf(preyTrace, kin),
            }),
            done: (world) => {
                noteTick(preyTrace, world);
                noteKin(kin, world);
                return world.alive[0] === 0 || world.alive[1] === 0;
            },
            won: (world) => killed(world) && kin.biteTicks === 0,
        };
    },
};

/** @type {import('./drill-staging.js').Drill} three sibling clones of the subject on a prey one bite cannot kill; the arms are the group-hunt probe's controls */
const PACK_CONVERGE = {
    name: 'pack-converge',
    scene: 'Pack, or loner',
    spec: SPEC.PREDATOR,
    needsHunter: true,
    arena: GROUP_ARENA_RULES,
    plan: (rng, view) => huntPlan(rng, view, TRIO),
    arms: Object.freeze([
        {
            name: ARM_NAMES.SOLO,
            plan: (rng, view) => huntPlan(rng, view, 1),
            controlSpec: { name: GROUP_CONTROL.SOLO },
        },
        {
            name: ARM_NAMES.BLIND,
            plan: (rng, view) => huntPlan(rng, view, TRIO),
            controlSpec: { name: GROUP_CONTROL.BLIND, kinBlind: true },
        },
    ]),
};

/** The social drills, in the doc's order. */
export const SOCIAL_DRILLS = Object.freeze([PREY_CROSSING, HUNTER_FLANK, KIN_SPARED, PACK_CONVERGE]);
