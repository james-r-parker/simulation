// The finish pass: subtle vignette and Jimenez grain drawn over the bloomed frame.
// Applied with premultiplied alpha blending: additive for positive grain, darkening for vignette + negative grain.

import {
    BufferGeometry,
    CustomBlending,
    Float32BufferAttribute,
    Mesh,
    OneFactor,
    OneMinusSrcAlphaFactor,
    ShaderMaterial,
    Vector2,
} from 'three';
import { FINISH_NOISE_GLSL } from './finish-glsl.js';
import { LOOK_OFF } from './quality.js';

export const FINISH = Object.freeze({
    vignette: 0.18,
    grain: 1.5 / 255,
});

/**
 * @param {number} min lower edge
 * @param {number} max upper edge
 * @param {number} x input value
 * @returns {number} smoothstep 0..1
 */
function smoothstep(min, max, x) {
    if (x <= min) {
        return 0;
    }
    if (x >= max) {
        return 1;
    }
    const t = (x - min) / (max - min);
    return t * t * (3 - 2 * t);
}

/**
 * JS reference evaluation of the vignette curve.
 * @param {number} r distance from the centre in canvas heights
 * @returns {number} vignette alpha in [0, FINISH.vignette]
 */
export function vignetteAt(r) {
    return FINISH.vignette * smoothstep(0.55, 1.2, 2 * Math.max(0, r));
}

const FINISH_VERTEX = /* glsl */ `
attribute vec3 position;
void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FINISH_FRAGMENT = /* glsl */ `
${FINISH_NOISE_GLSL}
uniform vec2 uResolution;
uniform float uFrame;
uniform float uVignette;
uniform float uGrain;

void main() {
    vec2 delta = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
    float dist = length(delta);
    float vignette = uVignette * smoothstep(0.55, 1.2, 2.0 * dist);

    float noise = interleavedNoise(gl_FragCoord.xy, uFrame);
    float g = (noise - 0.5) * 2.0 * uGrain;
    float gPos = max(0.0, g);
    float gNeg = max(0.0, -g);

    gl_FragColor = vec4(vec3(gPos), clamp(vignette + gNeg, 0.0, 1.0));
}
`;

/**
 * @param {Record<string, {value: any}>} uniforms shader uniforms
 * @returns {ShaderMaterial} the finish material
 */
function finishMaterial(uniforms) {
    return new ShaderMaterial({
        vertexShader: FINISH_VERTEX,
        fragmentShader: FINISH_FRAGMENT,
        uniforms,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
        premultipliedAlpha: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
}

/**
 * Creates the full-canvas finish layer.
 * @returns {import('./scene.js').Layer} the finish layer
 */
export function createFinishLayer() {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
        'position',
        new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3),
    );

    const uniforms = {
        uResolution: { value: new Vector2(1, 1) },
        uFrame: { value: 0 },
        uVignette: { value: FINISH.vignette },
        uGrain: { value: FINISH.grain },
    };

    const material = finishMaterial(uniforms);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;

    return {
        object: mesh,
        setLook(look) {
            const tier = look.finish;
            if (tier === LOOK_OFF) {
                mesh.visible = false;
                return;
            }
            mesh.visible = true;
            uniforms.uVignette.value = FINISH.vignette;
            uniforms.uGrain.value = tier === 0 ? FINISH.grain : 0;
        },
        resize(width, height) {
            uniforms.uResolution.value.set(width, height);
        },
        update() {
            uniforms.uFrame.value = (uniforms.uFrame.value + 1) % 1000000;
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
