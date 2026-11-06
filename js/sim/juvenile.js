// The juvenile burn (hunter-learning.md T5): under `juvenileDependency` a `canHunt` body below `juvenileTicks` pays `juvenileBurn`
// of its standing, movement, turn and sprint cost, so a young hunter lasts longer between meals while it learns (a cub rests
// and is carried; it does not run the pack's miles). The flat `huntUpkeep` is not scaled. `tickCost` in energy.js multiplies by
// the factor, so at 1 (the switch off, an adult, a non-hunter) the cost is bit-identical. No RNG, no allocation.

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent slot
 * @returns {number} `juvenileBurn` for a `canHunt` body below `juvenileTicks` while `juvenileDependency` is on, else 1
 */
export function juvenileBurnOf(world, slot) {
    const { config } = world;
    if (!config.juvenileDependency || world.huntBySpec[world.spec[slot]] !== 1) {
        return 1;
    }
    return world.ageTicks[slot] < config.juvenileTicks ? config.juvenileBurn : 1;
}
