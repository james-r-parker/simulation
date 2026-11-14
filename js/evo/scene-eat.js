// Does a forager that touches food bite, and does a full one move slower (eat-choice.md, Detectors)? Two sources:
//
// - The contact shares are tallied in the feed phase (`js/sim/eat-contact.js`), where `tryEat` tests contact and before the
//   item is removed, so a forager that bites and eats the item still counts. The sim writes four counters to
//   `world.eatContacts` every tick and never reads them; this scene keeps the counts at the first sample from
//   `BURN_IN_TICKS` and at the latest sample, and the metrics read the difference, so only contacts after burn-in count.
//   - `eval.food_contact_bite_share` (watch): of the contacts of non-hunters with food they take (`plantFoodBySpec` or
//     `meatFoodBySpec` above 0) while `canEatNow` holds, the share where `BITE` is above 0. A contact is one agent and one
//     item in a tick, by the test of `tryEat` (`sqrt(dx*dx + dy*dy) < size + foodRadius`).
//   - `eval.full_contact_bite_share` (lower): the same among contacts of agents whose store is at least `FULL_SHARE` (0.8)
//     of `maxEnergyBySpec`. `canEatNow` closes at `satiationShare` (0.95), so the band is 0.8 up to `satiationShare`, where
//     eating is still possible; with `satiationShare` 0 it runs to a full store.
// - `eval.fat_speed_ratio` (watch): every `EAT_SAMPLE_TICKS` (100) ticks from `BURN_IN_TICKS`, after the step, per
//   specialisation, the mean speed of the moving non-hunters (speed above 0) whose store fraction is above the
//   specialisation's mean at that sample, over the mean speed of those below it, pooled over the samples; then the mean over
//   the specialisations that have both. An agent at the mean is in neither side.
//
// The same sample feeds the graze detectors (`scene-graze.js`) and, over the hunters, the plant linger share (`scene-linger.js`),
// which read the food through a cell index (`food-cell-index.js`).
// Every accumulator is a fixed array made with the scene; nothing is allocated per sample. The scene reads the world
// and writes only itself, so no hash can move.

import { EAT_CONTACT, FULL_SHARE } from '../sim/eat-contact.js';
import { BURN_IN_TICKS } from './burn-in.js';
import { buildFoodCellIndex, createFoodCellIndex } from './food-cell-index.js';
import { createGrazeScene, grazeMetrics, tallyGraze } from './scene-graze.js';
import { createLingerScene, lingerMetrics, tallyLinger } from './scene-linger.js';
import { none, ok } from './metrics-stats.js';

/** Ticks between the samples. */
export const EAT_SAMPLE_TICKS = 100;

const NO_CONTACT = 'no non-hunter contact with edible food after burn-in';
const NO_FULL = `no non-hunter contact with edible food with a store of ${FULL_SHARE} or more after burn-in`;
const NO_SPEC = 'no specialisation with moving non-hunters above and below its mean store fraction';

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Record<string, any>} an empty eat scene: the contact counters at the first sample and at the latest one, and
 *   per specialisation the fraction sums of a sample and the speed sums and counts of the agents above and below the mean
 *   fraction
 */
export function createEatScene(config) {
    const specs = Math.max(...Object.values(config.specialisations).map((s) => s.index)) + 1;
    return {
        index: createFoodCellIndex(config),
        graze: createGrazeScene(config),
        linger: createLingerScene(),
        based: false,
        base: new Float64Array(EAT_CONTACT.COUNT),
        latest: new Float64Array(EAT_CONTACT.COUNT),
        moving: new Int32Array(specs),
        fraction: new Float64Array(specs),
        aboveSpeed: new Float64Array(specs),
        aboveCount: new Int32Array(specs),
        belowSpeed: new Float64Array(specs),
        belowCount: new Int32Array(specs),
    };
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
 * Samples the world when its tick is an `EAT_SAMPLE_TICKS` multiple at or after burn-in: the contact counters (the first
 * sample is their base), then the agents. Call it after the step.
 * @param {Record<string, any>} scene the eat scene
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleEat(scene, world) {
    if (world.tick < BURN_IN_TICKS || world.tick % EAT_SAMPLE_TICKS !== 0) {
        return;
    }
    if (!scene.based) {
        scene.base.set(world.eatContacts);
        scene.based = true;
    }
    scene.latest.set(world.eatContacts);
    buildFoodCellIndex(scene.index, world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] !== 1) {
            continue;
        }
        if (world.huntBySpec[world.spec[slot]] === 0) {
            tallyGraze(scene.graze, world, slot);
        } else {
            tallyLinger(scene.linger, world, { index: scene.index, slot });
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
 * @param {number} count an `EAT_CONTACT` index
 * @returns {number} the tally since the first sample
 */
function tallied(scene, count) {
    return scene.latest[count] - scene.base[count];
}

/**
 * @param {Record<string, any>} scene the eat scene
 * @returns {import('./metrics-stats.js').MetricRecord} the two bite shares and the fat speed ratio, each null with a reason
 *   when nothing was counted
 */
export function eatMetrics(scene) {
    const contact = tallied(scene, EAT_CONTACT.CONTACT);
    const full = tallied(scene, EAT_CONTACT.FULL);
    return {
        'eval.food_contact_bite_share':
            contact === 0 ? none(NO_CONTACT) : ok(tallied(scene, EAT_CONTACT.CONTACT_BITE) / contact),
        'eval.full_contact_bite_share': full === 0 ? none(NO_FULL) : ok(tallied(scene, EAT_CONTACT.FULL_BITE) / full),
        'eval.fat_speed_ratio': fatSpeedRatio(scene),
        ...grazeMetrics(scene.graze),
        ...lingerMetrics(scene.linger),
    };
}
