// The scent haze: one world quad. The fields are sampled through a displaced uv (two octaves of value noise drifting at
// 6 world units a second) from two textures that cross-fade as each new field arrives.

import { NOISE_GLSL } from './noise-glsl.js';

export const HAZE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec2 vWorld;
uniform vec2 uWorld;
void main() {
    vUv = uv;
    vWorld = uv * uWorld;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 0.0, 1.0);
}
`;

export const HAZE_FRAGMENT = /* glsl */ `
uniform sampler2D uPrev;
uniform sampler2D uNext;
uniform float uMix;        // 0 shows the previous field, 1 the newest
uniform float uCap;        // the alpha ceiling: 0.018, or 0.07 under the scent lens
uniform float uTime;       // seconds
uniform vec2 uWorld;
uniform vec3 uDanger;
uniform vec3 uAttack;
uniform vec3 uHunt;
varying vec2 vUv;
varying vec2 vWorld;
${NOISE_GLSL}
void main() {
    vec2 drift = vec2(6.0, 3.5) * uTime;
    vec2 q = (vWorld + drift) / 420.0;
    vec2 warp = vec2(fbm2(q) - 0.5, fbm2(q + 31.7) - 0.5) * 0.06;
    vec2 uv = clamp(vUv + warp, 0.0, 1.0);
    vec4 field = mix(texture2D(uPrev, uv), texture2D(uNext, uv), uMix);
    float mottle = 0.6 + 0.4 * fbm2(q * 1.7 + 5.0);
    vec3 weight = field.rgb / max(field.r + field.g + field.b, 1.0);
    vec3 rgb = (uDanger * weight.r + uAttack * weight.g + uHunt * weight.b) * uCap * mottle;
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
