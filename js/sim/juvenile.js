// The juvenile test (realistic-keepers.md T4): a `canHunt` body below `juvenileTicks` is a juvenile. The `juvenile` effect
// (effect-list.js) reads it: the burn it puts on the cost lanes and the plant meal `shareOf` in feeding.js allows.
// No RNG, no allocation.

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent slot
 * @returns {boolean} whether the body hunts and is younger than `juvenileTicks`
 */
export function isJuvenile(world, slot) {
    return world.huntBySpec[world.spec[slot]] === 1 && world.ageTicks[slot] < world.config.juvenileTicks;
}
