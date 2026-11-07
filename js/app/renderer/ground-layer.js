// The ground: a world-space surface under everything, so the world has a place and not an empty black. Broad soft
// swells of the season's tint with faint contour lines, fixed to the world so they slide as the camera pans and
// zooms (the aurora, by contrast, is fixed to the screen). Drawn with the `terrain` look item: at most
// `GROUND_PEAK` x the aurora luminance, so it stays under the scenery ceiling. A basin under drought (snapshot header
// word 9) takes a warm dust tint with cracks, fading in and out over `DROUGHT_FADE_MS`, under the weather item.

import { BufferGeometry, Float32BufferAttribute, Mesh, ShaderMaterial } from 'three';
import { auroraTint } from './aurora-tint.js';
import { PALETTE, SCENERY_MAX_LUMINANCE } from './colors.js';
import { createSections, readSections } from '../snapshot-view.js';
import { LOOK_OFF } from './quality.js';
import { NOISE_GLSL } from './noise-glsl.js';

/** The brightest the ground gets, as a share of the aurora's luminance ceiling. */
export const GROUND_PEAK = 0.85;
/** How long a drought's tint takes to come and go, ms. */
export const DROUGHT_FADE_MS = 5000;

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
uniform float uWallX;
uniform vec2 uDrought;  // west and east basins' drought share, 0 to 1
uniform vec3 uDust;
varying vec2 vWorld;
${NOISE_GLSL}
void main() {
    float swell = fbm2(vWorld * 0.0011);
    float height = fbm2(vWorld * 0.0024 + 31.7);
    float lines = 1.0 - smoothstep(0.0, 0.05, abs(fract(height * 9.0) - 0.5) * 2.0 - 0.9);
    float fine = uDetail * (valueNoise(vWorld * 0.02) - 0.5) * 0.25;
    float level = clamp(0.25 + 0.75 * swell + 0.25 * lines * uDetail + fine, 0.0, 1.0);
    float dry = vWorld.x < uWallX ? uDrought.x : uDrought.y;
    float crack = uDetail * (1.0 - smoothstep(0.0, 0.06, abs(fract(fbm2(vWorld * 0.006) * 7.0) - 0.5)));
    vec3 dust = uDust * dry * (0.55 + 0.45 * crack);
    gl_FragColor = vec4(uTint * (uPeak * level) * (1.0 - 0.5 * dry) + dust, 1.0);
}
`;

/**
 * @returns {Float32Array} the drought dust colour: `PALETTE.heat` at the scenery ceiling
 */
function dustColor() {
    const h = PALETTE.heat;
    const y = 0.2126729 * h[0] + 0.7151522 * h[1] + 0.072175 * h[2];
    return Float32Array.from(h, (c) => (c * SCENERY_MAX_LUMINANCE) / y);
}

/**
 * Moves each basin's drought share toward 1 for the basin under drought and 0 for the others, over `DROUGHT_FADE_MS`.
 * @param {Float32Array} shares the west and east shares
 * @param {number} basin the basin under drought, -1 for none
 * @param {number} dtMs the frame time
 * @returns {void}
 */
export function easeDrought(shares, basin, dtMs) {
    const step = Math.min(1, dtMs / DROUGHT_FADE_MS);
    for (let b = 0; b < shares.length; b++) {
        const target = b === basin ? 1 : 0;
        shares[b] += Math.sign(target - shares[b]) * Math.min(Math.abs(target - shares[b]), step);
    }
}

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
    const uniforms = {
        uTint: { value: new Float32Array(3) },
        uPeak: { value: GROUND_PEAK },
        uDetail: { value: 1 },
        uWallX: { value: info.terrain?.wallX ?? info.worldWidth / 2 },
        uDrought: { value: new Float32Array(2) },
        uDust: { value: dustColor() },
    };
    const sections = createSections();
    let weather = true;
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
            const tier = /** @type {number} */ (look.terrain);
            mesh.visible = tier >= 0 && tier < 2;
            uniforms.uDetail.value = tier === 0 ? 1 : 0;
            weather = look.weather !== undefined && look.weather !== LOOK_OFF;
        },
        update(frame) {
            auroraTint(frame.season, frame.seasonProgress, uniforms.uTint.value);
            const basin = weather && frame.snapshot ? readSections(frame.snapshot.u32, sections).droughtBasin : -1;
            easeDrought(uniforms.uDrought.value, basin, frame.dtMs ?? 0);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
