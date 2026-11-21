// Wires the chase detectors together: the approach detector resolves each chase and hands it to the detectors that read
// it, and tells the pack-lift detector of each bite; the stillness detector reads the tick an approach opened.

import { noteChase as noteCompetenceChase } from './scene-competence.js';
import { noteMatchedChase } from './scene-matched.js';
import { noteKinematicsChase } from './scene-kinematics.js';
import { notePackBite } from './scene-pack-lift.js';
import { noteBudgetChase } from './scene-recruit-budget.js';
import { noteStillnessChase } from './scene-stillness.js';

/**
 * @param {Record<string, any>} states the detectors' states by name
 * @returns {void}
 */
export function linkChaseScenes(states) {
    const { approach, competence, matched, kinematics, budget, stillness, packLift } = states;
    approach.onChase = (/** @type {Record<string, any>} */ world, /** @type {any} */ chase) => {
        noteCompetenceChase(competence, world, chase);
        noteMatchedChase(matched, world, chase);
        noteKinematicsChase(kinematics, world, chase);
        noteBudgetChase(budget, world, chase);
        noteStillnessChase(stillness, chase);
    };
    approach.onBite = (/** @type {Record<string, any>} */ world, /** @type {number} */ biter) =>
        notePackBite(packLift, world, biter);
    stillness.approachOpenedTick = approach.openedTick;
}
