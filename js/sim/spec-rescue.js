// Picks a specialisation that has no alive agent, for the population floor and the map-elites seeder.

import { nextInt } from './rng.js';

/** The number of specialisations. */
export const SPEC_COUNT = 5;

const counts = new Int32Array(SPEC_COUNT);
const empty = new Int32Array(SPEC_COUNT);

/**
 * Draws one of the specialisations with 0 alive agents, uniformly, from `rng`.
 * @param {Record<string, any>} world the world; `slot` is already allocated, so it is not counted
 * @param {number} slot the slot being seeded
 * @param {import('./rng.js').Rng} rng the stream to draw from; untouched when no specialisation is at 0
 * @returns {number} the specialisation index, or -1 when every specialisation has an alive agent
 */
export function pickEmptySpec(world, slot, rng) {
    counts.fill(0);
    for (let i = 0; i < world.alive.length; i++) {
        if (world.alive[i] === 1 && i !== slot) {
            counts[world.spec[i]] += 1;
        }
    }
    let found = 0;
    for (let spec = 0; spec < SPEC_COUNT; spec++) {
        if (counts[spec] === 0) {
            empty[found] = spec;
            found += 1;
        }
    }
    return found === 0 ? -1 : empty[nextInt(rng, found)];
}
