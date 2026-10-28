// `fitnessV6` (fitness-and-selection.md "Fitness v6"): skill over luck, lineage success, watchability and diversity.
//
//   positive = skill + BORN x children + gate x (lineage + watch)
//   fitness  = (positive - min(waste, WASTE_CAP x positive)) x diversityFactor
//
// This module only composes the four groups (`fitness-v6-skill.js`, `-lineage.js`, `-watch.js`, `-diversity.js`); each
// owns its terms. Pure and allocation-free per call: the closures are built once in `createFitnessV6`.
//
// The diversity factor reads `observer.niche[slot]` (the dying agent's niche) and `observer.nicheTally` (the tally
// `tallyNiches` keeps at checkpoints). Without a tally the factor is 1, so a policy that does not track niches still
// scores.

import { FITNESS_V6_SKILL, createSkillGroup } from './fitness-v6-skill.js';
import { FITNESS_V6_LINEAGE, createLineageGroup } from './fitness-v6-lineage.js';
import { FITNESS_V6_WATCH, createWatchGroup } from './fitness-v6-watch.js';
import { FITNESS_V6_DIVERSITY, createDiversityGroup } from './fitness-v6-diversity.js';

/** Every constant of the doc's table: the four groups' and `BORN`, the pay for a born child, ungated. */
export const FITNESS_V6 = Object.freeze({
    ...FITNESS_V6_SKILL,
    ...FITNESS_V6_LINEAGE,
    ...FITNESS_V6_WATCH,
    ...FITNESS_V6_DIVERSITY,
    BORN: 50,
});

/**
 * @param {Record<string, number>} constants one group's constants
 * @param {Record<string, number>} overrides the caller's overrides
 * @returns {Record<string, number>} the overrides that name one of the group's constants
 */
function pick(constants, overrides) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const key of Object.keys(constants)) {
        if (key in overrides) {
            out[key] = overrides[key];
        }
    }
    return out;
}

/**
 * Binds the life counters and the weights so `fitnessV6` fits the evals `fitness(observer, slot, config)` signature.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6` entries (a screen arm varies a weight)
 * @returns {((observer: any, slot: number, config: any) => number) & {weights: Record<string, number>}}
 */
export function createFitnessV6(counters, overrides = {}) {
    const unknown = Object.keys(overrides).filter((key) => !(key in FITNESS_V6));
    if (unknown.length > 0) {
        throw new Error(`createFitnessV6: unknown weight ${unknown.join(', ')}`);
    }
    const skill = createSkillGroup(counters, pick(FITNESS_V6_SKILL, overrides));
    const lineage = createLineageGroup(pick(FITNESS_V6_LINEAGE, overrides));
    const watch = createWatchGroup(pick(FITNESS_V6_WATCH, overrides));
    const diversity = createDiversityGroup(pick(FITNESS_V6_DIVERSITY, overrides));
    const born = overrides.BORN ?? FITNESS_V6.BORN;
    const weights = { ...skill.weights, ...lineage.weights, ...watch.weights, ...diversity.weights, BORN: born };
    /** @type {(observer: any, slot: number, config: any) => number} */
    const fitness = (observer, slot, config) => {
        const positive =
            skill.skill(observer, slot, config) +
            born * observer.children[slot] +
            skill.gate(observer, slot) * (lineage.lineage(observer, slot) + watch.watch(observer, slot));
        const net = skill.net(positive, skill.waste(observer, slot));
        const { nicheTally } = observer;
        return nicheTally === undefined ? net : net * diversity.factor(nicheTally, observer.niche[slot]);
    };
    return Object.assign(fitness, { weights });
}
