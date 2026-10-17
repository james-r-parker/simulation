// One pass over an agent's ray block for the intent state: the nearest food hit, the nearest prey hit on an arc ray,
// the nearest threat (bigger-class hit) and whether the agent sits inside smoke. Reads the world, writes a scratch row.

import { RAY_CHANNELS } from '../sim/brain-layout.js';

/** Offsets in the scan row. Proximities are -1 when the ray block holds no such hit. */
export const SCAN = Object.freeze({
    FOOD: 0,
    FOOD_RAY: 1,
    PREY: 2,
    THREAT: 3,
    THREAT_RAY: 4,
    THREAT_ARC: 5,
    SMOKE: 6,
});

/** Length of the scan row. */
export const SCAN_SIZE = 7;

const CH_FOOD = 1;
const CH_BIGGER = 2;
const CH_SMALLER = 3;
const CH_SMOKE = 8;

/**
 * Keeps ray `k` as the nearest hit of a kind when its proximity is strictly higher than the best so far.
 * @param {Float64Array} scan the scan row
 * @param {number} at the proximity offset of the kind
 * @param {number} proximity the ray's proximity
 * @param {number} k the ray index
 * @returns {void}
 */
function nearer(scan, at, proximity, k) {
    if (proximity <= scan[at]) {
        return;
    }
    scan[at] = proximity;
    if (at === SCAN.FOOD || at === SCAN.THREAT) {
        scan[at + 1] = k;
    }
}

/**
 * Fills `scan` from the agent's rays.
 * @param {Float64Array} scan the scan row
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {Uint8Array} arc 1 for each arc ray
 * @returns {void}
 */
export function scanRays(scan, world, slot, arc) {
    scan.fill(-1);
    scan[SCAN.SMOKE] = 0;
    scan[SCAN.THREAT_ARC] = 0;
    const { inputs } = world;
    const origin = slot * world.layout.inputCount;
    for (let k = 0; k < world.config.rayCount; k++) {
        const base = origin + k * RAY_CHANNELS;
        const proximity = inputs[base];
        if (inputs[base + CH_FOOD] === 1) {
            nearer(scan, SCAN.FOOD, proximity, k);
        } else if (inputs[base + CH_BIGGER] === 1) {
            nearer(scan, SCAN.THREAT, proximity, k);
            scan[SCAN.THREAT_ARC] = Math.max(scan[SCAN.THREAT_ARC], arc[k]);
        } else if (inputs[base + CH_SMALLER] === 1 && arc[k] === 1) {
            nearer(scan, SCAN.PREY, proximity, k);
        } else if (inputs[base + CH_SMOKE] === 1 && proximity === 1) {
            scan[SCAN.SMOKE] = 1;
        }
    }
}
