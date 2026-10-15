// Kinship between two agents: parent and child, or siblings sharing a parent.

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} child a slot
 * @param {number} parent a slot
 * @returns {boolean} true when `parent`'s genome is a parent of `child`
 */
function isParentOf(world, child, parent) {
    return world.parentA[child] === world.genomeId[parent] || world.parentB[child] === world.genomeId[parent];
}

/**
 * @param {World} world the world
 * @param {number} a a slot
 * @param {number} b another slot
 * @returns {boolean} true when they share a non-zero parent id
 */
function shareParent(world, a, b) {
    const { parentA, parentB } = world;
    const pa = parentA[a];
    const pb = parentB[a];
    return (
        (pa !== 0 && (pa === parentA[b] || pa === parentB[b])) || (pb !== 0 && (pb === parentA[b] || pb === parentB[b]))
    );
}

/**
 * @param {World} world the world
 * @param {number} a an agent slot
 * @param {number} b another agent slot
 * @returns {boolean} true when one is the other's parent, or they share a non-zero parent id
 */
export function isKin(world, a, b) {
    if (a === b) {
        return false;
    }
    return isParentOf(world, a, b) || isParentOf(world, b, a) || shareParent(world, a, b);
}
