// One pass over an agent's ray block for the intent state: the nearest food hit, the nearest prey hit on an arc ray,
// how many rays hit something bigger, and whether the agent sits inside smoke. Reads the world, writes a scratch row.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { CH_BIGGER, CH_FOOD, CH_SMALLER, CH_SMOKE } from './scripted-parts.js';

/** Offsets in the scan row. Proximities and rays are -1 when there is no such hit; `THREAT*` come from `resolveThreat`. */
export const SCAN = Object.freeze({
    FOOD: 0,
    FOOD_RAY: 1,
    PREY: 2,
    PREY_RAY: 3,
    BIGGER: 4,
    SMOKE: 5,
    THREAT: 6,
    THREAT_RAY: 7,
    THREAT_ARC: 8,
});

/** Length of the scan row. */
export const SCAN_SIZE = 9;

/**
 * Fills `out` from the agent's rays (the threat fields are cleared for `resolveThreat`). The nearest food and prey
 * hits are kept in locals and written once, so the pass touches `out` nine times and never calls `fill`.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {Float64Array} out the scan row
 * @param {Uint8Array} arc 1 for each arc ray
 * @returns {void}
 */
export function summariseRays(world, slot, out, arc) {
    const { inputs } = world;
    const rayCount = world.config.rayCount;
    const origin = slot * world.layout.inputCount;
    let foodP = -1;
    let foodK = -1;
    let preyP = -1;
    let preyK = -1;
    let bigger = 0;
    let smoke = 0;
    for (let k = 0; k < rayCount; k++) {
        const base = origin + k * RAY_CHANNELS;
        if (inputs[base + CH_FOOD] === 1) {
            if (inputs[base] > foodP) {
                foodP = inputs[base];
                foodK = k;
            }
        } else if (inputs[base + CH_BIGGER] === 1) {
            bigger += 1;
        } else if (inputs[base + CH_SMALLER] === 1 && arc[k] === 1) {
            if (inputs[base] > preyP) {
                preyP = inputs[base];
                preyK = k;
            }
        } else if (inputs[base + CH_SMOKE] === 1 && inputs[base] === 1) {
            smoke = 1;
        }
    }
    out[SCAN.FOOD] = foodP;
    out[SCAN.FOOD_RAY] = foodK;
    out[SCAN.PREY] = preyP;
    out[SCAN.PREY_RAY] = preyK;
    out[SCAN.BIGGER] = bigger;
    out[SCAN.SMOKE] = smoke;
    out[SCAN.THREAT] = -1;
    out[SCAN.THREAT_RAY] = -1;
    out[SCAN.THREAT_ARC] = 0;
}
