// A group of instanced meshes, one per catalogue model, each over its own bucket of preallocated arrays. Every bucket has
// `pose` (x, y, angle, radius) and `neon` (display r, g, b and fill share), and may have `rig0` to `rig2` and `gate`;
// `values` names what the gate's lanes mean to the model's parts. The layers for food, world marks, zones, motes and
// effect particles are built on it.

import { Group } from 'three/webgpu';
import { attribute, uniform, vec4 } from 'three/tsl';
import { createInstances, instancedMesh, uploadInstances } from './instances.js';
import { modelMaterial } from './model-material.js';
import { RIM_PX } from './palette.js';

/** The rest values of the three rig vec4 (`tx ty rot sx`, `sy open eye flash`, `ring ringAlpha limb head`). */
const REST = [
    [0, 0, 0, 1],
    [1, 0, 1, 0],
    [1, 1, 0, 0],
];
const NAMES = /** @type {const} */ ([
    ['pose', 'iPose'],
    ['neon', 'iNeon'],
    ['rig0', 'iRig0'],
    ['rig1', 'iRig1'],
    ['rig2', 'iRig2'],
    ['gate', 'iGate'],
    ['extra', 'iExtra'],
]);

/**
 * @typedef {object} Bucket
 * @property {Float32Array} pose
 * @property {Float32Array} neon
 * @property {Float32Array} [rig0]
 * @property {Float32Array} [rig1]
 * @property {Float32Array} [rig2]
 * @property {Float32Array} [gate]
 * @property {Float32Array} [extra]
 * @property {number} count
 */

/**
 * @param {Bucket} bucket a bucket
 * @param {(lanes: {gate: any, extra: any}) => {values?: Record<string, any>, colors?: Record<string, any>,
 *   blob?: any}} more the model-specific inputs from the gate and extra lanes
 * @returns {import('./model-material.js').ModelInputs} the inputs
 */
function inputsOf(bucket, more) {
    const pose = attribute('iPose', 'vec4');
    const neon = attribute('iNeon', 'vec4');
    const rig = [0, 1, 2].map((r) =>
        /** @type {any} */ (bucket)[`rig${r}`] === undefined ? vec4(...REST[r]) : attribute(`iRig${r}`, 'vec4'),
    );
    const lanes = {
        gate: bucket.gate === undefined ? vec4(0, 0, 0, 0) : attribute('iGate', 'vec4'),
        extra: bucket.extra === undefined ? vec4(0, 0, 0, 0) : attribute('iExtra', 'vec4'),
    };
    return { center: pose.xy, angle: pose.z, radius: pose.w, color: neon.xyz, fill: neon.w, rig, ...more(lanes) };
}

/**
 * @param {readonly {name: string, parts: readonly object[]}[]} models the models, one per bucket
 * @param {{capacity?: number, buckets: Bucket[], more?: (lanes: {gate: any, extra: any}) => Record<string, any>,
 *   blending?: number}} options the buckets (each mesh holds as many rows as its bucket's `pose`), the model-specific
 *   inputs and an optional blending
 * @returns {{object: any, rimPx: any, upload: () => void, clear: () => void, setPalette: (name: string) => void,
 *   dispose: () => void}} the group, the rim width uniform and the per-frame calls
 */
export function createModelMeshes(models, { buckets, more = () => ({}), blending }) {
    const rimPx = uniform(RIM_PX.default);
    const meshes = models.map((model, k) => {
        const bucket = buckets[k];
        /** @type {Record<string, Float32Array>} */
        const shared = {};
        for (const [key, name] of NAMES) {
            const array = /** @type {any} */ (bucket)[key];
            if (array !== undefined) {
                shared[name] = array;
            }
        }
        const instances = createInstances(bucket.pose.length / 4, Object.keys(shared), shared);
        const material = modelMaterial(model, { inputs: inputsOf(bucket, more), look: { rimPx, fillShare: 0.28 } });
        if (blending !== undefined) {
            material.blending = blending;
        }
        return { instances, material, mesh: instancedMesh(instances, material), bucket };
    });
    const object = new Group();
    meshes.forEach((m) => object.add(m.mesh));
    return {
        object,
        rimPx,
        upload() {
            for (const m of meshes) {
                uploadInstances(m.instances, m.bucket.count);
            }
        },
        clear() {
            for (const m of meshes) {
                uploadInstances(m.instances, 0);
            }
        },
        setPalette(name) {
            rimPx.value = RIM_PX[/** @type {keyof typeof RIM_PX} */ (name)] ?? RIM_PX.default;
        },
        dispose() {
            for (const m of meshes) {
                m.instances.geometry.dispose();
                m.material.dispose();
            }
        },
    };
}
