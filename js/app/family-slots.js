// Which of the eight colour slots each top family holds. A family keeps its slot until it leaves the top 12; each
// top-8 family without a slot then takes the lowest free one, in rank order; a family that finds none stays neutral
// until a slot frees. Sticky slots keep a family's colour from changing as the ranking shuffles.

/** Colour slots. */
export const FAMILY_SLOTS = 8;

/**
 * @typedef {object} FamilySlots
 * @property {Int32Array} ids the family (lineage) id in each slot, -1 for a free slot
 * @property {string} palette the palette name, `default`, `cvd-safe` or `high-contrast`
 * @property {number} version a counter that changes whenever an assignment does
 * @property {{id: number}[]} top the latest `stats.lineages.top` ranking
 */

/**
 * @param {string} [palette] the palette name
 * @returns {FamilySlots} slots with every slot free
 */
export function createFamilySlots(palette = 'default') {
    return { ids: new Int32Array(FAMILY_SLOTS).fill(-1), palette, version: 0, top: [] };
}

/**
 * @param {FamilySlots} slots the slots
 * @param {number} lineageId a family
 * @returns {number} the slot it holds, -1 when it holds none
 */
export function slotOf(slots, lineageId) {
    for (let s = 0; s < FAMILY_SLOTS; s++) {
        if (slots.ids[s] === lineageId) {
            return s;
        }
    }
    return -1;
}

/**
 * @param {{id: number}[]} top the families by rank
 * @param {number} lineageId a family
 * @returns {boolean} whether it is in the list
 */
function inList(top, lineageId) {
    for (let i = 0; i < top.length; i++) {
        if (top[i].id === lineageId) {
            return true;
        }
    }
    return false;
}

/**
 * @param {FamilySlots} slots the slots
 * @returns {number} the lowest free slot, -1 when there is none
 */
function lowestFree(slots) {
    for (let s = 0; s < FAMILY_SLOTS; s++) {
        if (slots.ids[s] < 0) {
            return s;
        }
    }
    return -1;
}

/**
 * Updates the slots from the newest ranking. Runs on every `stats` message.
 * @param {FamilySlots} slots the slots, changed in place
 * @param {{id: number}[]} top the top families by rank (the stats' `lineages.top`, up to 12)
 * @returns {boolean} whether any slot changed hands
 */
export function assignSlots(slots, top) {
    slots.top = top;
    let changed = false;
    for (let s = 0; s < FAMILY_SLOTS; s++) {
        if (slots.ids[s] >= 0 && !inList(top, slots.ids[s])) {
            slots.ids[s] = -1;
            changed = true;
        }
    }
    for (let i = 0; i < Math.min(top.length, FAMILY_SLOTS); i++) {
        const free = slotOf(slots, top[i].id) < 0 ? lowestFree(slots) : -1;
        if (free >= 0) {
            slots.ids[free] = top[i].id;
            changed = true;
        }
    }
    if (changed) {
        slots.version += 1;
    }
    return changed;
}
