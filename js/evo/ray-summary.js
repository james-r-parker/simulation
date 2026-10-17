// One pass over an agent's ray block for the intent state: the nearest food hit, the nearest prey hit on an arc ray,
// the nearest threat hit (a "can bite me" hit, channel 2) and whether the agent sits inside smoke. Reads the world,
// writes a scratch row.

import { RAY_CHANNELS } from '../sim/brain-layout.js';
import { CH_THREAT, CH_FOOD, CH_PREY, CH_SMOKE } from './scripted-parts.js';

/** Offsets in the scan row. Proximities and rays are -1 when there is no such hit; `THREAT_ARC` is 0 then. */
export const SCAN = Object.freeze({
    FOOD: 0,
    FOOD_RAY: 1,
    PREY: 2,
    PREY_RAY: 3,
    THREAT: 4,
    THREAT_RAY: 5,
    THREAT_ARC: 6,
    SMOKE: 7,
});

/** Length of the scan row. */
export const SCAN_SIZE = 8;

/**
 * Keeps ray `k` as the nearest hit of a kind when its proximity is strictly higher than the best so far.
 * @param {Float64Array} out the scan row
 * @param {number} at the proximity offset of the kind; the ray goes at `at + 1`
 * @param {number} proximity the ray's proximity
 * @param {number} k the ray index
 * @returns {void}
 */
function nearer(out, at, proximity, k) {
    if (proximity > out[at]) {
        out[at] = proximity;
        out[at + 1] = k;
    }
}

/**
 * Fills `out` from the agent's rays.
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {Float64Array} out the scan row
 * @param {Uint8Array} arc 1 for each arc ray
 * @returns {void}
 */
export function summariseRays(world, slot, out, arc) {
    out.fill(-1);
    out[SCAN.SMOKE] = 0;
    out[SCAN.THREAT_ARC] = 0;
    const { inputs } = world;
    const origin = slot * world.layout.inputCount;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = origin + k * RAY_CHANNELS;
        if (inputs[base + CH_FOOD] === 1) {
            nearer(out, SCAN.FOOD, inputs[base], k);
        } else if (inputs[base + CH_THREAT] > 0) {
            nearer(out, SCAN.THREAT, inputs[base], k);
        } else if (inputs[base + CH_PREY] > 0 && arc[k] === 1) {
            nearer(out, SCAN.PREY, inputs[base], k);
        } else if (inputs[base + CH_SMOKE] === 1 && inputs[base] === 1) {
            out[SCAN.SMOKE] = 1;
        }
    }
    if (out[SCAN.THREAT_RAY] >= 0) {
        out[SCAN.THREAT_ARC] = arc[out[SCAN.THREAT_RAY]];
    }
}
