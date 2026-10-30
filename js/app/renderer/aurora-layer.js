// The animated seasonal aurora background layer: 3 vertical Gaussian ribbons rendered to an
// offscreen target and upsampled with Jimenez interleaved noise dither.

import {
    Camera,
    LinearFilter,
    Mesh,
    PlaneGeometry,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    UnsignedByteType,
    WebGLRenderTarget,
} from 'three';
import { RIBBON_GLSL } from './aurora-ribbon.js';
import { auroraGain, auroraPhase, auroraTint } from './aurora-tint.js';
import { FINISH_NOISE_GLSL } from './finish-glsl.js';
import { NOISE_GLSL } from './noise-glsl.js';

const RIBBON_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uPhases;
varying vec2 vUv;
${NOISE_GLSL}
${RIBBON_GLSL}
void main() {
    float intensity = ribbonAt(vUv, 0.0, uPhases.x) + ribbonAt(vUv, 1.0, uPhases.y) + ribbonAt(vUv, 2.0, uPhases.z);
    gl_FragColor = vec4(min(intensity, 1.0), 0.0, 0.0, 1.0);
}
`;

const AURORA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The tint is the display colour of the ribbon at gain 1, so the largest value written is the ceiling. The dither is one
// 8-bit sRGB step at the value, so the banding that the encode would make breaks up into noise. Where the ribbons are
// absent nothing is written and the frame keeps its black clear colour.
const AURORA_FRAGMENT = /* glsl */ `
uniform sampler2D uRibbons;
uniform vec3 uTint;
uniform float uGain;
uniform float uFrame;
varying vec2 vUv;
${FINISH_NOISE_GLSL}
vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 fromSrgb(vec3 e) {
    return mix(e / 12.92, pow((e + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), e));
}
void main() {
    float ribbon = texture2D(uRibbons, vUv).r;
    if (ribbon < 0.002) {
        discard;
    }
    vec3 linear = uTint * (ribbon * uGain);
    vec3 step8 = fromSrgb(toSrgb(linear) + 1.0 / 255.0) - linear;
    float dither = interleavedNoise(gl_FragCoord.xy, uFrame) - 0.5;
    gl_FragColor = vec4(max(linear + dither * step8, 0.0), 1.0);
}
`;

/**
 * Creates the offscreen ribbon rendering setup.
 */
function createRibbonRig() {
    const uniforms = { uPhases: { value: [0, 0, 0] } };
    const mat = new ShaderMaterial({
        vertexShader: RIBBON_VERTEX,
        fragmentShader: RIBBON_FRAGMENT,
        uniforms,
        depthTest: false,
        depthWrite: false,
    });
    const geom = new PlaneGeometry(2, 2);
    const mesh = new Mesh(geom, mat);
    const scene = new Scene();
    scene.add(mesh);
    const camera = new Camera();
    return { uniforms, mat, geom, scene, camera };
}

/**
 * Creates the fullscreen upsample mesh and uniforms.
 * @param {any} target offscreen render target
 */
function createUpsampleMesh(target) {
    const upsampleUniforms = {
        uRibbons: { value: target.texture },
        uTint: { value: [0, 0, 0] },
        uGain: { value: 1 },
        uFrame: { value: 0 },
    };
    const upsampleMat = new ShaderMaterial({
        vertexShader: AURORA_VERTEX,
        fragmentShader: AURORA_FRAGMENT,
        uniforms: upsampleUniforms,
        depthTest: false,
        depthWrite: false,
    });
    const worldGeom = new PlaneGeometry(2, 2);
    const worldMesh = new Mesh(worldGeom, upsampleMat);
    worldMesh.frustumCulled = false;
    return { worldMesh, worldGeom, upsampleMat, upsampleUniforms };
}

/**
 * @param {any} renderer
 * @param {any} target
 * @param {any} scene
 * @param {any} camera
 */
function renderRibbons(renderer, target, scene, camera) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
}

/**
 * @param {any} target
 * @param {any} ribbonRig
 * @param {any} worldGeom
 * @param {any} upsampleMat
 */
function disposeAurora(target, ribbonRig, worldGeom, upsampleMat) {
    target.dispose();
    ribbonRig.geom.dispose();
    ribbonRig.mat.dispose();
    worldGeom.dispose();
    upsampleMat.dispose();
}

/**
 * @param {{info?: Record<string, any>}} [_options] layer options
 * @returns {import('./scene.js').Layer} aurora layer
 */
export function createAuroraLayer(_options = {}) {
    void _options;
    let divisor = 4;
    let tier = 0;
    let frameNum = 0;
    let canvasW = 1920;
    let canvasH = 1080;

    const target = new WebGLRenderTarget(Math.ceil(canvasW / divisor), Math.ceil(canvasH / divisor), {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        type: UnsignedByteType,
        depthBuffer: false,
    });

    const ribbonRig = createRibbonRig();
    const { worldMesh, worldGeom, upsampleMat, upsampleUniforms } = createUpsampleMesh(target);
    worldMesh.visible = false;
    const scratch = { phases: new Float32Array(3), tint: new Float32Array(3) };

    return {
        object: worldMesh,
        setLook(look) {
            tier = look.aurora === 0 ? 0 : look.aurora === 1 ? 1 : 2;
            divisor = tier === 1 ? 8 : 4;
            worldMesh.visible = tier < 2;
            target.setSize(Math.ceil(canvasW / divisor), Math.ceil(canvasH / divisor));
        },
        resize(w, h) {
            canvasW = w;
            canvasH = h;
            target.setSize(Math.ceil(w / divisor), Math.ceil(h / divisor));
        },
        update(frame) {
            frameNum += 1;
            upsampleUniforms.uFrame.value = frameNum;
            const t = frame.nowMs * 0.001;
            ribbonRig.uniforms.uPhases.value = /** @type {any} */ (auroraPhase(t, scratch.phases));
            upsampleUniforms.uTint.value = /** @type {any} */ (
                auroraTint(frame.season, frame.seasonProgress, scratch.tint)
            );
            upsampleUniforms.uGain.value = auroraGain(t);
        },
        prerender(renderer) {
            if (tier < 2 && (tier === 0 || frameNum % 2 === 0)) {
                renderRibbons(renderer, target, ribbonRig.scene, ribbonRig.camera);
            }
        },
        dispose: () => disposeAurora(target, ribbonRig, worldGeom, upsampleMat),
    };
}
