// The sprint store (docs/designs/fair-chase.md, The store): each agent holds a store from 0 to 1, full at birth, that a
// sprint drains and rest refills, so prey tire and a hunter's burst is short. The store sets a factor on the sprint:
// 1 at or above `sprintFloor`, falling linearly to 0 at an empty store. `stepSprintStore` writes that factor, computed
// once per agent per tick, into the world's `sprintFactor` lane, which `thrustOf` (js/sim/physics.js), `tickCost`
// (js/sim/energy.js) and the speed cap in the physics kernel (`move_agent` in wasm/src/physics.rs) read. With
// `sprintStoreEnabled` off there is no store and the lane holds 1 for every slot. No RNG, no clock, no allocation per tick.

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';
import { specTable } from './spec-params.js';
import { EVENT_TYPE, pushEvent, EVENT } from './events.js';

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
    const drainBySpec = specTable(config, 'sprintDrainMultiplier');
    for (let k = 0; k < drainBySpec.length; k++) {
        drainBySpec[k] *= config.sprintDrain;
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
 * Allocates the sprint state of a world being built: the `sprintFactor` lane (1 for every slot, which the physics kernel
 * takes into its arena), and with `sprintStoreEnabled` the store, whose level row joins `agentRows` so a freed slot
 * is zeroed.
 * @param {Record<string, any>} world the world being built, its `agentRows` allocated
 * @returns {void}
 */
export function allocSprintState(world) {
    const n = world.config.maxAgents;
    world.sprintFactor = new Float64Array(n).fill(1);
    if (world.config.sprintStoreEnabled) {
        world.sprintStore = createSprintStore(world.config, n);
        world.agentRows.push({ array: world.sprintStore.level, stride: 1, name: 'sprintLevel' });
    }
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
 * Pushes `SPRINT_SPENT` for a store that has just fallen under the floor in a sprint: once per crossing, not per tick.
 * @param {Record<string, any>} world the world (its `events`, `tick`, `genomeId` and `spec`)
 * @param {number} slot the sprinting slot
 * @returns {void}
 */
function noteSpent(world, slot) {
    const o = pushEvent(world.events, EVENT_TYPE.SPRINT_SPENT, world.tick);
    world.events.data[o + EVENT.SPRINT_SPENT.SLOT] = slot;
    world.events.data[o + EVENT.SPRINT_SPENT.GENOME_ID] = world.genomeId[slot];
    world.events.data[o + EVENT.SPRINT_SPENT.SPEC] = world.spec[slot];
}

/**
 * For every live slot: writes the factor of the store as the tick begins into `sprintFactor`, then drains the store by
 * its specialisation's drain while `SPRINT` is above 0, or refills it by `sprintRefill` while `SPRINT` is at or under 0
 * and `THRUST` is under `sprintRestThrust`, clamped to 0 to 1. A store that falls under the floor in a sprint pushes
 * one `SPRINT_SPENT` event.
 * @param {SprintStore} store the store
 * @param {Record<string, any>} world the world (or the arrays it reads, the lane it writes, `tick`, `genomeId` and
 *   `events`)
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
            const before = level[i];
            level[i] = Math.max(0, before - drainBySpec[spec[i]]);
            if (before >= store.floor && level[i] < store.floor) {
                noteSpent(world, i);
            }
        } else if (outputs[o + OUTPUT_INDEX.THRUST] < restThrust) {
            level[i] = Math.min(1, level[i] + refill);
        }
    }
}
