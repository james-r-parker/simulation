// Packs the interpolated agents into the five meshes' instance arrays, one bucket per specialisation. Pure: no GL, and
// nothing is allocated after `createAgentStore`.

import { lineageColor } from './colors.js';

/** Floats per vec4 attribute, and the attributes per instance: pose, colour, state and extra. */
export const ITEM = 4;
/** Ticks an ate or bitten flash lasts after the event. */
export const FLASH_TICKS = 12;
/** How fast the jaw eases open and shut, per second. */
export const JAW_RATE = 28;

/**
 * @typedef {object} Bucket
 * @property {Float32Array} pose x, y, angle, radius
 * @property {Float32Array} color linear r, g, b and energy01
 * @property {Float32Array} state temperature01, ate flash, bitten flash, jaw open
 * @property {Float32Array} extra pregnant, then 3 reserved
 * @property {number} count agents packed this frame
 */

/**
 * @typedef {object} AgentStore
 * @property {Bucket[]} buckets one per mesh
 * @property {Float32Array} jaw each slot's jaw openness, 0 to 1
 * @property {Int8Array} meshOfSpec the mesh index for each `spec`, -1 for an unknown one
 * @property {number[]} rgb scratch for the colour
 */

/**
 * @param {number} capacity the most agents (`maxAgents`)
 * @param {number} meshCount how many buckets
 * @param {ArrayLike<number>} meshOfSpec the mesh index for each specialisation index
 * @returns {AgentStore} an empty store
 */
export function createAgentStore(capacity, meshCount, meshOfSpec) {
    const buckets = [];
    for (let i = 0; i < meshCount; i++) {
        buckets.push({
            pose: new Float32Array(capacity * ITEM),
            color: new Float32Array(capacity * ITEM),
            state: new Float32Array(capacity * ITEM),
            extra: new Float32Array(capacity * ITEM),
            count: 0,
        });
    }
    return { buckets, jaw: new Float32Array(capacity), meshOfSpec: Int8Array.from(meshOfSpec), rgb: [0, 0, 0] };
}

/**
 * @param {number} timer an ate or bitten timer (0 to the cap, 1 on the tick of the event)
 * @returns {number} the flash strength, 1 just after the event and 0 from `FLASH_TICKS` on
 */
export function flashOf(timer) {
    return timer >= FLASH_TICKS ? 0 : 1 - timer / FLASH_TICKS;
}

/**
 * Writes every agent into its mesh's bucket and smooths the jaws.
 * @param {import('../interpolate.js').Interpolated} agents the blended agents
 * @param {AgentStore} store the store
 * @param {Record<string, number>} bits `ready.layout.flags`
 * @param {number} dtMs the frame time
 * @returns {void}
 */
export function packAgents(agents, store, bits, dtMs) {
    for (const bucket of store.buckets) {
        bucket.count = 0;
    }
    const ease = 1 - Math.exp((-JAW_RATE * dtMs) / 1000);
    for (let i = 0; i < agents.count; i++) {
        const mesh = store.meshOfSpec[agents.spec[i]];
        const bucket = store.buckets[mesh];
        if (bucket === undefined) {
            continue;
        }
        const flags = agents.flags[i];
        const slot = agents.slot[i];
        const target = (flags & bits.JAW_OPEN) !== 0 ? 1 : 0;
        store.jaw[slot] += (target - store.jaw[slot]) * ease;
        const o = bucket.count * ITEM;
        bucket.count += 1;
        const rgb = lineageColor(agents.lineageId[i], agents.energy[i], store.rgb);
        bucket.pose[o] = agents.x[i];
        bucket.pose[o + 1] = agents.y[i];
        bucket.pose[o + 2] = agents.angle[i];
        bucket.pose[o + 3] = agents.size[i];
        bucket.color[o] = rgb[0];
        bucket.color[o + 1] = rgb[1];
        bucket.color[o + 2] = rgb[2];
        bucket.color[o + 3] = agents.energy[i];
        bucket.state[o] = agents.temperature[i];
        bucket.state[o + 1] = flashOf((flags >> bits.ATE_SHIFT) & bits.TIMER_MASK);
        bucket.state[o + 2] = flashOf((flags >> bits.BITTEN_SHIFT) & bits.TIMER_MASK);
        bucket.state[o + 3] = store.jaw[slot];
        bucket.extra[o] = (flags & bits.PREGNANT) !== 0 ? 1 : 0;
    }
}
