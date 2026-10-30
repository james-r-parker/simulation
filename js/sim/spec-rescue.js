// Counts the alive agents of each specialisation, for the map-elites seeder.

/** The number of specialisations. */
export const SPEC_COUNT = 5;

/**
 * Counts the alive agents of each specialisation into `counts`, leaving out `slot`.
 * @param {Record<string, any>} world the world
 * @param {number} slot the slot not counted (being filled)
 * @param {Int32Array} out one entry per specialisation, overwritten
 * @returns {void}
 */
export function countSpecs(world, slot, out) {
    out.fill(0);
    for (let i = 0; i < world.alive.length; i++) {
        if (world.alive[i] === 1 && i !== slot) {
            out[world.spec[i]] += 1;
        }
    }
}
