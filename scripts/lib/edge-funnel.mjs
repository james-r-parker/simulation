// Why does a seen mate not become a mating (low-density-edge.md, Phase 2, T10)? A read-only funnel over the alive prey
// females of a world at one tick: each mature female is put in the first class whose condition fails, in the order the
// mating predicates are met (`isReadyToMate`, the brain's wish, a male within `mateRange`, the male's own readiness and
// wish, then `canMatePair`), split by whether she saw a possible mate in the latest sense. Nothing is written to the world,
// and the scratch list of prey is reused, so a call allocates only on its first.
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { canMatePair, isReadyToMate, readyToMate } from '../../js/sim/mate-eligibility.js';
import { isPossibleMate } from '../../js/sim/mate-scarcity.js';
import { SEX } from '../../js/sim/sex.js';
import { territoryAllows } from '../../js/sim/territory.js';
import { blocksMating } from '../../js/sim/temperature.js';

/** The classes, in the order a mature female is tested; `mates` is the one where a pair could mate this tick. */
export const CLASSES = Object.freeze([
    'pregnant',
    'cooldown',
    'energy',
    'cold',
    'heat',
    'territory',
    'female-unwilling',
    'no-male-in-reach',
    'male-not-ready',
    'male-unwilling',
    'pair-blocked',
    'mates',
]);

const MALE_CLASSES = ['no-male-in-reach', 'male-not-ready', 'male-unwilling', 'pair-blocked'];

/**
 * @typedef {object} Funnel
 * @property {number} prey prey read, over the samples
 * @property {number} samples checkpoints sampled
 * @property {Record<string, number>} seen mature prey females by class, those that saw a possible mate in the latest sense
 * @property {Record<string, number>} unseen the same for those that did not
 * @property {Record<string, number>[]} seasons the same by the season of the checkpoint (0 spring to 3 winter), seen or not
 */

/** @returns {Funnel} empty counts */
export function createFunnel() {
    const zero = () => Object.fromEntries(CLASSES.map((c) => [c, 0]));
    return { prey: 0, seen: zero(), unseen: zero(), samples: 0, seasons: [zero(), zero(), zero(), zero()] };
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a mature prey female
 * @returns {string} the first class whose condition fails for her before a male is looked at, or '' when none does
 */
function femaleClass(world, slot) {
    const c = world.config;
    if (world.pregnancy[slot] !== 0) {
        return 'pregnant';
    }
    if (world.cooldown[slot] !== 0) {
        return 'cooldown';
    }
    if (world.energy[slot] <= c.mateMinEnergy) {
        return 'energy';
    }
    if (blocksMating(c, world.temperature[slot])) {
        return world.temperature[slot] < c.temperatureColdStress ? 'cold' : 'heat';
    }
    if (!territoryAllows(world, slot)) {
        return 'territory';
    }
    return world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MATE] > 0 ? '' : 'female-unwilling';
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} f a ready, willing prey female
 * @param {Int32Array} prey the alive prey slots
 * @param {number} count the prey listed
 * @returns {string} the class from a male in reach on: `no-male-in-reach`, `male-not-ready`, `male-unwilling`,
 *   `pair-blocked` or `mates`
 */
function maleClass(world, f, prey, count) {
    let rank = 0;
    for (let i = 0; i < count; i++) {
        const m = prey[i];
        if (!isPossibleMate(world, f, m)) {
            continue;
        }
        const dx = world.x[m] - world.x[f];
        const dy = world.y[m] - world.y[f];
        const reach = world.size[f] + world.size[m] + world.config.mateRange;
        if (dx * dx + dy * dy >= reach * reach) {
            continue;
        }
        rank = Math.max(rank, 1);
        rank = isReadyToMate(world, m) ? Math.max(rank, 2) : rank;
        rank = readyToMate(world, m) ? Math.max(rank, 3) : rank;
        if (rank === 3 && canMatePair(world, f, m)) {
            return 'mates';
        }
    }
    return MALE_CLASSES[rank];
}

/**
 * Adds the alive prey females of the world to the funnel.
 * @param {Funnel} funnel the counts
 * @param {Record<string, any>} world the world, at a tick after a step
 * @param {Int32Array} prey scratch for the alive prey slots; its length is the most prey read
 * @returns {void}
 */
export function sampleFunnel(funnel, world, prey) {
    let count = 0;
    for (let slot = 0; slot < world.alive.length && count < prey.length; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] !== 1) {
            prey[count++] = slot;
        }
    }
    funnel.samples += 1;
    funnel.prey += count;
    for (let i = 0; i < count; i++) {
        const f = prey[i];
        if (world.sex[f] !== SEX.FEMALE || world.ageTicks[f] < world.config.maturityTicks) {
            continue;
        }
        const seen = world.mateSeenAt[f] === world.tick - 1;
        const cls = femaleClass(world, f) || maleClass(world, f, prey, count);
        (seen ? funnel.seen : funnel.unseen)[cls] += 1;
        funnel.seasons[world.season[0]][cls] += 1;
    }
}
