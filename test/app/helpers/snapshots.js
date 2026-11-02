// Hand-built app-test snapshots that follow the serialized protocol in js/sim/snapshot.js.

import { AGENT_FIELD, AGENT_STRIDE, HEADER_WORDS } from '../../../js/app/interpolate.js';
import { HERD_STRIDE, ZONE_STRIDE } from '../../../js/app/snapshot-view.js';

/**
 * @typedef {object} AgentSpec
 * @property {number} slot
 * @property {number} genomeId
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [angle]
 * @property {number} [size]
 * @property {number} [energy]
 * @property {number} [temperature]
 * @property {number} [speed]
 * @property {number} [spec]
 * @property {number} [lineageId]
 * @property {number} [flags]
 */

/**
 * @param {number} tick the tick
 * @param {AgentSpec[]} agents the agents, ascending by slot
 * @param {{foods?: number[][], clouds?: number[][], obstacles?: number[][], herds?: number[][], zones?: number[][]}} [extra] snapshot records
 * @returns {{tick: number, buffer: ArrayBuffer, u32: Uint32Array, f32: Float32Array}} a snapshot
 */
export function makeSnapshot(tick, agents, extra = {}) {
    const { foods = [], clouds = [], obstacles = [], herds = [], zones = [] } = extra;
    const words =
        HEADER_WORDS +
        agents.length * AGENT_STRIDE +
        foods.length * 6 +
        (clouds.length + obstacles.length) * 3 +
        herds.length * HERD_STRIDE +
        zones.length * ZONE_STRIDE;
    const buffer = new ArrayBuffer(words * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    u32[0] = tick;
    u32[1] = agents.length;
    u32[2] = foods.length;
    u32[3] = obstacles.length;
    u32[4] = clouds.length;
    u32[7] = herds.length;
    u32[8] = zones.length;
    agents.forEach((a, i) => {
        const w = HEADER_WORDS + i * AGENT_STRIDE;
        f32[w + AGENT_FIELD.X] = a.x ?? 0;
        f32[w + AGENT_FIELD.Y] = a.y ?? 0;
        f32[w + AGENT_FIELD.ANGLE] = a.angle ?? 0;
        f32[w + AGENT_FIELD.SIZE] = a.size ?? 20;
        f32[w + AGENT_FIELD.ENERGY] = a.energy ?? 0.5;
        u32[w + AGENT_FIELD.SPEC] = a.spec ?? 0;
        u32[w + AGENT_FIELD.LINEAGE] = a.lineageId ?? 1;
        u32[w + AGENT_FIELD.GENOME] = a.genomeId;
        u32[w + AGENT_FIELD.SLOT] = a.slot;
        f32[w + AGENT_FIELD.TEMPERATURE] = a.temperature ?? 0.5;
        f32[w + AGENT_FIELD.SPEED] = a.speed ?? 0;
        u32[w + AGENT_FIELD.FLAGS] = a.flags ?? 0;
    });
    let w = HEADER_WORDS + agents.length * AGENT_STRIDE;
    for (const row of foods) {
        f32.set(row, w);
        w += 6;
    }
    for (const row of [...obstacles, ...clouds]) {
        f32.set(row, w);
        w += 3;
    }
    for (const row of herds) {
        f32.set(row.slice(0, 5), w);
        u32[w + 5] = row[5] ?? 0;
        w += HERD_STRIDE;
    }
    for (const row of zones) {
        f32.set(row.slice(0, 3), w);
        u32[w + 3] = row[3] ?? 0;
        w += ZONE_STRIDE;
    }
    return { tick, buffer, u32, f32 };
}
