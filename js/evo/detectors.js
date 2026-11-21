// Every scene detector, in the order the observer runs them (docs/designs/registries.md, Detectors). A detector is
// declared next to its scene in `scene-*.js` (the shape is `Detector` in `observer-detectors.js`); this list is the one
// place that names them all, so a new detector is its module, its registry entries, its test and one line here.

import { floraDetector } from './scene-flora.js';
import { scentDetector } from './scene-scent.js';
import { effectsDetector } from './scene-effects.js';
import { sprintDetector } from './scene-sprint.js';
import { approachDetector } from './scene-approach.js';
import { packLiftDetector } from './scene-pack-lift.js';
import { competenceDetector } from './scene-competence.js';
import { matchedDetector } from './scene-matched.js';
import { kinematicsDetector } from './scene-kinematics.js';
import { budgetDetector } from './scene-recruit-budget.js';
import { stillnessDetector } from './scene-stillness.js';
import { huntersDetector } from './scene-hunters.js';
import { recruitDetector } from './scene-recruit.js';
import { biteDetector } from './scene-bite.js';
import { biteLifeDetector } from './scene-bite-life.js';
import { strikeMissDetector } from './scene-strike-miss.js';
import { hunterChoiceDetector } from './scene-hunter-choice.js';
import { herdDetector } from './scene-herd.js';
import { patchDetector } from './scene-patch.js';
import { terrainDetector } from './scene-terrain.js';
import { refugeDetector } from './scene-refuge.js';
import { reachDetector } from './scene-reach.js';
import { refugeOutcomeDetector } from './scene-refuge-outcome.js';
import { basinDetector } from './scene-basin.js';
import { balanceDetector } from './scene-balance.js';
import { seasonDetector } from './scene-season.js';
import { seasonMapDetector } from './scene-season-map.js';
import { carcassDetector } from './scene-carcass.js';
import { conditionDetector } from './scene-condition.js';
import { eatDetector } from './scene-eat.js';
import { capacityDetector } from './scene-capacity.js';
import { edgeDetector } from './scene-edge.js';
import { diseaseDetector } from './scene-disease.js';
import { guardsDetector } from './scene-guards.js';
import { guildsDetector } from './scene-guilds.js';
import { defenderDetector } from './scene-defender.js';
import { kinDetector } from './scene-kin-proximity.js';
import { familiesDetector } from './scene-families.js';
import { divergenceDetector } from './scene-divergence.js';
import { spendDetector } from './scene-spend.js';
import { proofDetector } from './scene-proof.js';
import { heritageDetector } from './scene-heritage.js';
import { nicheDetector } from './scene-niche.js';
import { mateDetector } from './scene-mate.js';
import { genesDetector } from './scene-genes.js';
import { styleDetector } from './style.js';
import { compileDetectors, createStates } from './observer-detectors.js';

/** @type {readonly import('./observer-detectors.js').Detector[]} */
export const DETECTORS = Object.freeze([
    herdDetector,
    floraDetector,
    huntersDetector,
    recruitDetector,
    diseaseDetector,
    biteDetector,
    strikeMissDetector,
    hunterChoiceDetector,
    biteLifeDetector,
    proofDetector,
    approachDetector,
    packLiftDetector,
    competenceDetector,
    matchedDetector,
    stillnessDetector,
    sprintDetector,
    effectsDetector,
    kinematicsDetector,
    budgetDetector,
    carcassDetector,
    styleDetector,
    guildsDetector,
    defenderDetector,
    refugeOutcomeDetector,
    heritageDetector,
    nicheDetector,
    mateDetector,
    terrainDetector,
    refugeDetector,
    reachDetector,
    basinDetector,
    spendDetector,
    patchDetector,
    conditionDetector,
    eatDetector,
    seasonDetector,
    seasonMapDetector,
    balanceDetector,
    familiesDetector,
    divergenceDetector,
    guardsDetector,
    capacityDetector,
    edgeDetector,
    kinDetector,
    scentDetector,
    genesDetector,
]);

/** The detectors a lean observer (the policy core, lean-observer.md) builds and feeds. */
export const LEAN_DETECTORS = Object.freeze(DETECTORS.filter((detector) => detector.lean === true));

/**
 * The observer's scene layer: the compiled detector list and every detector's state.
 * @param {Readonly<Record<string, any>>} config the world's config
 * @param {{runTicks?: number, lean?: boolean}} options the observer's options (a lean one builds `LEAN_DETECTORS`)
 * @returns {{plan: import('./observer-detectors.js').Plan, scenes: Record<string, any>}} `observer.plan` and `observer.scenes`
 */
export function createSceneLayer(config, { runTicks = 0, lean = false }) {
    const plan = compileDetectors(lean ? LEAN_DETECTORS : DETECTORS);
    return { plan, scenes: createStates(plan, config, runTicks) };
}
