// The empty arena of the chase envelope (docs/designs/senses-and-motor.md, Phase 2): a world with no food, herds,
// refuges or floor, big enough that no chase of `MAX_TICKS` reaches a wall, holding scripted bodies that the audit
// places and drives by hand. Every rule is the config's, so the audit reads the defaults it is given.

import { ENERGY_SOURCE, addEnergy } from '../sim/energy.js';
import { BORN_CAUSE } from '../sim/events.js';
import { createConfig } from '../sim/config.js';
import { createWorld, spawnAgent } from '../sim/spawn.js';

/** The wall of rocks stands at the middle of the arena's width (x = 8000); the bodies start well clear of it. */
export const ARENA_WIDTH = 16000;
export const ARENA_HEIGHT = 8000;
/** Where the first body stands: 4000 from the wall and from the edges, so a chase of `MAX_TICKS` ends in the open. */
export const ARENA_CENTRE = Object.freeze({ x: 4000, y: 4000 });

/** The knobs that empty a world; a caller's overrides win over them. */
const EMPTY = Object.freeze({
    worldWidth: ARENA_WIDTH,
    worldHeight: ARENA_HEIGHT,
    maxAgents: 8,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    foodSpawnRate: 0,
    fertileZoneMax: 0,
    refugeCount: 0,
    herdCount: 0,
    coldMarginWidth: 0,
    checkInvariants: false,
});

/**
 * @typedef {object} Body one scripted body
 * @property {number} spec its specialisation index
 * @property {number} x centre x
 * @property {number} y centre y
 * @property {number} angle its heading
 * @property {number} [energyShare] its energy as a share of its specialisation's store (0.5)
 */

/**
 * @param {Record<string, any>} [overrides] config overrides over the empty arena
 * @returns {Readonly<Record<string, any>>} the arena's config
 */
export function arenaConfig(overrides = {}) {
    return createConfig({ ...EMPTY, ...overrides });
}

/**
 * Builds the arena and places the bodies at rest, slot by slot in the order given.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {readonly Body[]} bodies the bodies to place
 * @returns {{world: Record<string, any>, policy: import('../sim/spawn.js').Policy}} the world and the policy to step it with
 */
export function stageArena(config, bodies) {
    const specs = bodies.map((b) => b.spec);
    const policy = { initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) => specs[slot], initBrain() {} };
    const world = createWorld(config, policy);
    bodies.forEach((body, slot) => {
        spawnAgent(world, policy, BORN_CAUSE.INITIAL);
        const target = (body.energyShare ?? 0.5) * world.maxEnergyBySpec[body.spec];
        addEnergy(world, slot, target - world.energy[slot], ENERGY_SOURCE.INITIAL);
        world.x[slot] = body.x;
        world.y[slot] = body.y;
        world.angle[slot] = body.angle;
        world.vx[slot] = 0;
        world.vy[slot] = 0;
    });
    return { world, policy };
}
