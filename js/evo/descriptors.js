// The archive descriptors (fitness-and-selection.md "Archive"): the two numbers in 0..1 that place a dying agent in
// a cell of its specialisation's grid. A policy names its descriptor and `createArchive` stores it, so an archive
// built under one descriptor is never read under another (`archive-codec.js` rejects the mismatch).
//
// A descriptor reads the death-log row of the agent (the observer keeps the row after the sim frees the slot, so a
// slot refilled in the same tick does not matter) and, for `descriptorV1`, the life counters. `point` writes the two
// values into `out` and allocates nothing.

import { crowdingMean } from './life-counters.js';

/**
 * @typedef {object} DescriptorSource
 * @property {Record<string, any>} deaths the observer's death log
 * @property {number} row the death-log row of the dying agent
 * @property {Record<string, any>} counters the policy's life counters
 * @property {number} slot the dying agent's slot in the life counters
 */

/**
 * @typedef {object} Descriptor
 * @property {string} name the name the archive JSON stores
 * @property {(source: DescriptorSource, out: Float64Array) => void} point writes the x and y values, each 0..1
 */

/** The size trait plus the vision trait at their lowest, the origin of `bodyPlan` (each trait is 0.7 to 1.3). */
const BODY_PLAN_MIN = 1.4;
/** The range of the sum of the two traits, 1.4 to 2.6. */
const BODY_PLAN_SPAN = 1.2;

/**
 * @param {number} deliberate deliberate food plus deliberate bite energy
 * @param {number} chance chance food plus chance bite energy
 * @returns {number} the deliberate share of intake, 0 when both are 0
 */
export function roleSkillOf(deliberate, chance) {
    const total = deliberate + chance;
    return total > 0 ? deliberate / total : 0;
}

/**
 * @param {number} size the size trait as a multiple of the default
 * @param {number} vision the vision trait as a multiple of the default
 * @param {boolean} traitsEnabled whether the config has traits on
 * @returns {number} `(size + vision - 1.4) / 1.2` clamped to 0..1; 0.5 with traits off
 */
export function bodyPlanOf(size, vision, traitsEnabled) {
    if (!traitsEnabled) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, (size + vision - BODY_PLAN_MIN) / BODY_PLAN_SPAN));
}

/** The current pair: `speedMean` (x) and `crowdingMean` (y). */
export const descriptorV1 = Object.freeze({
    name: 'v1',
    /** @type {Descriptor['point']} */
    point({ deaths, row, counters, slot }, out) {
        out[0] = deaths.samples[row] === 0 ? 0 : Math.min(1, deaths.speedSum[row] / deaths.samples[row]);
        out[1] = crowdingMean(counters, slot);
    },
});

/** The deliberate share of intake (x) and the body plan (y), both written to the death log by the observer. */
export const descriptorV6 = Object.freeze({
    name: 'v6',
    /** @type {Descriptor['point']} */
    point({ deaths, row }, out) {
        out[0] = deaths.roleSkill[row];
        out[1] = deaths.bodyPlan[row];
    },
});

/** The registered descriptors by name, for a policy option that names one. */
export const DESCRIPTORS = Object.freeze({ v1: descriptorV1, v6: descriptorV6 });
