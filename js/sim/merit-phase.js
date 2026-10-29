// The `merit` step phase: runs after `lifecycle` has aged and fed the agents. Pass 1
// advances every alive agent's deliberate-intake tracker; pass 2 credits what the tick brought (the meal and bite
// energy gained, a landed bite opening an escape episode, a resolved escape, a child reaching maturity) in slot order,
// the same order and classification the observer's intent state uses; then a `MeritSummary` when one is due.
// Matings are credited at once by `startMating`. No RNG, no allocation per tick.

import { creditEscape, creditIntake, creditMatured } from './merit.js';
import {
    biteDeliberate,
    mealDeliberate,
    noteMeritBite,
    resolveEscape,
    slotOfGenome,
    trackMerit,
} from './merit-state.js';
import { pushMeritSummary, summaryDue } from './merit-summary.js';
import { specParams } from './spec-params.js';

/** @typedef {import('./world.js').World} World */

/** After `lifecycle`, `bittenTimer` is 1 exactly when `feed` reset it this tick. */
const BITTEN_THIS_TICK = 1;

/**
 * Credits the food and bite energy an alive agent gained this tick, classified by its tracker.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function creditEnergy(world, slot) {
    const meal = world.foodEnergy[slot] - world.meritFoodMark[slot];
    world.meritFoodMark[slot] = world.foodEnergy[slot];
    if (meal > 0) {
        creditIntake(world, slot, meal, mealDeliberate(world, slot));
    }
    const bite = world.biteEnergy[slot] - world.meritBiteMark[slot];
    world.meritBiteMark[slot] = world.biteEnergy[slot];
    if (bite > 0) {
        creditIntake(world, slot, bite, biteDeliberate(world, slot));
    }
}

/**
 * Opens an escape episode when an alive biter with `canHunt` bit the slot this tick (a biter that died this tick is
 * no longer found, as in the observer), and credits the escape when an episode resolves.
 * @param {World} world the world
 * @param {number} slot an alive slot
 * @returns {void}
 */
function trackEscape(world, slot) {
    if (world.bittenTimer[slot] === BITTEN_THIS_TICK) {
        const biter = slotOfGenome(world, world.lastBiter[slot]);
        if (biter >= 0 && specParams(world.config, world.spec[biter]).canHunt) {
            noteMeritBite(world, slot);
        }
    }
    if (resolveEscape(world, slot)) {
        creditEscape(world, slot);
    }
}

/**
 * Advances the merit of the world by one tick.
 * @param {World} world the world
 * @returns {void}
 */
export function meritPhase(world) {
    const { alive } = world;
    const { maturityTicks } = world.config;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            trackMerit(world, slot);
        }
    }
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            creditEnergy(world, slot);
            trackEscape(world, slot);
            if (world.ageTicks[slot] === maturityTicks) {
                creditMatured(world, slot);
            }
        }
    }
    if (summaryDue(world)) {
        pushMeritSummary(world);
    }
}
