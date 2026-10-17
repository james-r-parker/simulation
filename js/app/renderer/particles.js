// The ambient motes: 700 faint points drifting inside the view, drawn after the bloom. Positions come from a
// per-point seed in the vertex shader, so nothing is updated per frame but one time uniform.

import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three';
import { createPrng } from '../prng.js';
import { PALETTE } from './colors.js';
import { QUALITY_LEVELS } from './quality.js';
import { MOTE_FRAGMENT, MOTE_VERTEX } from './particles-shader.js';

/** How many motes there are at full quality. */
export const MOTE_COUNT = 700;

/**
 * @param {number} count how many points
 * @param {number} seed the generator seed
 * @returns {Float32Array} `count x 4` seeds in [0, 1), the same for the same seed
 */
export function moteSeeds(count, seed) {
    const prng = createPrng(seed);
    const out = new Float32Array(count * 4);
    for (let i = 0; i < out.length; i++) {
        out[i] = prng.next();
    }
    return out;
}

/**
 * @param {number} level a quality level
 * @returns {number} how many motes it draws
 */
export function motesAt(level) {
    return Math.floor(MOTE_COUNT * QUALITY_LEVELS[Math.min(Math.max(level, 0), QUALITY_LEVELS.length - 1)].motes);
}

/**
 * @param {{seed?: number}} [options] `seed` for the mote positions
 * @returns {import('./scene.js').Layer} the motes
 */
export function createParticles({ seed = 1 } = {}) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3));
    geometry.setAttribute('seed', new Float32BufferAttribute(moteSeeds(MOTE_COUNT, seed), 4));
    const uniforms = { uTime: { value: 0 }, uPx: { value: 1 }, uColor: { value: PALETTE.mote } };
    const material = new ShaderMaterial({
        vertexShader: MOTE_VERTEX,
        fragmentShader: MOTE_FRAGMENT,
        uniforms,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    geometry.setDrawRange(0, MOTE_COUNT);
    return {
        object: points,
        update(frame) {
            uniforms.uTime.value = frame.nowMs / 1000;
        },
        setQuality: (level) => geometry.setDrawRange(0, motesAt(level)),
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
