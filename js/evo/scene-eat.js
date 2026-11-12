// Does a forager that touches food bite, and does a full one move slower (eat-choice.md, Detectors)? Every
// `EAT_SAMPLE_TICKS` (100) ticks from `BURN_IN_TICKS`, after the step (the feed phase has run), the scene reads every alive
// non-hunter (`huntBySpec` 0) once and pools three tallies over the run:
//
// - `eval.food_contact_bite_share` (watch): of the non-hunters in contact with edible food, the share whose `BITE` output
//   is above 0. Contact is the test of `tryEat` (`sqrt(dx*dx + dy*dy) < size + foodRadius`); the food is alive, of a kind
//   the agent's specialisation takes (`plantFoodBySpec` or `meatFoodBySpec` above 0) and `canEatNow` holds. The food is
//   read once per sample into a cell index (`food-cell-index.js`), so the scan is near O(agents).
// - `eval.full_contact_bite_share` (lower): the same among those whose store is at least `FULL_SHARE` (0.8) of
//   `maxEnergyBySpec`. `canEatNow` closes at `satiationShare` (0.95), so the band is 0.8 up to `satiationShare`, where
//   eating is still possible; with `satiationShare` 0 it runs to a full store.
// - `eval.fat_speed_ratio` (watch): per specialisation, the mean speed of the moving non-hunters (speed above 0) whose
//   store fraction is above the specialisation's mean at that sample, over the mean speed of those below it, pooled
//   over the samples; then the mean over the specialisations that have both. An agent at the mean is in neither side.
//
// The same sample feeds the graze detectors (`scene-graze.js`) and the hunter linger share (`scene-linger.js`).
// Every accumulator is a fixed array made with the scene; nothing is allocated per sample. The scene reads the world
// and writes only itself, so no hash can move.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../sim/brain-layout.js';
import { canEatNow } from '../sim/feeding.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { CONTACT, buildFoodCellIndex, createFoodCellIndex, touchesFood } from './food-cell-index.js';
import { none, ok } from './metrics-stats.js';

/** Ticks between the samples. */
export const EAT_SAMPLE_TICKS = 100;

/** The lowest store fraction of the full band. */
export const FULL_SHARE = 0.8;

const NO_CONTACT = 'no non-hunter in contact with edible food at a sample after burn-in';
const NO_FULL = `no non-hunter with a store of ${FULL_SHARE} or more in contact with edible food at a sample after burn-in`;
const NO_SPEC = 'no specialisation with moving non-hunters above and below its mean store fraction';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty eat scene: the pooled contact counts, and per specialisation the fraction sums
 *   of a sample and the speed sums and counts of the agents above and below the mean fraction
 */
export function createEatScene(config) {
    const specs = Math.max(...Object.values(config.specialisations).map((s) => s.index)) + 1;
    return {
        index: createFoodCellIndex(config),
        contact: 0,
        contactBite: 0,
        full: 0,
        fullBite: 0,
        moving: new Int32Array(specs),
        fraction: new Float64Array(specs),
        aboveSpeed: new Float64Array(specs),
        aboveCount: new Int32Array(specs),
        belowSpeed: new Float64Array(specs),
        belowCount: new Int32Array(specs),
    };
}

/**
 * Adds a non-hunter's contact to the pooled counts.
 * @param {Record<string, any>} scene the eat scene
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive non-hunter
 * @returns {void}
 */
function tallyContact(scene, world, slot) {
    if (!canEatNow(world, slot) || !touchesFood(scene.index, world, { slot, mode: CONTACT.EDIBLE })) {
        return;
    }
    const bites = world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 ? 1 : 0;
    scene.contact += 1;
    scene.contactBite += bites;
    if (world.energy[slot] >= FULL_SHARE * world.maxEnergyBySpec[world.spec[slot]]) {
        scene.full += 1;
        scene.fullBite += bites;
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {number} its speed
 */
function speedOf(world, slot) {
    return Math.sqrt(world.vx[slot] * world.vx[slot] + world.vy[slot] * world.vy[slot]);
}

/**
 * Adds a moving non-hunter's speed to the above or below side of its specialisation, by its store fraction against the mean.
 * @param {Record<string, any>} scene the eat scene
 * @param {{spec: number, fraction: number, speed: number}} agent its specialisation, store fraction and speed
 * @returns {void}
 */
function addSide(scene, { spec, fraction, speed }) {
    const side = Math.sign(fraction - scene.fraction[spec] / scene.moving[spec]);
    scene.aboveSpeed[spec] += side > 0 ? speed : 0;
    scene.aboveCount[spec] += side > 0 ? 1 : 0;
    scene.belowSpeed[spec] += side < 0 ? speed : 0;
    scene.belowCount[spec] += side < 0 ? 1 : 0;
}

/**
 * Pools the speeds of the moving non-hunters of each specialisation by whether their store fraction is above or below the
 * specialisation's mean at this sample (two passes: the mean, then the split).
 * @param {Record<string, any>} scene the eat scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function tallyFat(scene, world) {
    scene.moving.fill(0);
    scene.fraction.fill(0);
    for (let pass = 0; pass < 2; pass++) {
        for (let slot = 0; slot < world.alive.length; slot++) {
            const spec = world.spec[slot];
            const speed = speedOf(world, slot);
            if (world.alive[slot] !== 1 || world.huntBySpec[spec] === 1 || speed === 0) {
                continue;
            }
            const fraction = world.energy[slot] / world.maxEnergyBySpec[spec];
            if (pass === 0) {
                scene.moving[spec] += 1;
                scene.fraction[spec] += fraction;
            } else {
                addSide(scene, { spec, fraction, speed });
            }
        }
    }
}

/**
 * Samples the world when its tick is an `EAT_SAMPLE_TICKS` multiple at or after burn-in. Call it after the step.
 * @param {Record<string, any>} scene the eat scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleEat(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % EAT_SAMPLE_TICKS !== 0) {
        return;
    }
    buildFoodCellIndex(scene.index, world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] === 0) {
            tallyContact(scene, world, slot);
        }
    }
    tallyFat(scene, world);
}

/**
 * @param {Record<string, any>} scene the eat scene
 * @returns {import('./metrics-stats.js').MetricResult} the mean over the specialisations with moving agents on both sides of
 *   their mean store fraction of the mean speed above over the mean speed below; null when there is none
 */
function fatSpeedRatio(scene) {
    let sum = 0;
    let specs = 0;
    for (let spec = 0; spec < scene.aboveCount.length; spec++) {
        if (scene.aboveCount[spec] > 0 && scene.belowCount[spec] > 0) {
            sum += scene.aboveSpeed[spec] / scene.aboveCount[spec] / (scene.belowSpeed[spec] / scene.belowCount[spec]);
            specs += 1;
        }
    }
    return specs === 0 ? none(NO_SPEC) : ok(sum / specs);
}

/**
 * @param {Record<string, any>} scene the eat scene
 * @returns {import('./metrics-stats.js').MetricRecord} the two bite shares and the fat speed ratio, each null with a reason
 *   when nothing was sampled
 */
export function eatMetrics(scene) {
    return {
        'eval.food_contact_bite_share': scene.contact === 0 ? none(NO_CONTACT) : ok(scene.contactBite / scene.contact),
        'eval.full_contact_bite_share': scene.full === 0 ? none(NO_FULL) : ok(scene.fullBite / scene.full),
        'eval.fat_speed_ratio': fatSpeedRatio(scene),
    };
}
