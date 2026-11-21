// The per-slot lane arrays (docs/designs/body-genes.md, "The lane catalogue"): `world.lanes` holds one `Float64Array` per
// lane, written once per birth by `applyGenes`. Until a trait gene moves a lane (T32 and after) a lane holds its base.

import { LANES, LANE_COUNT, laneRowName, laneTable } from './body-lanes.js';
import { spanTable } from './body-traits.js';

/**
 * Allocates `world.lanes` and the per-spec base table for a world being built.
 * @param {Record<string, any>} world the world being built, its `agentRows` allocated
 * @returns {void}
 */
export function allocLanes(world) {
    const n = world.config.maxAgents;
    world.laneBases = laneTable(world.config);
    world.traitSpans = spanTable(world.config);
    world.laneArrays = LANES.map(() => new Float64Array(n));
    world.lanes = Object.fromEntries(LANES.map((lane, i) => [lane.name, world.laneArrays[i]]));
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
