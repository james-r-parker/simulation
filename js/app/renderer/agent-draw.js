// The crisp agents: one instanced mesh per specialisation, each drawn by its catalogue model's material. The pack worker
// (docs/designs/pack-worker.md) blends, packs and rigs the agents into a frame slot as interleaved instance rows; this
// module owns only the GPU objects and the uniforms (rim width, the scent lens dim), and copies each bucket's rows from
// the slot the frame drew into its mesh's own buffer.

import { Group } from 'three/webgpu';
import { attribute, max, min, mix, uniform, vec3 } from 'three/tsl';
import { appLog } from '../app-log.js';
import { SLOT } from '../pack/frame-slots.js';
import { AGENT_LANES } from './agent-lanes.js';
import { createInstances, instancedMesh, takeRows } from './instances.js';
import { modelMaterial } from './model-material.js';
import { standardInputs } from './model-meshes.js';
import { modelFor } from './models.js';
import { FILL_SHARE, NEON, RIM_PX } from './palette.js';

/** How far the scent lens dims the agents. */
export const SCENT_DIM = 0.55;
/** The least opacity of a calling agent's ring while the calls lens is on. */
export const CALL_RING_FLOOR = 0.5;

/**
 * @param {{dim: any, ringFloor: any}} uniforms the scent-lens dim and the calls-lens ring floor
 * @returns {import('./model-material.js').ModelInputs} the agent inputs, read from the instance attributes
 */
function agentInputs({ dim, ringFloor }) {
    const gate = attribute('iGate', 'vec4');
    const gate2 = attribute('iGate2', 'vec4');
    const call = attribute('iCall', 'vec4');
    const dent = attribute('iDent', 'vec4');
    const standard = standardInputs();
    // the dent lane's fourth value is a dying body's tear (0 to 1: the colour drains to rot as the membrane opens) plus
    // its fade (1 to 2: the opacity falls); a live body holds 0
    const drain = min(dent.w, 1);
    return {
        ...standard,
        color: mix(standard.color, vec3(NEON.rot[0], NEON.rot[1], NEON.rot[2]), drain),
        values: {
            pregnant: gate.x,
            sick: gate.y,
            infected: gate.z,
            pollen: gate.w,
            calling: gate2.x,
            inCover: gate2.y,
            gestation: gate2.z,
            wave: gate2.w,
            thrust: call.w,
        },
        colors: { pollenColor: attribute('iAccent', 'vec4').xyz, callColor: call.xyz },
        dent: { angle: dent.x, depth: dent.y, width: dent.z },
        fade: max(dent.w.sub(1), 0),
        dim,
        ringFloor,
    };
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {{rimPx: any, dim: any, ringFloor: any}} uniforms the shared uniforms
 * @returns {{instances: import('./instances.js').Instances, material: any, mesh: any}[]} one mesh per spec, over its
 *   own buffer (the rows arrive interleaved from the pack worker, so it has no lanes)
 */
function buildMeshes(info, uniforms) {
    const specs = /** @type {{name: string}[]} */ (info.specs);
    return specs.map((spec) => {
        const model = modelFor(spec.name, (name) => appLog('warn', 'ModelMissing', { spec: name }));
        const instances = createInstances(info.maxAgents, AGENT_LANES, {}, { lanes: false });
        const look = { rimPx: uniforms.rimPx, fillShare: FILL_SHARE.default };
        const material = modelMaterial(model, { inputs: agentInputs(uniforms), look });
        return { instances, material, mesh: instancedMesh(instances, material) };
    });
}

/**
 * Sets the frame's values on the shared uniforms.
 * @param {import('./stage.js').Frame} frame the frame
 * @param {{rimPx: any, dim: any, ringFloor: any}} uniforms the shared uniforms
 * @returns {void}
 */
function applyFrame(frame, uniforms) {
    uniforms.rimPx.value = RIM_PX[/** @type {keyof typeof RIM_PX} */ (frame.family.palette)];
    uniforms.dim.value = frame.lenses.scent ? SCENT_DIM : 1;
    uniforms.ringFloor.value = frame.lenses.calls ? CALL_RING_FLOOR : 0;
}

/** No rows: a mesh with nothing to draw before the worker's first frame. */
const NO_ROWS = new Float32Array(0);

/**
 * Copies each bucket's rows from the frame slot into its mesh and marks them for upload, once per new slot.
 * @param {import('./stage.js').Frame} frame the frame
 * @param {{meshes: {instances: any}[], seen: {seq: number}}} layer the meshes and the request last copied
 * @returns {void}
 */
function takeSlotRows(frame, { meshes, seen }) {
    const slot = frame.packed;
    if (slot === null) {
        if (seen.seq !== 0) {
            seen.seq = 0;
            meshes.forEach((m) => takeRows(m.instances, NO_ROWS, 0));
        }
        return;
    }
    if (frame.packedSeq === seen.seq) {
        return;
    }
    seen.seq = frame.packedSeq;
    for (let b = 0; b < meshes.length; b++) {
        takeRows(meshes[b].instances, slot.rows[b], slot.head[SLOT.BUCKETS + b]);
    }
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./stage.js').Layer} the layer: one mesh per spec in a group, in `info.specs` order
 */
export function createAgentDraw({ info }) {
    const uniforms = { rimPx: uniform(RIM_PX.default), dim: uniform(1), ringFloor: uniform(0) };
    const meshes = buildMeshes(info, uniforms);
    const group = new Group();
    meshes.forEach((m) => group.add(m.mesh));
    const layer = { meshes, seen: { seq: 0 } };
    return {
        object: group,
        update(frame) {
            applyFrame(frame, uniforms);
            takeSlotRows(frame, layer);
        },
        dispose() {
            for (const m of meshes) {
                m.instances.geometry.dispose();
                m.material.dispose();
            }
        },
    };
}
