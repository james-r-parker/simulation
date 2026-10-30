// The proof rule (natural-selection.md, "The proof rule"; principles rule 2): a lucky life does not found a line.
//
// An agent is **proven** when its own `deliberateIntake` reaches `splitDeliberateMin` and its deliberate meal share
// reaches `splitDeliberateShareMin` (the split gate without the per-life cap). It is evaluated whenever a meal is
// credited, so it can happen at any age. A genome is **established** when its bearer is proven and at least one child of
// that bearer, from a split or a mating, is proven too: the skill was repeated without anyone paying for it.
//
// The sim keeps the per-slot facts the rule needs, and the policy's death hook (js/evo/policies/map-elites-proof.js)
// decides what enters the archive from them:
//
// - `proven`: this agent has proven itself;
// - `unprovenKids`: its living children that have not proven themselves yet;
// - `established`: a child of this agent has proven itself.
//
// The split brake: a proven parent with `UNPROVEN_KIDS_BRAKE` unproven children alive cannot split, so the first
// unproven child does not brake it (one lucky parent can try a second) and the second does. A child that proves or
// dies releases the parent at once. Mating is never blocked.
//
// The arrays are derived state beside the split-gate counters: zeroed by `freeAgent`, outside `worldHash`, no RNG, no
// allocation per tick.

import { EVENT_TYPE, pushEvent } from './events.js';

/** Unproven living children at which a proven parent stops splitting. */
export const UNPROVEN_KIDS_BRAKE = 2;

const MAX_KIDS = 0xffff;

/**
 * @returns {[Uint8ArrayConstructor | Uint16ArrayConstructor, string, number][]} the allocation specs for
 *   `allocateWorld`, one element per slot: `proven`, `established` and `unprovenKids`
 */
export function proofSpecs() {
    return [
        [Uint8Array, 'proven', 1],
        [Uint8Array, 'established', 1],
        [Uint16Array, 'unprovenKids', 1],
    ];
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an agent
 * @returns {boolean} whether the agent has met the split gate on its own intake and meal share (no per-life cap)
 */
function meetsProof(world, slot) {
    const { splitDeliberateMin, splitDeliberateShareMin } = world.config;
    const total = world.mealsTotal[slot];
    return (
        world.deliberateIntake[slot] >= splitDeliberateMin &&
        total > 0 &&
        world.mealsDeliberate[slot] >= splitDeliberateShareMin * total
    );
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} child a child's slot
 * @param {boolean} first true for the child's first parent (`parentA`), false for the second
 * @returns {number} the parent's slot when it is alive and still holds that genome, else -1 (a split names one parent
 *   twice, and the second is then -1)
 */
function liveParent(world, child, first) {
    const slot = first ? world.parentSlotA[child] : world.parentSlotB[child];
    const id = first ? world.parentA[child] : world.parentB[child];
    const alive = slot >= 0 && id !== 0 && world.alive[slot] === 1 && world.genomeId[slot] === id;
    return alive && (first || slot !== world.parentSlotA[child]) ? slot : -1;
}

/**
 * Counts a newborn as an unproven child of each parent that is alive. Call once, after the birth sets the parent slots.
 * @param {Record<string, any>} world the world
 * @param {number} child the newborn's slot
 * @returns {void}
 */
export function noteProofBirth(world, child) {
    for (const first of [true, false]) {
        const parent = liveParent(world, child, first);
        if (parent >= 0 && world.unprovenKids[parent] < MAX_KIDS) {
            world.unprovenKids[parent] += 1;
        }
    }
}

/**
 * Takes an unproven child off its living parents' count; `establish` also marks them established.
 * @param {Record<string, any>} world the world
 * @param {number} child the child's slot
 * @param {boolean} establish true when the child has just proven itself
 * @returns {void}
 */
function releaseParents(world, child, establish) {
    for (const first of [true, false]) {
        const parent = liveParent(world, child, first);
        if (parent >= 0) {
            world.unprovenKids[parent] = Math.max(0, world.unprovenKids[parent] - 1);
            world.established[parent] = establish ? 1 : world.established[parent];
        }
    }
}

/**
 * Pushes `LINE_PROVEN` for a child that has just proven itself, naming its parents.
 * @param {Record<string, any>} world the world
 * @param {number} slot the child
 * @returns {void}
 */
function pushProven(world, slot) {
    const o = pushEvent(world.events, EVENT_TYPE.LINE_PROVEN, world.tick);
    const d = world.events.data;
    d[o + 2] = slot;
    d[o + 3] = world.genomeId[slot];
    d[o + 4] = world.parentA[slot];
    d[o + 5] = world.parentB[slot];
    d[o + 6] = world.lineageId[slot];
}

/**
 * Evaluates the proof of an agent after a meal or bite was credited. The first time it holds the agent is proven; if
 * it has a parent, the parents lose an unproven child and become established, and `LINE_PROVEN` is pushed (for a
 * parent that has died, the policy's pending table reads the event).
 * @param {Record<string, any>} world the world
 * @param {number} slot the eater
 * @returns {void}
 */
export function noteProofMeal(world, slot) {
    if (world.proven[slot] === 1 || !meetsProof(world, slot)) {
        return;
    }
    world.proven[slot] = 1;
    if (world.parentA[slot] !== 0) {
        releaseParents(world, slot, true);
        pushProven(world, slot);
    }
}

/**
 * Takes a dying unproven child off its living parents' count. Call at death, before the slot is freed.
 * @param {Record<string, any>} world the world
 * @param {number} slot the dying agent
 * @returns {void}
 */
export function releaseProofAtDeath(world, slot) {
    if (world.proven[slot] === 0 && world.parentA[slot] !== 0) {
        releaseParents(world, slot, false);
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} true when the split brake holds the agent: it is proven and has `UNPROVEN_KIDS_BRAKE` unproven
 *   children alive
 */
export function splitBraked(world, slot) {
    return world.proven[slot] === 1 && world.unprovenKids[slot] >= UNPROVEN_KIDS_BRAKE;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot an agent
 * @returns {boolean} whether the agent is proven and a child of it is proven too
 */
export function isEstablished(world, slot) {
    return world.proven[slot] === 1 && world.established[slot] === 1;
}
