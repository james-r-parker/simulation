// Shaders for the food dots and the rock obstacles.
// Obstacles use a two-pass draw: pass 0 for rim + contact ring, pass 1 for shaded body + lichen.

import { NOISE_GLSL } from './noise-glsl.js';

export const FOOD_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, phase
uniform float uZoom;    // device pixels per world unit
uniform float uPad;     // extra quad half-size in device pixels (the rim, the soft edge)
uniform float uMinPx;   // smallest radius in device pixels
varying vec2 vLocal;    // in radii
varying float vPx;      // one device pixel in radii
varying float vPhase;
varying float vMeat;    // 1 for a carcass: the snapshot marks meat with a negative radius
void main() {
    float radius = max(abs(iBody.z), uMinPx / uZoom);
    vMeat = iBody.z < 0.0 ? 1.0 : 0.0;
    float halfSize = radius + uPad / uZoom;
    vLocal = corner * halfSize / radius;
    vPx = 1.0 / (uZoom * radius);
    vPhase = iBody.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(iBody.xy + corner * halfSize, 0.0, 1.0);
}
`;

export const FOOD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uMeatColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vLocal;
varying float vPx;
varying float vPhase;
varying float vMeat;
void main() {
    float d = length(vLocal);
    float twinkle = 1.0 + 0.15 * sin(uTime * 2.0943951 + vPhase);
    vec2 p = abs(vLocal) / 0.8;
    float star = sqrt(p.x) + sqrt(p.y);
    float core = 1.0 - smoothstep(0.8, 1.0, star);
    float glow = exp(-dot(p, p) * 2.5) * 0.35;
    vec3 rgb = mix(uColor, uMeatColor, vMeat) * uIntensity * twinkle * (core + glow) * (1.0 - smoothstep(1.0, 2.2, d));
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export const OBSTACLE_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, phase
attribute vec4 iShape;  // packed harmonics and lichen seed
uniform float uZoom;    // device pixels per world unit
uniform float uPad;     // extra quad half-size in device pixels
uniform float uMinPx;   // smallest radius in device pixels
uniform float uRimPx;   // rim width in device pixels
varying vec2 vLocal;    // in radii
varying vec2 vWorld;    // world position for noise and lichen
varying float vPx;      // one device pixel in radii
varying vec4 vShape;
void main() {
    float radius = max(abs(iBody.z), uMinPx / uZoom);
    float halfSize = radius * 1.08 + (uPad + uRimPx) / uZoom;
    vLocal = corner * halfSize / radius;
    vWorld = iBody.xy + corner * halfSize;
    vPx = 1.0 / (uZoom * radius);
    vShape = iShape;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 0.0, 1.0);
}
`;

export const OBSTACLE_FRAGMENT = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uBody;
uniform vec3 uRim;
uniform vec3 uContact;
uniform vec3 uLichen;
uniform float uSceneryMax;
uniform float uRimPx;
uniform float uTime;
uniform float uTier;
uniform float uPass;

varying vec2 vLocal;
varying vec2 vWorld;
varying float vPx;
varying vec4 vShape;

vec2 unpackHarmonic(float packedVal) {
    float a = floor(packedVal) * 0.001;
    float p = fract(packedVal) * 10.0;
    return vec2(a, p);
}

float evalRockRadius(vec2 p, vec4 shape, float tier) {
    if (tier >= 2.0) {
        return 1.0;
    }
    float angle = atan(p.y, p.x);
    vec2 h1 = unpackHarmonic(shape.x);
    vec2 h2 = unpackHarmonic(shape.y);
    vec2 h3 = unpackHarmonic(shape.z);
    float harmSum = h1.x * sin(2.0 * angle + h1.y) +
                    h2.x * sin(3.0 * angle + h2.y) +
                    h3.x * sin(5.0 * angle + h3.y);
    return 1.0 - 0.12 * (0.5 + 0.5 * harmSum);
}

void main() {
    float d = length(vLocal);
    float rockR = evalRockRadius(vLocal, vShape, uTier);
    float rimWidth = uRimPx * vPx;

    if (uPass < 0.5) {
        float rimOuter = rockR + rimWidth;
        float rimEdge = 1.0 - smoothstep(rimOuter - vPx, rimOuter + vPx, d);
        if (d <= rimOuter) {
            gl_FragColor = vec4(uRim, rimEdge);
        } else if (uTier < 2.0) {
            float contactEnd = rockR * 1.08;
            float contactAlpha = (1.0 - smoothstep(rockR, contactEnd, d)) * 0.5;
            if (contactAlpha <= 0.002) {
                discard;
            }
            gl_FragColor = vec4(uContact, contactAlpha);
        } else {
            discard;
        }
    } else {
        float bodyRadius = rockR - rimWidth;
        float bodyEdge = 1.0 - smoothstep(bodyRadius - vPx, bodyRadius + vPx, d);
        if (bodyEdge <= 0.002) {
            discard;
        }
        float normD = clamp(d / max(bodyRadius, 0.001), 0.0, 1.0);
        float radialLit = 0.75 + 0.25 * normD;
        float noiseTerm = 0.0;
        if (uTier < 0.5) {
            noiseTerm = 0.15 * (fbm2(vWorld * 0.04) - 0.5);
        }
        vec3 col = uBody * clamp(radialLit + noiseTerm, 0.0, 1.0);

        if (uTier < 0.5 && normD > 0.75) {
            vec2 cell = floor(vWorld * 0.4);
            float lichenSeed = vShape.w;
            float cellHash = hash21(cell + vec2(lichenSeed * 91.3, lichenSeed * 47.1));
            if (cellHash < 0.04) {
                float period = 6.0 + 6.0 * hash21(cell * 2.37);
                float breath = 0.5 + 0.5 * sin(uTime * (6.2831853 / period) + cellHash * 6.2831853);
                float bright = 0.5 + 0.5 * hash21(cell * 1.71);
                vec3 lichen = uLichen * bright * breath;
                col += min(lichen, vec3(uSceneryMax));
            }
        }
        gl_FragColor = vec4(col, bodyEdge);
    }

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
