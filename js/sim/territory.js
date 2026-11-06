// Hunter territory (hunter-learning T9d): a breeding limit on hunter density, off by default.

/** @typedef {import('./world.js').World} World */

/**
 * @param {World} world the world
 * @param {number} slot an alive agent that is otherwise ready to breed
 * @returns {boolean} false when `hunterTerritory` is on, the slot's specialisation `canHunt` and more than
 *   `territoryMax` other alive, mature `canHunt` agents lie within `territoryRadius` (centre distance, no wrap, as in
 *   mate search); true otherwise. Stops scanning once the count passes the limit.
 */
export function territoryAllows(world, slot) {
    const { hunterTerritory, territoryRadius, territoryMax, maturityTicks } = world.config;
    if (!hunterTerritory || world.huntBySpec[world.spec[slot]] !== 1) {
        return true;
    }
    const { alive, spec, ageTicks, huntBySpec, x, y } = world;
    const limit = territoryRadius * territoryRadius;
    let count = 0;
    for (let other = 0; other < alive.length; other++) {
        if (other === slot || alive[other] !== 1 || huntBySpec[spec[other]] !== 1 || ageTicks[other] < maturityTicks) {
            continue;
        }
        const dx = x[other] - x[slot];
        const dy = y[other] - y[slot];
        if (dx * dx + dy * dy <= limit && ++count > territoryMax) {
            return false;
        }
    }
    return true;
}
