// The budgets a recruit pays (honest-budgets T33a): what a chase costs a hunter, failures included, and how often territory
// keeps a hunter that could breed from breeding.
//
// - `eval.chase_net_energy`: the mean change in a hunter's stored energy from the tick a chase opened to the tick it resolved, over
//   every counted chase (`scene-approach.js`). A catch includes the energy of the meal it ends in, and every chase includes
//   the upkeep and bites paid while it ran. Observer diagnostics, never fitness.
// - `eval.chase_failed_energy`: the same mean over the chases that were escaped or given up, the energy a failed chase costs.
// - `eval.hunter_territory_blocked_share`: at each 1000-tick checkpoint after burn-in, the alive hunters that are mature, rested,
//   not pregnant and above their split energy (`splitMinBySpec`), of which the share `territoryAllows` refuses, pooled.
//
// Observer state outside `worldHash`; a chase adds to four sums and a checkpoint reads the alive hunters once.

import { territoryAllows } from '../sim/territory.js';
import { CHASE_OUTCOME } from './chase-outcome.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { none, ok } from './metrics-stats.js';

/**
 * @returns {Record<string, any>} an empty budget scene: the chase energy sums and the pooled territory counts
 */
export function createBudgetScene() {
    return { chases: 0, chaseEnergy: 0, failed: 0, failedEnergy: 0, eligible: 0, blocked: 0, samples: 0 };
}

/**
 * Notes one counted chase at its resolution: the hunter's energy now minus its energy when the chase opened.
 * @param {Record<string, any>} scene the budget scene
 * @param {Record<string, any>} world the world
 * @param {{slot: number, outcome: number, energy: number}} chase the hunter's slot, the chase's `CHASE_OUTCOME` and its energy at the opening
 * @returns {void}
 */
export function noteBudgetChase(scene, world, { slot, outcome, energy }) {
    const net = world.energy[slot] - energy;
    scene.chases += 1;
    scene.chaseEnergy += net;
    if (outcome !== CHASE_OUTCOME.CAUGHT) {
        scene.failed += 1;
        scene.failedEnergy += net;
    }
}

/**
 * Samples the alive hunters at a checkpoint after burn-in.
 * @param {Record<string, any>} scene the budget scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleBudget(scene, world) {
    if (world.tick < BURN_IN_TICKS) {
        return;
    }
    scene.samples += 1;
    for (let slot = 0; slot < world.alive.length; slot++) {
        const spec = world.spec[slot];
        const eligible =
            world.alive[slot] === 1 &&
            world.huntBySpec[spec] === 1 &&
            world.ageTicks[slot] >= world.config.maturityTicks &&
            world.cooldown[slot] === 0 &&
            world.pregnancy[slot] === 0 &&
            world.energy[slot] > world.splitMinBySpec[spec];
        if (eligible) {
            scene.eligible += 1;
            scene.blocked += territoryAllows(world, slot) ? 0 : 1;
        }
    }
}

/**
 * @param {Record<string, any>} scene the budget scene
 * @returns {import('./metrics-stats.js').MetricRecord} the chase energy and territory metrics
 */
export function budgetMetrics(scene) {
    const noChase = 'no resolved chase after burn-in';
    const noFailed = 'no escaped or given-up chase after burn-in';
    const noHunter = 'no mature, rested, not-pregnant hunter above its split energy at a checkpoint after burn-in';
    return {
        'eval.chase_net_energy': scene.chases > 0 ? ok(scene.chaseEnergy / scene.chases) : none(noChase),
        'eval.chase_failed_energy': scene.failed > 0 ? ok(scene.failedEnergy / scene.failed) : none(noFailed),
        'eval.hunter_territory_blocked_share': scene.eligible > 0 ? ok(scene.blocked / scene.eligible) : none(noHunter),
    };
}
