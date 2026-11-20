// The sprint store (docs/designs/fair-chase.md, The store): each agent holds a store from 0 to 1, full at birth, that a
// sprint drains and rest refills, so prey tire and a hunter's burst is short. The store sets a factor on the sprint:
// 1 at or above `sprintFloor`, falling linearly to 0 at an empty store. `stepSprintStore` writes that factor, computed
// once per agent per tick, into the world's `sprintFactor` lane, which `thrustOf` (js/sim/physics.js), `tickCost`
// (js/sim/energy.js) and the speed cap in the physics kernel (`move_agent` in wasm/src/physics.rs) read. With
// `sprintStoreEnabled` off there is no store and the lane holds 1 for every slot. No RNG, no clock, no allocation per tick.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';

/**
 * @typedef {object} SprintStore
 * @property {Float64Array} level each slot's store, 0 to 1
 * @property {Float64Array} drainBySpec `sprintDrain x sprintDrainMultiplier` of each specialisation, indexed by `index`
 * @property {number} refill `sprintRefill`
 * @property {number} restThrust `sprintRestThrust`
 * @property {number} floor `sprintFloor`
 */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {number} slots the agent slots (`maxAgents`)
 * @returns {SprintStore} a store with every slot full
 */
export function createSprintStore(config, slots) {
    const specs = Object.values(config.specialisations);
    const drainBySpec = new Float64Array(Math.max(...specs.map((s) => s.index)) + 1);
    for (const s of specs) {
        drainBySpec[s.index] = config.sprintDrain * s.sprintDrainMultiplier;
    }
    return {
        level: new Float64Array(slots).fill(1),
        drainBySpec,
        refill: config.sprintRefill,
        restThrust: config.sprintRestThrust,
        floor: config.sprintFloor,
    };
}

/**
 * @param {SprintStore} store the store
 * @param {number} slot the agent slot
 * @returns {number} the factor on the sprint: 1 at or above the floor, else the store over the floor (0 when empty)
 */
export function storeFactor(store, slot) {
    const level = store.level[slot];
    return level >= store.floor ? 1 : level / store.floor;
}

/**
 * Fills a slot's store, as at birth, and its factor.
 * @param {SprintStore} store the store
 * @param {Float64Array} factor the world's `sprintFactor` lane
 * @param {number} slot the slot being born into
 * @returns {void}
 */
export function resetSprintSlot(store, factor, slot) {
    store.level[slot] = 1;
    factor[slot] = 1;
}

/**
 * For every live slot: writes the factor of the store as the tick begins into `sprintFactor`, then drains the store by
 * its specialisation's drain while `SPRINT` is above 0, or refills it by `sprintRefill` while `SPRINT` is at or under 0
 * and `THRUST` is under `sprintRestThrust`, clamped to 0 to 1.
 * @param {SprintStore} store the store
 * @param {{alive: Uint8Array, spec: Uint8Array, outputs: Float32Array, sprintFactor: Float64Array}} world the world (or
 *   the arrays it reads and the lane it writes)
 * @returns {void}
 */
export function stepSprintStore(store, world) {
    const { alive, spec, outputs, sprintFactor } = world;
    const { level, drainBySpec, refill, restThrust } = store;
    for (let i = 0; i < alive.length; i++) {
        if (alive[i] !== 1) {
            continue;
        }
        sprintFactor[i] = storeFactor(store, i);
        const o = i * OUTPUT_COUNT;
        if (outputs[o + OUTPUT_INDEX.SPRINT] > 0) {
            level[i] = Math.max(0, level[i] - drainBySpec[spec[i]]);
        } else if (outputs[o + OUTPUT_INDEX.THRUST] < restThrust) {
            level[i] = Math.min(1, level[i] + refill);
        }
    }
}
