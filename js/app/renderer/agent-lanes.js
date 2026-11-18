// What the agent meshes read, named once for the pack worker (which fills it) and the agent layer (which draws it): the
// instance attributes in their interleaved order, the row size, the bucket of each specialisation and the rig context a
// bucket is rigged under. Pure: no three, no DOM.

import { bakeClips } from './clip-sampler.js';
import { CLIPS } from './clips.js';

/** The rig lanes after the pose, in `createAgentRig` order. */
export const RIG_NAMES = /** @type {const} */ ([
    'neon',
    'rig0',
    'rig1',
    'rig2',
    'gate',
    'gate2',
    'accent',
    'call',
    'dent',
]);

/** The instance attributes of an agent mesh in interleaved order: the pose, then each rig lane. */
export const AGENT_LANES = Object.freeze(['iPose', ...RIG_NAMES.map((n) => `i${n[0].toUpperCase()}${n.slice(1)}`)]);

/** Floats per vec4 attribute. */
const VEC4 = 4;
/** Floats in one interleaved agent row. */
export const AGENT_ROW_FLOATS = AGENT_LANES.length * VEC4;

/**
 * @param {Record<string, any>} info `ready.info`
 * @returns {number[]} the bucket index (position in `info.specs`) for each specialisation index, -1 where none
 */
export function meshTable(info) {
    const specs = /** @type {{index: number}[]} */ (info.specs);
    const table = new Array(Math.max(...specs.map((s) => s.index)) + 1).fill(-1);
    specs.forEach((s, i) => {
        table[s.index] = i;
    });
    return table;
}

/**
 * @param {{pose: Float32Array}} bucket a packed bucket
 * @param {Record<string, Float32Array>} rig the bucket's rig arrays
 * @returns {Float32Array[]} its lanes in `AGENT_LANES` order
 */
export function bucketLanes(bucket, rig) {
    return [bucket.pose, ...RIG_NAMES.map((name) => rig[name])];
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {Record<string, number>} flags `ready.layout.flags`
 * @param {Record<string, number>} stateBits `ready.layout.stateBits`
 * @returns {import('./agent-rig.js').RigContext} the rig context, rewritten each frame
 */
export function rigContext(info, flags, stateBits) {
    return {
        table: bakeClips(CLIPS),
        flags,
        stateBits,
        timeSec: 0,
        palette: 'default',
        hunter: false,
        stress: {
            cold01: info.temperatureColdStress / info.temperatureMax,
            heat01: info.temperatureHeatStress / info.temperatureMax,
        },
        temperatureLens: null,
        dents: null,
        tick: 0,
    };
}
