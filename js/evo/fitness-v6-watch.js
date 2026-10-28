// The watch group of `fitnessV6` (fitness-and-selection.md "Fitness v6"): chase, pack and migration, the terms that
// pay what is good to watch. Pure: it reads the observer's per-slot counters at death (`observer-watch-counters.js`)
// and allocates nothing per call. `fitness-v6.js` multiplies the sum by the skill gate
// (`createSkillGroup.gate`), as it does the lineage group, so this module returns the ungated value.

import { patchesVisitedOf } from './observer-watch-counters.js';

/** The watch constants of the doc's constants table, named so a change is one visible edit. */
export const FITNESS_V6_WATCH = Object.freeze({
    CHASE: 0.5,
    CHASE_CAP: 600,
    PACK: 30,
    MIGRATE: 40,
    MIGRATE_CAP: 8,
});

/**
 * Binds the weights to the watch group's functions. `weights` is `FITNESS_V6_WATCH` merged with any overrides (a screen
 * arm varies a weight).
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6_WATCH` entries
 * @returns {{
 *   weights: Record<string, number>,
 *   chase: (observer: any, slot: number) => number,
 *   pack: (observer: any, slot: number) => number,
 *   migrate: (observer: any, slot: number) => number,
 *   watch: (observer: any, slot: number) => number,
 * }}
 */
export function createWatchGroup(overrides) {
    const w = { ...FITNESS_V6_WATCH, ...overrides };
    /** @type {(observer: any, slot: number) => number} */
    const chase = (observer, slot) => w.CHASE * Math.min(observer.chaseTicks[slot], w.CHASE_CAP);
    /** @type {(observer: any, slot: number) => number} */
    const pack = (observer, slot) => w.PACK * observer.packKills[slot];
    /** @type {(observer: any, slot: number) => number} */
    const migrate = (observer, slot) => w.MIGRATE * Math.min(patchesVisitedOf(observer, slot), w.MIGRATE_CAP);
    return {
        weights: w,
        chase,
        pack,
        migrate,
        watch: (observer, slot) => chase(observer, slot) + pack(observer, slot) + migrate(observer, slot),
    };
}
