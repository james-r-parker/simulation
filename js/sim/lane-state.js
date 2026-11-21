// The per-slot lane arrays (docs/designs/body-genes.md, "The lane catalogue"): `world.lanes` holds one `Float64Array` per
// lane, written once per birth by `applyGenes`: its base, times the ratios of the traits that name it. A lane a kernel
// reads is also a world field (`KERNEL_LANES`), so the arena takes it over like any other kernel array.

import { LANES, LANE_COUNT, laneMaxOverSpecs, laneOnForAnySpec, laneRowName, laneTable } from './body-lanes.js';
import { spanTable } from './body-traits.js';

/**
 * The lanes a WASM kernel reads, by lane name, to the world field that holds each (`PHYSICS_FIELDS` in
 * `js/sim/wasm-physics.js` names the field): `move_all` caps each agent's speed at its `maxVelocity` lane.
 * @type {Readonly<Record<string, string>>}
 */
export const KERNEL_LANES = Object.freeze({ maxVelocity: 'laneMaxVelocity' });

/**
 * Allocates `world.lanes` and the per-spec base table for a world being built.
 * @param {Record<string, any>} world the world being built, its `agentRows` allocated
 * @returns {void}
 */
export function allocLanes(world) {
    const n = world.config.maxAgents;
    world.laneBases = laneTable(world.config);
    world.strikesOn = laneOnForAnySpec(world.config, 'strikeMissCost');
    world.birthStride = laneMaxOverSpecs(world.config, 'maxBirthsPerWindow');
    world.traitSpans = spanTable(world.config);
    world.laneArrays = LANES.map(() => new Float64Array(n));
    world.lanes = Object.fromEntries(LANES.map((lane, i) => [lane.name, world.laneArrays[i]]));
    for (const [name, field] of Object.entries(KERNEL_LANES)) {
        world[field] = world.lanes[name];
    }
    LANES.forEach((lane, i) => {
        world.agentRows.push({ array: world.laneArrays[i], stride: 1, name: laneRowName(lane.name) });
    });
}

/**
 * Writes every lane of a slot at its specialisation's base. Allocates nothing.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot, its `spec` already set
 * @returns {void}
 */
export function writeLaneBases(world, slot) {
    const from = world.spec[slot] * LANE_COUNT;
    const { laneArrays, laneBases } = world;
    for (let i = 0; i < LANE_COUNT; i++) {
        laneArrays[i][slot] = laneBases[from + i];
    }
}

/**
 * Points `world.lanes` and `world.laneArrays` at the world fields of `KERNEL_LANES`, once the arena has replaced those
 * fields with its views (`attachWasm` in `js/sim/wasm-arena.js` repoints the `agentRows` entries itself).
 * @param {Record<string, any>} world the world, its kernel lane fields re-pointed
 * @returns {void}
 */
export function rebindKernelLanes(world) {
    for (const [name, field] of Object.entries(KERNEL_LANES)) {
        world.lanes[name] = world[field];
        world.laneArrays[LANES.findIndex((lane) => lane.name === name)] = world[field];
    }
}
