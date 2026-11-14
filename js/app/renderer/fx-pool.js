// The effect pool: one instanced mesh of fixed capacity whose instances animate on the GPU. `spawnFx` writes one instance
// into the next ring slot and widens the dirty range; the layer uploads only that range. A full pool overwrites its
// oldest slot. Ticks are stored relative to a base so a float32 keeps sub-tick precision on long runs.

import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, ShaderMaterial, Vector4 } from 'three';
import { setFxLook, setFxQuality } from './fx-budget.js';
import { curveUniforms } from './fx-curves.js';
import { FX_FRAGMENT, FX_VERTEX } from './fx-shader.js';
import { createQuadGeometry, createQuadMesh, VEC4 } from './instanced.js';
import {
    createFxPool,
    FX_CAPACITY,
    HIGH_CONTRAST_GAIN,
    isLive,
    occupancy,
    rebaseFx,
    REBASE_TICKS,
    spawnFx,
} from './fx-ring.js';

export { createFxPool, FX_CAPACITY, HIGH_CONTRAST_GAIN, isLive, occupancy, rebaseFx, REBASE_TICKS, spawnFx };

/** @typedef {import('./fx-ring.js').FxPool} FxPool */
/** @typedef {import('./fx-ring.js').FxRecord} FxRecord */

/** The active capacity at quality levels 0, 1 and 2. */
export const FX_CAPACITY_BY_LEVEL = Object.freeze([2048, 1024, 256]);

/**
 * @param {FxPool} pool the pool
 * @param {number} level the quality level, 0 to 2
 * @returns {void}
 */
export function setFxLevel(pool, level) {
    pool.limit = FX_CAPACITY_BY_LEVEL[level];
    if (pool.next >= pool.limit) {
        pool.next = 0;
    }
}

const ATTRIBUTES = /** @type {const} */ (['iPose', 'iColor', 'iTime', 'iMove']);

/**
 * Sends the dirty slots of each array to its attribute and clears the range.
 * @param {FxPool} pool the pool
 * @param {Record<string, any>} attributes the instance attributes by name
 * @returns {void}
 */
export function flushFx(pool, attributes) {
    if (pool.dirtyHi < pool.dirtyLo) {
        return;
    }
    const start = pool.dirtyLo * VEC4;
    const count = (pool.dirtyHi - pool.dirtyLo + 1) * VEC4;
    for (const name of ATTRIBUTES) {
        const attribute = attributes[name];
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(start, count);
        attribute.needsUpdate = true;
    }
    pool.dirtyLo = Infinity;
    pool.dirtyHi = -1;
}

/**
 * @returns {Record<string, {value: any}>} the pool shader's uniforms, the curve table as vec4 arrays
 */
function fxUniforms() {
    const tables = curveUniforms();
    const n = tables.scale.length / VEC4;
    const vecs = (/** @type {Float32Array} */ a) =>
        Array.from({ length: n }, (_, i) => new Vector4(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]));
    const uniforms = {
        uFxTick: { value: 0 },
        uZoom: { value: 1 },
        uCallBoost: { value: 1 },
        uContrast: { value: 1 },
        uScale: { value: vecs(tables.scale) },
        uAlpha: { value: vecs(tables.alpha) },
        uInfo: { value: vecs(tables.info) },
    };
    return uniforms;
}

/**
 * @param {{pool: FxPool, budget: import('./fx-budget.js').FxBudget}} options the pool the effects player spawns into
 *   and the budget that follows the quality level and the look items
 * @returns {import('./scene.js').Layer & {uniforms: Record<string, {value: any}>}} the pool's mesh, drawn additively
 */
export function createFxLayer({ pool, budget }) {
    const uniforms = fxUniforms();
    const geometry = createQuadGeometry(1, []);
    const arrays = { iPose: pool.pose, iColor: pool.color, iTime: pool.time, iMove: pool.move };
    for (const name of ATTRIBUTES) {
        geometry.setAttribute(name, new InstancedBufferAttribute(arrays[name], VEC4).setUsage(DynamicDrawUsage));
    }
    const material = new ShaderMaterial({
        vertexShader: FX_VERTEX,
        fragmentShader: FX_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = createQuadMesh(geometry, material, FX_CAPACITY);
    mesh.count = FX_CAPACITY;
    mesh.visible = true;
    return {
        object: mesh,
        uniforms,
        setQuality(level) {
            setFxLevel(pool, level);
            setFxQuality(budget, level);
        },
        setLook(look) {
            setFxLook(budget, look);
        },
        update(frame) {
            uniforms.uZoom.value = frame.camera.zoom;
            uniforms.uFxTick.value = Number.isNaN(pool.base) ? -1e9 : frame.tick + pool.clockOffset - pool.base;
            uniforms.uCallBoost.value = frame.lenses.calls ? 1 / 0.35 : 1;
            uniforms.uContrast.value = frame.family?.palette === 'high-contrast' ? HIGH_CONTRAST_GAIN : 1;
            flushFx(pool, geometry.attributes);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
            mesh.dispose();
        },
    };
}
