// Where does a body's carcass energy go (honest-budgets T33b)? A body that dies with every food slot taken leaves no carcass
// (`leaveCarcass`, which books its value in `world.carcassLoss`). From burn-in on, the energy offered is the carcasses placed
// plus the bodies lost, and it ends as one of four things:
//
// - `eval.carcass_loss_share.lost`: bodies that found the pool full, over the energy offered.
// - `eval.carcass_loss_share.eaten`: the energy eaten from carcasses (`scene-carcass.js`), over the energy offered. Counted from
//   the tick after burn-in, so a carcass placed before burn-in and eaten after it counts here but not in the offer; the share
//   is capped at 1.
// - `eval.carcass_loss_share.faded`: what remains of the offer after the three others: carcass value that faded to nothing, an
//   eater's overflow above its cap, and anything the eater attribution missed.
// - the carcasses still standing at the last tick (their current value) are the share the three leave out.
// - `eval.carcass_lost_per_1k`: the lost energy per 1000 ticks after burn-in.
//
// Observer state outside `worldHash`: a baseline copy of three counters at the burn-in tick, and one pass over the food slots at
// the end.

import { CARCASS_LOSS, FOOD_KIND, FOOD_ORIGIN } from '../sim/carcass.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { bySuffix, none, ok } from './metrics-stats.js';

/** The shares `eval.carcass_loss_share` names, in order. */
export const LOSS_SHARES = Object.freeze(['lost', 'eaten', 'faded']);

/**
 * @returns {{base: Float64Array, taken: boolean}} an empty loss scene: the counters at burn-in and whether they were taken
 */
export function createLossScene() {
    return { base: new Float64Array(3), taken: false };
}

/**
 * Takes the baseline when the burn-in tick is observed; call it once a tick.
 * @param {{base: Float64Array, taken: boolean}} scene the loss scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteLossBase(scene, world) {
    if (world.tick === BURN_IN_TICKS) {
        scene.base.set(world.carcassLoss);
        scene.taken = true;
    }
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number} the current value of the carcasses of dead agents still lying in the food pool
 */
function standing(world) {
    let sum = 0;
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (
            world.foodAlive[food] === 1 &&
            world.foodKind[food] === FOOD_KIND.MEAT &&
            world.foodOrigin[food] === FOOD_ORIGIN.NONE
        ) {
            sum += world.foodValue[food];
        }
    }
    return sum;
}

/**
 * @param {{base: Float64Array, taken: boolean}} scene the loss scene
 * @param {Record<string, any>} world the world at the last tick
 * @param {number} eaten the carcass energy eaten after burn-in (`scene-carcass.js`)
 * @returns {import('./metrics-stats.js').MetricRecord} the four carcass-loss metrics
 */
export function carcassLossMetrics(scene, world, eaten) {
    const reason = scene.taken ? 'no carcass energy offered after burn-in' : 'the run ended before burn-in';
    const placed = scene.taken ? world.carcassLoss[CARCASS_LOSS.PLACED] - scene.base[CARCASS_LOSS.PLACED] : 0;
    const lost = scene.taken ? world.carcassLoss[CARCASS_LOSS.LOST] - scene.base[CARCASS_LOSS.LOST] : 0;
    const offered = placed + lost;
    if (!(offered > 0)) {
        return {
            ...bySuffix('eval.carcass_loss_share', LOSS_SHARES, () => none(reason)),
            'eval.carcass_lost_per_1k': scene.taken ? ok(0) : none(reason),
        };
    }
    const eatenShare = Math.min(eaten, placed) / offered;
    const lostShare = lost / offered;
    const faded = Math.max(0, 1 - lostShare - eatenShare - standing(world) / offered);
    const shares = [lostShare, eatenShare, faded];
    return {
        ...bySuffix('eval.carcass_loss_share', LOSS_SHARES, (i) => ok(shares[i])),
        'eval.carcass_lost_per_1k': ok((lost / (world.tick - BURN_IN_TICKS)) * 1000),
    };
}
