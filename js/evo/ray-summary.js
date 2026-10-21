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

/** Ray kinds `rayKind` returns; each of the first three keeps its nearest hit in `best`. */
const FOOD = 0;
const THREAT = 1;
const PREY = 2;
const SMOKE = 3;
const NONE = -1;

/** Nearest proximity and ray per kind (`2 x kind` and `2 x kind + 1`), reused by every call. */
const best = new Float64Array(6);

/**
 * @param {Float64Array} inputs the world's inputs
 * @param {number} base the ray's first channel
 * @param {number} onArc 1 when the ray is an arc ray
 * @returns {number} the kind of the ray's hit, or `NONE`
 */
function rayKind(inputs, base, onArc) {
    if (inputs[base + CH_FOOD] === 1) {
        return FOOD;
    }
    if (inputs[base + CH_THREAT] > 0) {
        return THREAT;
    }
    if (inputs[base + CH_PREY] > 0 && onArc === 1) {
        return PREY;
    }
    return inputs[base + CH_SMOKE] === 1 && inputs[base] === 1 ? SMOKE : NONE;
}

/**
 * Fills `out` from the agent's rays. The nearest food, threat and prey hits are kept in `best` and written once, so
 * the pass touches `out` eight times and never calls `fill`.
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
    best.fill(-1);
    let smoke = 0;
    for (let k = 0; k < rayCount; k++) {
        const base = origin + k * RAY_CHANNELS;
        const kind = rayKind(inputs, base, arc[k]);
        if (kind === SMOKE) {
            smoke = 1;
        } else if (kind !== NONE && inputs[base] > best[2 * kind]) {
            best[2 * kind] = inputs[base];
            best[2 * kind + 1] = k;
        }
    }
    out[SCAN.FOOD] = best[0];
    out[SCAN.FOOD_RAY] = best[1];
    out[SCAN.THREAT] = best[2];
    out[SCAN.THREAT_RAY] = best[3];
    out[SCAN.PREY] = best[4];
    out[SCAN.PREY_RAY] = best[5];
    out[SCAN.THREAT_ARC] = best[3] >= 0 ? arc[best[3]] : 0;
    out[SCAN.SMOKE] = smoke;
}
