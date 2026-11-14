// Does a hunter that senses grass stop on it (eat-choice.md, Phase 5, T22)? G3 lights a hunter's food channel only for
// food it can eat, so a hunter should not linger on plants; this reads the effect. Read from the eat sample
// (`scene-eat.js`): every `EAT_SAMPLE_TICKS` ticks after burn-in, over the alive hunters (`huntBySpec` 1), pooled over
// the run:
//
// - `eval.hunter_plant_linger_share` (watch, intended lower): of the hunter samples, the share in contact with plant food
//   (the contact test of `tryEat`: `sqrt(dx*dx + dy*dy) < size + foodRadius`, an alive `FOOD_KIND.PLANT` item, whatever
//   its specialisation takes and whether or not it `canEatNow`) while moving below `CLOSING_SPEED` x `maxVelocity`.
//
// The scene reads the world and writes only itself, so no hash can move. Nothing is allocated per sample.

import { CLOSING_SPEED } from '../sim/merit-state.js';
import { touchesPlant } from './food-cell-index.js';
import { none, ok } from './metrics-stats.js';

const NO_HUNTER = 'no hunter at a sample after burn-in';

/** @returns {Record<string, any>} an empty linger scene: the hunter samples and those lingering on plant food */
export function createLingerScene() {
    return { hunters: 0, lingering: 0 };
}

/**
 * Adds one alive hunter to the tallies.
 * @param {Record<string, any>} scene the linger scene
 * @param {Record<string, any>} world the world
 * @param {{index: Record<string, any>, slot: number}} hunter the food cell index of this sample and an alive hunter
 * @returns {void}
 */
export function tallyLinger(scene, world, { index, slot }) {
    const speed = Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
    scene.hunters += 1;
    if (speed < CLOSING_SPEED * world.config.maxVelocity && touchesPlant(index, world, slot)) {
        scene.lingering += 1;
    }
}

/**
 * @param {Record<string, any>} scene the linger scene
 * @returns {import('./metrics-stats.js').MetricRecord} the hunter plant linger share, null with a reason when no hunter was sampled
 */
export function lingerMetrics(scene) {
    return {
        'eval.hunter_plant_linger_share': scene.hunters === 0 ? none(NO_HUNTER) : ok(scene.lingering / scene.hunters),
    };
}
