// The ground: a world-space surface under everything, so the world has a place and not an empty black. Broad soft
// swells of the season's tint with faint contour lines, fixed to the world so they slide as the camera pans and
// zooms (the aurora, by contrast, is fixed to the screen). Drawn with the `terrain` look item: at most
// `GROUND_PEAK` x the aurora luminance, so it stays under the scenery ceiling.

import { BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial } from 'three';
import { auroraTint } from './aurora-tint.js';
import { NOISE_GLSL } from './noise-glsl.js';

/** The brightest the ground gets, as a share of the aurora's luminance ceiling. */
export const GROUND_PEAK = 0.85;

const VERTEX = /* glsl */ `
varying vec2 vWorld;
void main() {
    vWorld = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uPeak;
uniform float uDetail;
varying vec2 vWorld;
${NOISE_GLSL}
void main() {
    float swell = fbm2(vWorld * 0.0011);
    float height = fbm2(vWorld * 0.0024 + 31.7);
    float lines = 1.0 - smoothstep(0.0, 0.05, abs(fract(height * 9.0) - 0.5) * 2.0 - 0.9);
    float fine = uDetail * (valueNoise(vWorld * 0.02) - 0.5) * 0.25;
    float level = clamp(0.25 + 0.75 * swell + 0.25 * lines * uDetail + fine, 0.0, 1.0);
    gl_FragColor = vec4(uTint * (uPeak * level), 1.0);
}
`;

/**
 * @param {number} w the world width
 * @param {number} h the world height
 * @returns {any} a quad over the world, three floats a position because `ShaderMaterial` declares `position` itself
 */
function worldQuad(w, h) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, w, 0, 0, w, h, 0, 0, 0, 0, w, h, 0, 0, h, 0], 3),
    );
    return geometry;
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} the ground layer
 */
export function createGroundLayer({ info }) {
    const uniforms = { uTint: { value: new Float32Array(3) }, uPeak: { value: GROUND_PEAK }, uDetail: { value: 1 } };
    const geometry = worldQuad(info.worldWidth, info.worldHeight);
    const material = new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        depthTest: false,
        depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    return {
        object: mesh,
        setLook(look) {
            const tier = look.terrain ?? 0;
            mesh.visible = tier >= 0 && tier < 2;
            uniforms.uDetail.value = tier === 0 ? 1 : 0;
        },
        update(frame) {
            auroraTint(frame.season, frame.seasonProgress, uniforms.uTint.value);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
