// The agent shader's body states from the snapshot's `state` word (`iBody`: the state bits, gestation, dose and strain,
// written by `packAgents`): a resting body breathes slowly with its eye shut, a sated one is rounder, a juvenile has a
// larger eye, a body in cover is drawn dithered, a pregnancy shows a filling arc and a strain tints the infected spots.

import { PALETTE } from './colors.js';

/**
 * @param {readonly number[]} rgb a linear RGB triple
 * @returns {string} the triple as a GLSL `vec3` literal
 */
function glsl(rgb) {
    return `vec3(${rgb.map((c) => c.toFixed(3)).join(', ')})`;
}

/** The bit of each state in `iBody.x`, matching `SNAPSHOT_STATE` (resting 1, sated 2, in cover 4, juvenile 8). */
export const BODY_BIT = Object.freeze({ RESTING: 0, SATED: 1, IN_COVER: 2, JUVENILE: 3 });

export const BODY_STATE_GLSL = /* glsl */ `
float stateBit(float k) {
    return mod(floor(vBody.x / pow(2.0, k)), 2.0);
}

vec2 stateP(vec2 p) {
    if (uBody < 0.75) return p;
    p /= 1.0 + 0.04 * stateBit(${BODY_BIT.RESTING}.0) * sin(uTime * 2.5132741);
    p.y /= 1.0 + 0.08 * stateBit(${BODY_BIT.SATED}.0);
    p.x /= 1.0 + 0.15 * vTween.w;
    return p;
}

float eyeCover(vec2 eyeAt) {
    float on = uBody > 0.75 ? 1.0 : 0.0;
    float r = 0.13 * (1.0 + (0.4 * stateBit(${BODY_BIT.JUVENILE}.0) + 0.3 * vTween.w) * on);
    vec2 q = eyeAt * vec2(1.0, 1.0 + 4.0 * stateBit(${BODY_BIT.RESTING}.0) * on);
    return 1.0 - smoothstep(r - vPx, r + vPx, length(q));
}

vec3 gestationArc(vec2 p) {
    float g = vBody.y * vPregnant * uCourt;
    if (g <= 0.0) return vec3(0.0);
    float around = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
    float band = 1.0 - smoothstep(0.03, 0.03 + vPx * 2.0, abs(length(p) - 0.62));
    return ${glsl(PALETTE.courtship)} * 0.9 * band * step(around, g);
}

float concealment() {
    if (uBody < 0.75) return 0.0;
    float dither = step(0.5, fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.5))));
    return 0.45 * stateBit(${BODY_BIT.IN_COVER}.0) * (0.5 + 0.5 * dither);
}

vec3 strainTint(vec3 c) {
    float s = vBody.w * 255.0;
    if (s < 0.5) return c;
    vec3 shift = vec3(fract(s * 0.37), fract(s * 0.61), fract(s * 0.83));
    return c * (0.75 + 0.5 * shift);
}
`;
