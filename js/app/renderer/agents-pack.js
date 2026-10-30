// Packs the interpolated agents into the five meshes' instance arrays, one bucket per specialisation. Pure: no GL, and
// nothing is allocated after `createAgentStore`.

import { drawnRadius } from '../display-size.js';
import { slotOf } from '../family-slots.js';
import { ENERGY_FLOOR, familyColor, lineageColor } from './colors.js';

/** Floats per vec4 attribute, and the attributes per instance: pose, colour, state, extra and motion. */
export const ITEM = 4;
/** Ticks an ate or bitten flash lasts after the event. */
export const FLASH_TICKS = 12;
/** How fast the jaw eases open and shut, per second. */
export const JAW_RATE = 28;
/** Full turn rate in radians per tick for clamping. */
export const TURN_FULL = 0.2;
/** Smoothing factor per frame for turn cues. */
export const MOTION_SMOOTHING = 0.25;
/** Golden ratio fractional multiplier for stable phase. */
export const PHI_FRAC = 0.6180339;

/** The brightness gain by mesh (the specialisation, in `info.specs` order): the predator is drawn hotter and brighter. */
export const MESH_GAIN = Object.freeze([1.6, 1, 1, 1, 1]);

/**
 * Gives an agent whose family holds no colour slot its lineage hue and its mesh's gain, dimmed by its energy like any
 * family colour. Does nothing for an agent with a slot, or under a palette other than the default.
 * @param {number[] | Float32Array} rgb the agent's colour, replaced for an unslotted agent
 * @param {{mesh: number, lineageId: number, neutral: boolean, energy01: number}} agent the agent
 * @returns {void}
 */
function colorUnslotted(rgb, { mesh, lineageId, neutral, energy01 }) {
    if (!neutral) {
        return;
    }
    lineageColor(lineageId, rgb);
    const k = (ENERGY_FLOOR + (1 - ENERGY_FLOOR) * Math.min(Math.max(energy01, 0), 1)) * (MESH_GAIN[mesh] ?? 1);
    rgb[0] *= k;
    rgb[1] *= k;
    rgb[2] *= k;
}

const COLOR_AGENT = { mesh: 0, lineageId: 0, neutral: false, energy01: 0 };
const MOTION = { speed01: 0, turn01: 0, phase: 0 };

/**
 * Pure helper for motion attributes calculation and clamping.
 *
 * @param {number} speedFrac speed divided by max velocity
 * @param {number} turn turn rate in radians per tick
 * @param {number} smoothedPrev previous smoothed turn
 * @param {number} genomeId genome identifier
 * @returns {{speed01: number, turn01: number, phase: number}} normalized motion attributes: one shared scratch,
 *   rewritten by the next call, so the per-agent loop allocates nothing
 */
export function motionOf(speedFrac, turn, smoothedPrev, genomeId) {
    const targetTurn = Math.max(0, Math.min(1, Math.abs(turn) / TURN_FULL));
    MOTION.speed01 = Math.max(0, Math.min(1, speedFrac));
    MOTION.turn01 = smoothedPrev + (targetTurn - smoothedPrev) * MOTION_SMOOTHING;
    MOTION.phase = genomeId * PHI_FRAC - Math.floor(genomeId * PHI_FRAC);
    return MOTION;
}

/**
 * @typedef {object} Bucket
 * @property {Float32Array} pose x, y, angle, radius
 * @property {Float32Array} color linear r, g, b and energy01
 * @property {Float32Array} state temperature01, ate flash, bitten flash, jaw open
 * @property {Float32Array} extra pregnant, neutral family (1 when the family holds no colour slot), then 2 reserved
 * @property {Float32Array} motion speed01, turn01, phase, 0
 * @property {number} count agents packed this frame
 */

/**
 * @typedef {object} AgentStore
 * @property {Bucket[]} buckets one per mesh
 * @property {Float32Array} jaw each slot's jaw openness, 0 to 1
 * @property {Float32Array} smoothedTurn each slot's smoothed turn rate
 * @property {Int8Array} meshOfSpec the mesh index for each `spec`, -1 for an unknown one
 * @property {Float32Array} minPx the least each mesh's agents are drawn across, in device px
 * @property {number[]} rgb scratch for the colour
 */

/**
 * @param {number} capacity the most agents (`maxAgents`)
 * @param {number} meshCount how many buckets
 * @param {ArrayLike<number>} meshOfSpec the mesh index for each specialisation index
 * @param {ArrayLike<number>} minPx the least each mesh's agents are drawn across, in device px
 * @returns {AgentStore} an empty store
 */
export function createAgentStore(capacity, meshCount, meshOfSpec, minPx) {
    const buckets = [];
    for (let i = 0; i < meshCount; i++) {
        buckets.push({
            pose: new Float32Array(capacity * ITEM),
            color: new Float32Array(capacity * ITEM),
            state: new Float32Array(capacity * ITEM),
            extra: new Float32Array(capacity * ITEM),
            motion: new Float32Array(capacity * ITEM),
            count: 0,
        });
    }
    return {
        buckets,
        jaw: new Float32Array(capacity),
        smoothedTurn: new Float32Array(capacity),
        meshOfSpec: Int8Array.from(meshOfSpec),
        minPx: Float32Array.from(minPx),
        rgb: [0, 0, 0],
    };
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
 * @param {{dtMs: number, zoom: number, slots: import('../family-slots.js').FamilySlots, maxVelocity?: number}} view
 * @returns {void}
 */
export function packAgents(agents, store, bits, { dtMs, zoom, slots, maxVelocity = 200 }) {
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
        const rgb = familyColor(slots, agents.lineageId[i], agents.energy[i], store.rgb);
        COLOR_AGENT.mesh = mesh;
        COLOR_AGENT.lineageId = agents.lineageId[i];
        COLOR_AGENT.neutral = slots.palette === 'default' && slotOf(slots, agents.lineageId[i]) < 0;
        COLOR_AGENT.energy01 = agents.energy[i];
        colorUnslotted(rgb, COLOR_AGENT);
        bucket.pose[o] = agents.x[i];
        bucket.pose[o + 1] = agents.y[i];
        bucket.pose[o + 2] = agents.angle[i];
        bucket.pose[o + 3] = drawnRadius(agents.size[i], store.minPx[mesh], zoom);
        bucket.color[o] = rgb[0];
        bucket.color[o + 1] = rgb[1];
        bucket.color[o + 2] = rgb[2];
        bucket.color[o + 3] = agents.energy[i];
        bucket.state[o] = agents.temperature[i];
        bucket.state[o + 1] = flashOf((flags >> bits.ATE_SHIFT) & bits.TIMER_MASK);
        bucket.state[o + 2] = flashOf((flags >> bits.BITTEN_SHIFT) & bits.TIMER_MASK);
        bucket.state[o + 3] = store.jaw[slot];
        bucket.extra[o] = (flags & bits.PREGNANT) !== 0 ? 1 : 0;
        bucket.extra[o + 1] = slotOf(slots, agents.lineageId[i]) < 0 ? 1 : 0;

        const m = motionOf(agents.speed[i] / maxVelocity, agents.turn[i], store.smoothedTurn[slot], agents.genomeId[i]);
        store.smoothedTurn[slot] = m.turn01;
        bucket.motion[o] = m.speed01;
        bucket.motion[o + 1] = m.turn01;
        bucket.motion[o + 2] = m.phase;
        bucket.motion[o + 3] = 0;
    }
}
