// The pheromone update in the WASM kernels (docs/designs/wasm-kernels.md, Phase 4): one `update_pheromones` call decays
// and diffuses the danger, attack and hunt grids in the arena, bit-identical to the JS grid loops it replaced. Deposits
// and samples are single-cell rules and stay in JS (`js/sim/pheromones.js`), reading the same arena views.

/** World fields the field kernel reads and writes, taken over by the arena at their allocated type and length. */
export const FIELD_FIELDS = Object.freeze(['danger', 'attack', 'hunt', 'pheromoneScratch']);

/** Words of the field parameter block: the four grids' byte offsets, then `cols` and `rows` (`FieldParams`). */
const PARAM_WORDS = FIELD_FIELDS.length + 2;

/**
 * @param {Record<string, any>} world the world, its fields not yet in an arena
 * @returns {import('./wasm-arena.js').ArenaSpec[]} the three grids and the scratch at their own type and length, then
 *   the parameter block
 */
export function fieldSpecs(world) {
    return [
        ...FIELD_FIELDS.map((name) => /** @type {any} */ ([name, world[name].constructor, world[name].length])),
        ['fieldParams', Int32Array, PARAM_WORDS],
    ];
}

/**
 * Writes the field parameter block: the grids' offsets and the grid shape.
 * @param {import('./wasm-arena.js').Arena} arena the arena
 * @param {Record<string, any>} world the world the arena is for
 * @returns {void}
 */
export function writeFieldParams(arena, world) {
    const { cols, rows } = world.pheromoneGrid;
    arena.views.fieldParams.set([...FIELD_FIELDS.map((name) => arena.offsets[name]), cols, rows]);
}

/**
 * Decays then diffuses the danger, attack and hunt grids in the kernel.
 * @param {Record<string, any>} world a world on the WASM kernels
 * @returns {void}
 */
export function updatePheromonesKernel(world) {
    const arena = world.wasm;
    const { pheromoneDecay, pheromoneDiffusion } = world.config;
    arena.exports.update_pheromones(arena.offsets.fieldParams, pheromoneDecay, pheromoneDiffusion);
}
