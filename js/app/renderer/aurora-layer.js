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
import { auroraGain, auroraPhase, auroraTint } from './aurora-tint.js';
import { FINISH_NOISE_GLSL } from './finish-glsl.js';
import { NOISE_GLSL } from './noise-glsl.js';

const RIBBON_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
}
`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uPhases;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
    float intensity = 0.0;
    for (int i = 0; i < 3; i++) {
        float p = uPhases[i];
        float idx = float(i);
        float center = 0.2 + 0.3 * idx + 0.18 * (fbm2(vec2(vUv.x * 2.5 + p, idx * 3.7)) - 0.5);
        float d = abs(vUv.x - center);
        float band = exp(-d * d * 55.0);
        float bright = 0.5 + 0.5 * valueNoise(vec2(vUv.y * 3.0 + p * 0.7, idx * 5.1));
        intensity += band * bright;
    }
    gl_FragColor = vec4(intensity, 0.0, 0.0, 1.0);
}
`;

const AURORA_VERTEX = /* glsl */ `
varying vec2 vUv;
uniform vec2 uWorld;
void main() {
    vUv = uv;
    vec2 pos = uv * uWorld;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 0.0, 1.0);
}
`;

const AURORA_FRAGMENT = /* glsl */ `
uniform sampler2D uRibbons;
uniform vec3 uTint;
uniform float uGain;
uniform float uFrame;
varying vec2 vUv;
${FINISH_NOISE_GLSL}
void main() {
    float intensity = texture2D(uRibbons, vUv).r;
    if (intensity <= 0.0001) {
        discard;
    }
    vec3 rgb = uTint * (intensity * uGain);
    float stepSize = max(0.0003, pow(max(max(rgb.r, rgb.g), rgb.b), 0.545) / 255.0);
    float dither = (interleavedNoise(gl_FragCoord.xy, uFrame) - 0.5) * stepSize;
    rgb += dither;
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
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
    const geom = new PlaneGeometry(1, 1);
    const mesh = new Mesh(geom, mat);
    const scene = new Scene();
    scene.add(mesh);
    const camera = new Camera();
    return { uniforms, mat, geom, scene, camera };
}

/**
 * Creates the fullscreen upsample mesh and uniforms.
 * @param {WebGLRenderTarget} target offscreen render target
 * @param {Record<string, any>} info ready.info
 */
function createUpsampleMesh(target, info) {
    const upsampleUniforms = {
        uRibbons: { value: target.texture },
        uTint: { value: [0, 0, 0] },
        uGain: { value: 1 },
        uFrame: { value: 0 },
        uWorld: { value: [info.worldWidth, info.worldHeight] },
    };
    const upsampleMat = new ShaderMaterial({
        vertexShader: AURORA_VERTEX,
        fragmentShader: AURORA_FRAGMENT,
        uniforms: upsampleUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });
    const worldGeom = new PlaneGeometry(1, 1);
    const worldMesh = new Mesh(worldGeom, upsampleMat);
    worldMesh.frustumCulled = false;
    return { worldMesh, worldGeom, upsampleMat, upsampleUniforms };
}

function renderRibbons(renderer, target, scene, camera) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
}

function disposeAurora(target, ribbonRig, worldGeom, upsampleMat) {
    target.dispose();
    ribbonRig.geom.dispose();
    ribbonRig.mat.dispose();
    worldGeom.dispose();
    upsampleMat.dispose();
}

/**
 * @param {{info: Record<string, any>}} context `ready.info`
 * @returns {import('./scene.js').Layer} aurora layer
 */
export function createAuroraLayer({ info }) {
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
    const { worldMesh, worldGeom, upsampleMat, upsampleUniforms } = createUpsampleMesh(target, info);
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
            ribbonRig.uniforms.uPhases.value = auroraPhase(t, scratch.phases);
            upsampleUniforms.uTint.value = auroraTint(frame.season, frame.seasonProgress, scratch.tint);
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
