// The physics phase's numeric loops in the WASM kernels (docs/designs/wasm-kernels.md, Phase 4): `move_agents` damps,
// caps and moves every agent, `bounce_rocks` does one agent's rock bounce geometry (stopping at each damaging impact so
// JS applies the damage), and `resolve_contacts` runs the contact pass over the arena's spatial hash and the final
// clamp, bit-identical to the JS loops they replaced. Steering, thrust, trampling, the walls and every energy rule stay
// in JS (`js/sim/physics.js`).

import { OUTPUT_COUNT, OUTPUT_INDEX } from './brain-layout.js';

/** World fields the physics kernels read or write that no earlier kernel took into the arena. */
export const PHYSICS_FIELDS = Object.freeze(['vx', 'vy', 'spec', 'sprintBySpec', 'contacts']);

/** The arena arrays whose byte offsets head the physics parameter block, in `PhysicsParams` order. */
const ARRAYS = Object.freeze([
    'alive',
    'x',
    'y',
    'vx',
    'vy',
    'size',
    'spec',
    'outputs',
    'sprintBySpec',
    'obsX',
    'obsY',
    'obsRadius',
    'cellStart',
    'entries',
    'boxX',
    'boxY',
    'contacts',
    'physicsDoubles',
]);

/** Words of the physics parameter block after the offsets, in `PhysicsParams` order. */
const WORDS = Object.freeze(['maxAgents', 'obsCount', 'outputCount', 'sprintOutput', 'cols', 'rows', 'maxContacts']);

/** The doubles block, in `D_*` order (wasm/src/physics.rs). */
const DOUBLES = Object.freeze([
    'damping',
    'maxVelocity',
    'sprintMultiplier',
    'restitution',
    'worldWidth',
    'worldHeight',
    'hashCellSize',
]);

/**
 * @param {Record<string, any>} world the world, its fields not yet in an arena
 * @returns {import('./wasm-arena.js').ArenaSpec[]} the physics fields at their own type and length, then the parameter
 *   blocks
 */
export function physicsSpecs(world) {
    return [
        ...PHYSICS_FIELDS.map((name) => /** @type {any} */ ([name, world[name].constructor, world[name].length])),
        ['physicsParams', Int32Array, ARRAYS.length + WORDS.length],
        ['physicsDoubles', Float64Array, DOUBLES.length],
    ];
}

/**
 * Writes the physics parameter blocks: the offsets, the sizes and the config values the kernels read.
 * @param {import('./wasm-arena.js').Arena} arena the arena
 * @param {Record<string, any>} world the world the arena is for
 * @returns {void}
 */
export function writePhysicsParams(arena, world) {
    const { config, hash } = world;
    arena.views.physicsParams.set([
        ...ARRAYS.map((name) => arena.offsets[name]),
        config.maxAgents,
        world.obsX.length,
        OUTPUT_COUNT,
        OUTPUT_INDEX.SPRINT,
        hash.cols,
        hash.rows,
        config.maxContacts,
    ]);
    arena.views.physicsDoubles.set(DOUBLES.map((name) => config[name]));
}

/**
 * Damps, caps and moves every alive agent.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @returns {void}
 */
export function moveAgentsKernel(world) {
    const arena = world.wasm;
    arena.exports.move_agents(arena.offsets.physicsParams);
}

/**
 * Bounces one agent off the rocks from index `from`, testing each box with `own`.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @param {number} slot the alive agent
 * @param {number} own the agent's size when its rock scan began
 * @param {number} from the first rock to test
 * @returns {number} the rock the agent struck moving into it, or -1 when the scan is done
 */
export function bounceRocksKernel(world, slot, own, from) {
    const arena = world.wasm;
    return arena.exports.bounce_rocks(arena.offsets.physicsParams, slot, own, from);
}

/**
 * Resolves every overlapping agent pair over the arena's hash and clamps agents into the world.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @returns {number} the contact count, or -1 when there are more than `maxContacts`
 */
export function resolveContactsKernel(world) {
    const arena = world.wasm;
    return arena.exports.resolve_contacts(arena.offsets.physicsParams);
}
