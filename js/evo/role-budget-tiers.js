// The performer tiers of the chase budget (docs/designs/role-budget.md, "Performer tiers: possible is not learnable"):
// the catch margin of the perfect, the reactive and the naive hunter on each prey bound, and whether the margins give
// selection a slope to climb.

import { PREY_VIEW_SHARE } from './memory-probe-scenarios.js';
import { gapAtAwareness, maxCatchableGap, playFrame } from './role-budget-frame.js';

/** The tiers, from the best performer to the beginner. */
export const TIERS = Object.freeze(['perfect', 'reactive', 'naive']);

/**
 * @typedef {Record<import('./role-budget-frame.js').Tier, {straight: number, broken: number}>} TierMargins
 */

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @param {number} [bearing] the angle of the line to the prey from the hunter's heading
 * @returns {TierMargins} per tier and bound, the catch margin in px: `maxCatchableGap` less the gap the prey sees the
 *   hunter at; negative when the hunter does not close it
 */
export function tierMargins(hunter, prey, model, bearing = 0) {
    const aware = gapAtAwareness(hunter, prey);
    const read = (/** @type {import('./role-budget-frame.js').Tier} */ tier) => {
        // the broken bound first: the best effort of its sweep is where the straight bound's sweep starts looking
        const broken = maxCatchableGap(hunter, prey, { tier, bound: 'broken', bearing, model }) - aware;
        return { straight: maxCatchableGap(hunter, prey, { tier, bound: 'straight', bearing, model }) - aware, broken };
    };
    return { perfect: read('perfect'), reactive: read('reactive'), naive: read('naive') };
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {boolean} whether a naive hunter reaches contact on the straight bound at the start gap of the `prey-ahead`
 *   drill (`PREY_VIEW_SHARE` of its view), the prey fleeing from tick 0
 */
function naiveTouches(hunter, prey, model) {
    const start = PREY_VIEW_SHARE * hunter.view.range;
    return playFrame(hunter, prey, start, { tier: 'naive', bound: 'straight', model }).contactTick !== null;
}

/**
 * @param {TierMargins} margins the tiers' margins
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} prey the prey
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {'ok' | 'naive' | 'reactive' | 'perfect'} `ok` when the naive tier touches the prey at the drill's gap and the
 *   broken-bound margins rise from naive to reactive to perfect; else the tier that fails
 */
export function learnSlope(margins, hunter, prey, model) {
    if (!naiveTouches(hunter, prey, model)) {
        return 'naive';
    }
    if (!(margins.reactive.broken > margins.naive.broken)) {
        return 'reactive';
    }
    return margins.perfect.broken > margins.reactive.broken ? 'ok' : 'perfect';
}

/**
 * @param {TierMargins} margins the tiers' margins
 * @param {string} slope the `learnSlope`
 * @returns {boolean} whether an arm is fit for the rung screen on this pair: the reactive hunter closes the broken bound
 *   and the slope is `ok`
 */
export function fitForRung(margins, slope) {
    return margins.reactive.broken >= 0 && slope === 'ok';
}
