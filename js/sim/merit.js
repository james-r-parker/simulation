// In-world merit: a per-slot running score that rewards deliberate foraging, mating, raising children to maturity
// and escaping predators, and decays with a half-life. Pure functions of sim state: no RNG, no clock, no allocation.
// Callers are the `merit` phase and `startMating`. See docs/designs/fitness-and-selection.md (In-world merit).

import { detExp } from './det-math.js';
import { noteMeal } from './split-gate.js';

/** Ticks between `MeritSummary` log events. */
export const MERIT_LOG_TICKS = 1000;

/** Below this exponent `0.5 ^ x` is zero for any merit a world can hold (and `detExp` is out of range). */
const MIN_EXPONENT = -700;

/**
 * The slot's merit decayed to the current tick, without storing it.
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {number} the decayed merit
 */
export function meritPeek(world, slot) {
    const { meritHalfLife } = world.config;
    const elapsed = world.tick - world.meritStamp[slot];
    if (meritHalfLife > 0 && elapsed > 0) {
        const exponent = (-Math.LN2 * elapsed) / meritHalfLife;
        return exponent < MIN_EXPONENT ? 0 : world.merit[slot] * detExp(exponent);
    }
    return world.merit[slot];
}

/**
 * Decays the slot's merit to the current tick and restamps it.
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {void}
 */
function decay(world, slot) {
    world.merit[slot] = meritPeek(world, slot);
    world.meritStamp[slot] = world.tick;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @param {number} amount merit to add
 * @returns {void}
 */
function add(world, slot, amount) {
    decay(world, slot);
    world.merit[slot] += amount;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot a slot
 * @returns {number} the slot's merit decayed to the current tick (the stored value is decayed and restamped)
 */
export function meritNow(world, slot) {
    decay(world, slot);
    return world.merit[slot];
}

/**
 * Credits the energy of a meal or bite. A deliberate one adds its full energy to merit and to `deliberateIntake`
 * (which is not decayed: the split gate reads the raw total); a chance one adds `meritChanceWeight` x energy to merit.
 * @param {Record<string, any>} world the world
 * @param {number} slot the eater
 * @param {number} energy energy gained, at least 0
 * @param {boolean} deliberate whether the tracker called the meal deliberate when it landed
 * @returns {void}
 */
export function creditIntake(world, slot, energy, deliberate) {
    noteMeal(world, slot, deliberate);
    if (deliberate) {
        world.deliberateIntake[slot] += energy;
        add(world, slot, energy);
    } else {
        add(world, slot, world.config.meritChanceWeight * energy);
    }
}

/**
 * Credits one mating (`startMating` credits both parents).
 * @param {Record<string, any>} world the world
 * @param {number} slot a parent
 * @returns {void}
 */
export function creditMating(world, slot) {
    add(world, slot, world.config.meritMateBonus);
}

/**
 * Credits one escape from a `canHunt` agent.
 * @param {Record<string, any>} world the world
 * @param {number} slot the escaped agent
 * @returns {void}
 */
export function creditEscape(world, slot) {
    add(world, slot, world.config.meritEscapeBonus);
}

/**
 * Credits a child's living parents when it reaches maturity (call once, when `ageTicks` reaches `maturityTicks`).
 * A parent slot is credited only while it still holds the parent's genome: a dead parent's slot may have been
 * reused by another agent, whose `genomeId` then differs from the child's `parentA` or `parentB`. A split child has
 * one parent in both fields and credits it once.
 * @param {Record<string, any>} world the world
 * @param {number} child the matured child's slot
 * @returns {number} how many parents were credited (0 to 2)
 */
export function creditMatured(world, child) {
    let credited = 0;
    const bonus = world.config.meritChildBonus;
    const a = world.parentSlotA[child];
    if (a >= 0 && world.genomeId[a] !== 0 && world.genomeId[a] === world.parentA[child]) {
        add(world, a, bonus);
        credited++;
    }
    const b = world.parentSlotB[child];
    if (b >= 0 && b !== a && world.genomeId[b] !== 0 && world.genomeId[b] === world.parentB[child]) {
        add(world, b, bonus);
        credited++;
    }
    return credited;
}
