// Where each part of a snapshot starts. The header gives the counts; the parts follow the agents in a fixed order.

import { AGENT_STRIDE, HEADER_WORDS } from './interpolate.js';

export const FOOD_STRIDE = 6;
export const PATCH_STRIDE = 5;
export const OBSTACLE_STRIDE = 3;
export const CLOUD_STRIDE = 3;
export const HERD_STRIDE = 5;

/**
 * @typedef {object} Sections
 * @property {number} agentCount
 * @property {number} foodStart word offset of the first food record
 * @property {number} foodCount
 * @property {number} obstacleStart
 * @property {number} obstacleCount
 * @property {number} cloudStart
 * @property {number} cloudCount
 * @property {number} patchStart
 * @property {number} patchCount
 * @property {number} herdStart
 * @property {number} herdCount
 * @property {number} rayStart word offset of the ray part
 * @property {number} rayCount rays written per agent, 0 when the part is absent
 */

/**
 * @returns {Sections} zeroed sections to pass to `readSections`
 */
export function createSections() {
    return {
        agentCount: 0,
        foodStart: 0,
        foodCount: 0,
        obstacleStart: 0,
        obstacleCount: 0,
        cloudStart: 0,
        cloudCount: 0,
        patchStart: 0,
        patchCount: 0,
        herdStart: 0,
        herdCount: 0,
        rayStart: 0,
        rayCount: 0,
    };
}

/**
 * Reads the part offsets from a snapshot's header into `out`.
 * @param {Uint32Array} u32 the snapshot's word view
 * @param {Sections} out the sections to fill
 * @returns {Sections} `out`
 */
export function readSections(u32, out) {
    out.agentCount = u32[1];
    out.foodCount = u32[2];
    out.obstacleCount = u32[3];
    out.cloudCount = u32[4];
    out.rayCount = u32[5];
    out.foodStart = HEADER_WORDS + out.agentCount * AGENT_STRIDE;
    out.obstacleStart = out.foodStart + out.foodCount * FOOD_STRIDE;
    out.cloudStart = out.obstacleStart + out.obstacleCount * OBSTACLE_STRIDE;
    out.patchStart = out.cloudStart + out.cloudCount * CLOUD_STRIDE;
    out.patchCount = u32[6];
    out.herdStart = out.patchStart + out.patchCount * PATCH_STRIDE;
    out.herdCount = u32[7];
    out.rayStart = out.herdStart + out.herdCount * HERD_STRIDE;
    return out;
}
