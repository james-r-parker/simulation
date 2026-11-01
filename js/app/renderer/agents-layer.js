// The agents: five `InstancedMesh`, one per specialisation, each a quad drawn by the shared agent shader with its own
// silhouette. Instance data comes from `packAgents`; this module only owns the GPU objects.

import {
    ClampToEdgeWrapping,
    CustomBlending,
    DataTexture,
    FloatType,
    LinearFilter,
    OneFactor,
    RGBAFormat,
    ShaderMaterial,
    Group,
    Vector4,
} from 'three';
import { viewBounds } from '../camera.js';
import { minPxTable } from '../display-size.js';
import { AGENT_FRAGMENT, AGENT_VERTEX } from './agents-shader.js';
import { createQuadGeometry, createQuadMesh, uploadInstances } from './instanced.js';
import { createAgentStore, packAgents } from './agents-pack.js';
import { temperatureBands, temperatureRamp } from './colors.js';

/** The silhouette (shader `uShape`) of each specialisation name; an unknown name draws as a disc. */
export const SILHOUETTES = Object.freeze({ predator: 0, forager: 1, reproducer: 2, scout: 3, defender: 4 });
const FALLBACK_SHAPE = SILHOUETTES.forager;
const RAMP_TEXELS = 64;
/** Dimming of agents under the scent lens. */
export const SCENT_DIM = 0.55;
const INSTANCED = ['iPose', 'iColor', 'iState', 'iExtra', 'iMotion'];

/**
 * @param {Record<string, any>} info `ready.info`
 * @returns {any} the temperature ramp as a one-row float texture
 */
function rampTexture(info) {
    const data = temperatureRamp(temperatureBands(info), new Float32Array(RAMP_TEXELS * 4));
    const texture = new DataTexture(data, RAMP_TEXELS, 1, RGBAFormat, FloatType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

/**
 * @param {{shape: number, hunter: boolean}} kind the silhouette id and whether the specialisation can hunt (it then
 *   has the nose notch and, when small, the hot tip)
 * @param {Record<string, any>} shared the uniforms every mesh shares
 * @returns {any} the material for one silhouette
 */
function agentMaterial({ shape, hunter }, shared) {
    return new ShaderMaterial({
        vertexShader: AGENT_VERTEX,
        fragmentShader: AGENT_FRAGMENT,
        uniforms: { ...shared, uShape: { value: shape }, uHunter: { value: hunter ? 1 : 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
    });
}

/**
 * @param {number} capacity the most agents
 * @param {{shape: number, hunter: boolean}} kind the silhouette id and whether the specialisation can hunt
 * @param {Record<string, any>} shared the shared uniforms
 * @returns {any} one mesh with its instance attributes
 */
function agentMesh(capacity, kind, shared) {
    return createQuadMesh(createQuadGeometry(capacity, INSTANCED), agentMaterial(kind, shared), capacity);
}

/**
 * @param {any} mesh the instanced mesh
 * @param {import('./agents-pack.js').Bucket} bucket the packed agents
 * @returns {void}
 */
function upload(mesh, bucket) {
    const { pose, color, state, extra, motion } = bucket;
    uploadInstances(mesh, { iPose: pose, iColor: color, iState: state, iExtra: extra, iMotion: motion }, bucket.count);
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @returns {number[]} the mesh index (position in `info.specs`) for each specialisation index, -1 where none
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
 * @param {Record<string, any>} info `ready.info`
 * @param {any} ramp the temperature ramp texture
 * @param {any} blank the texture standing in for the smoke until a smoke layer sets one
 * @returns {Record<string, {value: any}>} the uniforms every agent mesh shares
 */
function sharedUniforms(info, ramp, blank) {
    return {
        uZoom: { value: 1 },
        uTime: { value: 0 },
        uBiteArc: { value: info.biteArc },
        uTempLens: { value: 0 },
        uDim: { value: 1 },
        uPalette: { value: 0 },
        uRamp: { value: ramp },
        uSmoke: { value: blank },
        uMotion: { value: 1.0 },
        uFlora: { value: 1.0 },
        uSimTick: { value: 0 },
        uView: { value: new Vector4(0, 0, 1, 1) },
    };
}

const VIEW = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * @param {Record<string, {value: any}>} shared the shared uniforms
 * @param {import('./scene.js').Frame} frame the frame
 * @returns {void}
 */
function updateUniforms(shared, frame) {
    const { camera, lenses } = frame;
    const v = viewBounds(camera, VIEW);
    shared.uZoom.value = camera.zoom;
    shared.uSimTick.value = frame.tick;
    shared.uTime.value = frame.nowMs / 1000;
    shared.uTempLens.value = lenses.temperature ? 1 : 0;
    shared.uDim.value = lenses.scent ? SCENT_DIM : 1;
    shared.uPalette.value = frame.family.palette === 'high-contrast' ? 2 : 0;
    shared.uView.value.set(v.left, v.bottom, v.right - v.left, v.top - v.bottom);
}

/**
 * @param {{info: Record<string, any>, flagBits: Record<string, number>}} context `ready.info` and
 *   `ready.layout.flags`
 * @returns {import('./scene.js').Layer & {setSmokeTexture: (texture: any) => void, store: import('./agents-pack.js').AgentStore}}
 *   the layer: five meshes in a group, in `info.specs` order
 */
export function createAgentsLayer({ info, flagBits }) {
    const ramp = rampTexture(info);
    const blank = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    blank.needsUpdate = true;
    const shared = sharedUniforms(info, ramp, blank);
    const store = createAgentStore(info.maxAgents, info.specs.length, meshTable(info), minPxTable(info));
    const group = new Group();
    const specs = /** @type {{name: keyof typeof SILHOUETTES, canHunt: boolean}[]} */ (info.specs);
    const meshes = specs.map((spec) =>
        agentMesh(info.maxAgents, { shape: SILHOUETTES[spec.name] ?? FALLBACK_SHAPE, hunter: spec.canHunt }, shared),
    );
    meshes.forEach((mesh) => group.add(mesh));
    return {
        object: group,
        store,
        setLook(look) {
            const tier = /** @type {number} */ (look.motion);
            shared.uMotion.value = tier === 0 ? 1.0 : tier === 1 ? 0.5 : 0.0;
            shared.uFlora.value = look.flora === -1 ? 0 : 1;
        },
        setSmokeTexture(texture) {
            shared.uSmoke.value = texture;
        },
        update(frame) {
            updateUniforms(shared, frame);
            packAgents(frame.agents, store, flagBits, {
                dtMs: frame.dtMs,
                zoom: frame.camera.zoom,
                slots: frame.family,
                maxVelocity: info.maxVelocity,
            });
            for (let i = 0; i < meshes.length; i++) {
                upload(meshes[i], store.buckets[i]);
            }
        },
        dispose() {
            for (const mesh of meshes) {
                mesh.geometry.dispose();
                mesh.material.dispose();
                mesh.dispose();
            }
            ramp.dispose();
            blank.dispose();
        },
    };
}
