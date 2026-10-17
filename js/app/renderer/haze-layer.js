// The scent haze layer: one world quad textured by the previous and the newest `field`, cross-faded in the shader.

import {
    AdditiveBlending,
    ClampToEdgeWrapping,
    DataTexture,
    DataUtils,
    HalfFloatType,
    LinearFilter,
    Mesh,
    PlaneGeometry,
    RGBAFormat,
    ShaderMaterial,
} from 'three';
import { PALETTE } from './colors.js';
import { HAZE_FRAGMENT, HAZE_VERTEX } from './haze-layer-shader.js';

/**
 * The brightness ceiling of the haze, and under the scent lens: a fully saturated field adds at most this linear share
 * of its colour to the black background (about 15% once sRGB-encoded), so the abyss stays black and the haze is a veil.
 */
export const HAZE_CAP = 0.018;
export const HAZE_CAP_LENS = 0.07;
/** How long a new field takes to fade in, ms. */
export const FADE_MS = 250;
/** The saturation rate of `1 - exp(-RATE x value / pheromoneMax)`. */
export const SATURATION_RATE = 1.6;

/**
 * Converts the three grids of a `field` message into half-float texels: red is danger, green attack, blue hunt, each
 * through `1 - exp(-1.6 x value / pheromoneMax)`.
 * @param {Float32Array} field the danger, attack and hunt grids back to back, `cols x rows` each, row 0 at y = 0
 * @param {{cols: number, rows: number, pheromoneMax: number}} grid the grid
 * @param {Uint16Array} out `cols x rows x 4` half floats
 * @param {(value: number) => number} [toHalf] float to half-float bits; `DataUtils.toHalfFloat` by default
 * @returns {Uint16Array} `out`
 */
export function packField(field, grid, out, toHalf = DataUtils.toHalfFloat) {
    const cells = grid.cols * grid.rows;
    const scale = -SATURATION_RATE / grid.pheromoneMax;
    const one = toHalf(1);
    for (let i = 0; i < cells; i++) {
        out[i * 4] = toHalf(1 - Math.exp(scale * field[i]));
        out[i * 4 + 1] = toHalf(1 - Math.exp(scale * field[cells + i]));
        out[i * 4 + 2] = toHalf(1 - Math.exp(scale * field[2 * cells + i]));
        out[i * 4 + 3] = one;
    }
    return out;
}

/**
 * @param {number} startMs when the newest field arrived
 * @param {number} nowMs wall time
 * @returns {number} the cross-fade position, 0 to 1
 */
export function fadeAt(startMs, nowMs) {
    return Math.min(Math.max((nowMs - startMs) / FADE_MS, 0), 1);
}

/**
 * @param {{cols: number, rows: number}} grid the grid size
 * @returns {{texture: any, data: Uint16Array}} an empty half-float texture
 */
function createFieldTexture({ cols, rows }) {
    const data = new Uint16Array(cols * rows * 4);
    const texture = new DataTexture(data, cols, rows, RGBAFormat, HalfFloatType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return { texture, data };
}

/**
 * @param {Record<string, any>} info `ready.info`
 * @param {{texture: any}[]} slots the two field textures
 * @returns {Record<string, {value: any}>} the haze uniforms
 */
function hazeUniforms(info, slots) {
    return {
        uPrev: { value: slots[1].texture },
        uNext: { value: slots[0].texture },
        uMix: { value: 1 },
        uCap: { value: HAZE_CAP },
        uTime: { value: 0 },
        uWorld: { value: [info.worldWidth, info.worldHeight] },
        uDanger: { value: PALETTE.dangerScent },
        uAttack: { value: PALETTE.attackScent },
        uHunt: { value: PALETTE.huntScent },
    };
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer & {pushField: (field: Float32Array, nowMs: number) => void}} the haze layer;
 *   `pushField` packs a newly arrived field into the older texture and starts the fade (the caller then returns the
 *   field's buffer)
 */
export function createHazeLayer({ info }) {
    const grid = /** @type {{cols: number, rows: number, pheromoneMax: number}} */ (/** @type {unknown} */ (info));
    const slots = [createFieldTexture(grid), createFieldTexture(grid)];
    let newest = 0;
    let startMs = -Infinity;
    const uniforms = hazeUniforms(info, slots);
    const geometry = new PlaneGeometry(1, 1);
    const material = new ShaderMaterial({
        vertexShader: HAZE_VERTEX,
        fragmentShader: HAZE_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    return {
        object: mesh,
        pushField(field, nowMs) {
            const target = 1 - newest;
            packField(field, grid, slots[target].data);
            slots[target].texture.needsUpdate = true;
            uniforms.uPrev.value = slots[newest].texture;
            uniforms.uNext.value = slots[target].texture;
            newest = target;
            startMs = nowMs;
        },
        update(frame) {
            uniforms.uMix.value = fadeAt(startMs, frame.nowMs);
            uniforms.uTime.value = frame.nowMs / 1000;
            uniforms.uCap.value = frame.lenses.scent ? HAZE_CAP_LENS : HAZE_CAP;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            slots.forEach((s) => s.texture.dispose());
        },
    };
}
