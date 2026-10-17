// A smoke puff: three noise-warped lobes inside the cloud's radius. One fragment source draws both the visible puff
// (blue-black with a faint grey-blue turbulence, normal blending) and, with ALPHA_ONLY, the alpha the agent shader
// reads to dim the glow underneath.

import { NOISE_GLSL } from './noise-glsl.js';

/** The quad's half-size in puff radii: room for the lobes and the warped edge. */
export const PUFF_HALF = 1.7;

export const SMOKE_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iCloud;   // x, y, radius, alpha
varying vec2 vLocal;
varying float vAlpha;
varying float vSeed;
void main() {
    vLocal = corner * ${PUFF_HALF.toFixed(1)};
    vAlpha = iCloud.w;
    vSeed = fract(iCloud.x * 0.0137 + iCloud.y * 0.0071);
    gl_Position = projectionMatrix * viewMatrix * vec4(iCloud.xy + corner * ${PUFF_HALF.toFixed(1)} * iCloud.z, 0.0, 1.0);
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uSmoke;
uniform vec3 uNoise;
varying vec2 vLocal;
varying float vAlpha;
varying float vSeed;
${NOISE_GLSL}
float lobe(vec2 p, float angle, float size) {
    vec2 c = 0.42 * vec2(cos(angle), sin(angle));
    return length(p - c) - size;
}
void main() {
    float t = uTime * 0.12;
    vec2 p = vLocal + (vec2(fbm2(vLocal * 2.2 + t + vSeed * 40.0), fbm2(vLocal * 2.2 - t + 9.1 + vSeed * 40.0)) - 0.5) * 0.7;
    float a = vSeed * 6.2831853 + t;
    float d = min(min(lobe(p, a, 0.62), lobe(p, a + 2.0943951, 0.55)), lobe(p, a + 4.1887902, 0.58));
    float cover = (1.0 - smoothstep(-0.3, 0.35, d)) * (1.0 - smoothstep(0.85, 1.7, length(vLocal)));
    float alpha = vAlpha * cover;
    #ifdef ALPHA_ONLY
    gl_FragColor = vec4(vec3(alpha), 1.0);
    #else
    vec3 rgb = uSmoke + uNoise * fbm2(vLocal * 3.5 - t * 2.0 + vSeed * 20.0);
    gl_FragColor = vec4(rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #endif
}
`;
