// The crisp agents: one instanced mesh per specialisation, each drawn by its catalogue model's material. `packAgents`
// fills the buckets and `rigBucket` adds the display colours, gates and rig channels; this module owns only the GPU
// objects and the uniforms (rim width, the scent lens dim).

import { Group } from 'three/webgpu';
import { attribute, uniform } from 'three/tsl';
import { minPxTable } from '../display-size.js';
import { appLog } from '../app-log.js';
import { createAgentStore, packAgents } from './agents-pack.js';
import { createAgentRig, rigBucket } from './agent-rig.js';
import { bakeClips } from './clip-sampler.js';
import { CLIPS } from './clips.js';
import { temperatureBands } from './colors.js';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { modelMaterial } from './model-material.js';
import { standardInputs } from './model-meshes.js';
import { modelFor } from './models.js';
import { FILL_SHARE, RIM_PX } from './palette.js';

/** How far the scent lens dims the agents. */
export const SCENT_DIM = 0.55;
/** The least opacity of a calling agent's ring while the calls lens is on. */
export const CALL_RING_FLOOR = 0.5;
const RIG_NAMES = /** @type {const} */ (['neon', 'rig0', 'rig1', 'rig2', 'gate', 'gate2', 'accent', 'call']);

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
 * @param {{dim: any, ringFloor: any}} uniforms the scent-lens dim and the calls-lens ring floor
 * @returns {import('./model-material.js').ModelInputs} the agent inputs, read from the instance attributes
 */
function agentInputs({ dim, ringFloor }) {
    const gate = attribute('iGate', 'vec4');
    const gate2 = attribute('iGate2', 'vec4');
    return {
        ...standardInputs(),
        values: {
            pregnant: gate.x,
            sick: gate.y,
            infected: gate.z,
            pollen: gate.w,
            calling: gate2.x,
            inCover: gate2.y,
            gestation: gate2.z,
        },
        colors: { pollenColor: attribute('iAccent', 'vec4').xyz, callColor: attribute('iCall', 'vec4').xyz },
        dim,
        ringFloor,
    };
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {{store: import('./agents-pack.js').AgentStore, rig: ReturnType<typeof createAgentRig>,
 *   uniforms: {rimPx: any, dim: any, ringFloor: any}}} from the packed buckets, their rig arrays and the shared uniforms
 * @returns {{instances: import('./instances.js').Instances, material: any, mesh: any, hunter: boolean}[]} one mesh per
 *   spec over its bucket's arrays
 */
function buildMeshes(info, { store, rig, uniforms }) {
    const specs = /** @type {{name: string, canHunt: boolean}[]} */ (info.specs);
    return specs.map((spec, b) => {
        const model = modelFor(spec.name, (name) => appLog('warn', 'ModelMissing', { spec: name }));
        /** @type {Record<string, Float32Array>} */
        const shared = { iPose: store.buckets[b].pose };
        for (const name of RIG_NAMES) {
            shared[`i${name[0].toUpperCase()}${name.slice(1)}`] = rig.arrays[b][name];
        }
        const instances = createInstances(info.maxAgents, Object.keys(shared), shared);
        const look = { rimPx: uniforms.rimPx, fillShare: FILL_SHARE.default };
        const material = modelMaterial(model, { inputs: agentInputs(uniforms), look });
        return { instances, material, mesh: instancedMesh(instances, material), hunter: spec.canHunt };
    });
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {Record<string, number>} flags `ready.layout.flags`
 * @param {Record<string, number>} stateBits `ready.layout.stateBits`
 * @returns {import('./agent-rig.js').RigContext} the rig context, rewritten each frame
 */
function rigContext(info, flags, stateBits) {
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
    };
}

/**
 * @param {{info: Record<string, any>, flagBits: Record<string, number>, stateBits: Record<string, number>}} context
 *   `ready.info`, `ready.layout.flags` and `ready.layout.stateBits`
 * @returns {import('./stage.js').Layer & {store: import('./agents-pack.js').AgentStore}} the layer: one mesh per spec in
 *   a group, in `info.specs` order
 */
export function createAgentDraw({ info, flagBits, stateBits }) {
    const store = createAgentStore(info.maxAgents, info.specs.length, meshTable(info), minPxTable(info));
    const rig = createAgentRig(info.maxAgents, info.specs.length);
    const uniforms = { rimPx: uniform(RIM_PX.default), dim: uniform(1), ringFloor: uniform(0) };
    const meshes = buildMeshes(info, { store, rig, uniforms });
    const group = new Group();
    meshes.forEach((m) => group.add(m.mesh));
    const ctx = rigContext(info, flagBits, stateBits);
    const bands = temperatureBands(info);
    const view = { dtMs: 0, zoom: 1, slots: /** @type {any} */ (null), maxVelocity: info.maxVelocity, tick: 0 };
    const into = { rig, out: rig.arrays[0], ctx };
    return {
        object: group,
        store,
        update(frame) {
            view.dtMs = frame.dtMs;
            view.zoom = frame.camera.zoom;
            view.slots = frame.family;
            view.tick = frame.tick;
            packAgents(frame.agents, store, flagBits, view);
            ctx.timeSec = frame.nowMs / 1000;
            ctx.palette = frame.family.palette;
            ctx.temperatureLens = frame.lenses.temperature ? bands : null;
            uniforms.rimPx.value = RIM_PX[/** @type {keyof typeof RIM_PX} */ (frame.family.palette)];
            uniforms.dim.value = frame.lenses.scent ? SCENT_DIM : 1;
            uniforms.ringFloor.value = frame.lenses.calls ? CALL_RING_FLOOR : 0;
            for (let b = 0; b < meshes.length; b++) {
                ctx.hunter = meshes[b].hunter;
                into.out = rig.arrays[b];
                rigBucket(/** @type {any} */ (store.buckets[b]), frame.agents, into);
                uploadInstances(meshes[b].instances, store.buckets[b].count);
            }
        },
        dispose() {
            for (const m of meshes) {
                m.instances.geometry.dispose();
                m.material.dispose();
            }
        },
    };
}
