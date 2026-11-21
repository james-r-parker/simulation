// Every scene detector, in the order the observer runs them (docs/designs/registries.md, Detectors). A detector is
// declared next to its scene in `scene-*.js` (the shape is `Detector` in `observer-detectors.js`); this list is the one
// place that names them all, so a new detector is its module, its registry entries, its test and one line here.

import { floraDetector } from './scene-flora.js';
import { scentDetector } from './scene-scent.js';
import { sprintDetector } from './scene-sprint.js';
import { approachDetector } from './scene-approach.js';
import { packLiftDetector } from './scene-pack-lift.js';
import { competenceDetector } from './scene-competence.js';
import { matchedDetector } from './scene-matched.js';
import { kinematicsDetector } from './scene-kinematics.js';
import { budgetDetector } from './scene-recruit-budget.js';
import { stillnessDetector } from './scene-stillness.js';

/** @type {readonly import('./observer-detectors.js').Detector[]} */
export const DETECTORS = Object.freeze([
    floraDetector,
    scentDetector,
    approachDetector,
    packLiftDetector,
    competenceDetector,
    matchedDetector,
    stillnessDetector,
    sprintDetector,
    kinematicsDetector,
    budgetDetector,
]);

/** The detectors a lean observer (the policy core, lean-observer.md) builds and feeds. */
export const LEAN_DETECTORS = Object.freeze(DETECTORS.filter((detector) => detector.lean === true));
