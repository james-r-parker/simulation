// The lineage group of `fitnessV6` (fitness-and-selection.md "Fitness v6"): matings, children that reached maturity
// and family longevity. Pure: it reads the observer's per-slot lineage counters (`observer-lineage-counters.js`, read at
// death) and allocates nothing per call. `fitness-v6.js` multiplies the sum by the skill gate (`createSkillGroup.gate`),
// as it does the watch group, so this module returns the ungated value.

/** The lineage constants of the doc's constants table, named so a change is one visible edit. */
export const FITNESS_V6_LINEAGE = Object.freeze({
    MATING: 100,
    MATURED: 250,
    FAMILY: 40,
    FAMILY_CAP: 10,
});

/**
 * Binds the weights to the lineage group's functions. `weights` is `FITNESS_V6_LINEAGE` merged with any overrides (a
 * screen arm varies a weight).
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6_LINEAGE` entries
 * @returns {{
 *   weights: Record<string, number>,
 *   mating: (observer: any, slot: number) => number,
 *   matured: (observer: any, slot: number) => number,
 *   family: (observer: any, slot: number) => number,
 *   lineage: (observer: any, slot: number) => number,
 * }}
 */
export function createLineageGroup(overrides) {
    const w = { ...FITNESS_V6_LINEAGE, ...overrides };
    /** @type {(observer: any, slot: number) => number} */
    const mating = (observer, slot) => w.MATING * observer.matings[slot];
    /** @type {(observer: any, slot: number) => number} */
    const matured = (observer, slot) => w.MATURED * observer.maturedChildren[slot];
    /** @type {(observer: any, slot: number) => number} */
    const family = (observer, slot) => w.FAMILY * Math.min(observer.descendantsAlive[slot], w.FAMILY_CAP);
    return {
        weights: w,
        mating,
        matured,
        family,
        lineage: (observer, slot) => mating(observer, slot) + matured(observer, slot) + family(observer, slot),
    };
}
