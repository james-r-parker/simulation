// The scent haze: one world quad. The fields are sampled through a displaced uv (two octaves of value noise drifting at
// 6 world units a second) from two textures that cross-fade as each new field arrives. With the motion item at full,
// the haze flows: streaks advect down the field's gradient. Under the scent lens each channel is drawn as a heat map,
// dim at a trace, its colour in the middle and white-hot near the field's maximum.

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
uniform float uFlow;      // 1 when the haze flows (the motion item at full)
uniform float uLens;      // 1 under the scent lens: the heat map
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
    float total = field.r + field.g + field.b;
    // the gradient from screen-space derivatives (no extra texture reads), and one noise octave for the streaks
    vec2 grad = vec2(dFdx(total), dFdy(total));
    if (uFlow > 0.5 && total > 0.01) {
        vec2 down = -grad / max(length(grad), 1e-6);
        vec2 s = (vWorld - down * uTime * 30.0) / 90.0;
        mottle *= 0.7 + 0.6 * valueNoise(s) * smoothstep(0.0, 0.05, total);
    }
    vec3 weight = field.rgb / max(field.r + field.g + field.b, 1.0);
    vec3 rgb = (uDanger * weight.r + uAttack * weight.g + uHunt * weight.b) * uCap * mottle;
    if (uLens > 0.5) {
        vec3 hot = clamp(field.rgb, 0.0, 1.0);
        vec3 white = vec3(1.0);
        vec3 heat = mix(uDanger, white, smoothstep(0.6, 1.0, hot.r)) * smoothstep(0.0, 0.5, hot.r)
            + mix(uAttack, white, smoothstep(0.6, 1.0, hot.g)) * smoothstep(0.0, 0.5, hot.g)
            + mix(uHunt, white, smoothstep(0.6, 1.0, hot.b)) * smoothstep(0.0, 0.5, hot.b);
        rgb = heat * uCap * mottle;
    }
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
