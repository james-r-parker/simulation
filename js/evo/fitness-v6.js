// `fitnessV6` (fitness-and-selection.md "Fitness v6"): skill over luck, and lineage success.
//
//   positive = skill + BORN x children + gate x lineage
//   fitness  = positive - min(waste, WASTE_CAP x positive)
//
// Rarity is not paid (natural-selection.md rule 1): the archive's behaviour axis (`descriptorV7`) keeps a second way of
// living, so there is no diversity factor. This module only composes the two groups (`fitness-v6-skill.js` and
// `-lineage.js`); each owns its terms. Pure and allocation-free per call: the closures are built once in
// `createFitnessV6`.

import { FITNESS_V6_SKILL, createSkillGroup } from './fitness-v6-skill.js';
import { FITNESS_V6_LINEAGE, createLineageGroup } from './fitness-v6-lineage.js';

/** Every constant of the doc's table: the two groups' and `BORN`, the pay for a born child, ungated. */
export const FITNESS_V6 = Object.freeze({
    ...FITNESS_V6_SKILL,
    ...FITNESS_V6_LINEAGE,
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
 * @typedef {object} FitnessParts
 * @property {number} skill the skill group (intake, survival, role and credits), before waste
 * @property {number} waste the charge before its cap
 * @property {number} lineage the lineage group as paid (multiplied by the skill gate)
 */

/**
 * Binds the life counters and the weights so `fitnessV6` fits the evals `fitness(observer, slot, config)` signature.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6` entries (a screen arm varies a weight)
 * @returns {((observer: any, slot: number, config: any) => number) & {
 *   weights: Record<string, number>,
 *   parts: (observer: any, slot: number, config: any, out: FitnessParts) => FitnessParts,
 * }} the fitness, with `parts` filling `out` with what the last call paid, group by group (for diagnostics)
 */
export function createFitnessV6(counters, overrides = {}) {
    const unknown = Object.keys(overrides).filter((key) => !(key in FITNESS_V6));
    if (unknown.length > 0) {
        throw new Error(`createFitnessV6: unknown weight ${unknown.join(', ')}`);
    }
    const skill = createSkillGroup(counters, pick(FITNESS_V6_SKILL, overrides));
    const lineage = createLineageGroup(pick(FITNESS_V6_LINEAGE, overrides));
    const born = overrides.BORN ?? FITNESS_V6.BORN;
    const weights = { ...skill.weights, ...lineage.weights, BORN: born };
    /** @type {(observer: any, slot: number, config: any) => number} */
    const fitness = (observer, slot, config) => {
        const positive =
            skill.skill(observer, slot, config) +
            born * observer.children[slot] +
            skill.gate(observer, slot) * lineage.lineage(observer, slot);
        return skill.net(positive, skill.waste(observer, slot));
    };
    /** @type {(observer: any, slot: number, config: any, out: FitnessParts) => FitnessParts} */
    const parts = (observer, slot, config, out) => {
        const gate = skill.gate(observer, slot);
        out.skill = skill.skill(observer, slot, config);
        out.waste = skill.waste(observer, slot);
        out.lineage = gate * lineage.lineage(observer, slot);
        return out;
    };
    return Object.assign(fitness, { weights, parts });
}
