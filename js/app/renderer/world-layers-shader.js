// Shaders for the food dots and the rock obstacles.
// Obstacles use a two-pass draw: pass 0 for rim + contact ring, pass 1 for shaded body + lichen.

import { NOISE_GLSL } from './noise-glsl.js';

export const FOOD_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, phase
attribute float iAge;   // normalized item age
attribute vec2 iLook;   // species and hue
uniform float uZoom;    // device pixels per world unit
uniform float uPad;     // extra quad half-size in device pixels (the rim, the soft edge)
uniform float uMinPx;   // smallest radius in device pixels
uniform float uDecay;   // 1 when decay look enabled, 0 when off
varying vec2 vLocal;    // in radii
varying float vPx;      // one device pixel in radii
varying float vPhase;
varying float vMeat;    // 1 for a carcass: the snapshot marks meat with a negative radius
varying float vDim;     // carcass dimming factor
varying vec2 vLook;
varying float vAge;
void main() {
    vLook = iLook;
    vAge = clamp(iAge, 0.0, 1.0);
    vMeat = iBody.z < 0.0 ? 1.0 : 0.0;
    float age01 = vMeat * uDecay * clamp(iAge, 0.0, 1.0);
    float scale = 1.0 - 0.4 * age01;
    vDim = 1.0 - 0.65 * smoothstep(0.1, 1.0, age01);
    float radius = max(abs(iBody.z) * scale * 0.75, uMinPx / uZoom);
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
uniform float uFlora;
varying vec2 vLook;
varying float vAge;
varying vec2 vLocal;
varying float vPx;
varying float vPhase;
varying float vMeat;
varying float vDim;
float dotShape(vec2 p, vec2 centre, float radius) {
    return 1.0 - smoothstep(radius - vPx, radius + vPx, length(p - centre));
}
float blade(vec2 p, vec2 a, vec2 b, float width) {
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    return 1.0 - smoothstep(width - vPx, width + vPx, length(p - a - t * ab));
}
float plantShape(vec2 p, float species) {
    if (species < 0.5) {
        return max(blade(p, vec2(0.0, -0.55), vec2(-0.55, 0.5), 0.09),
            max(blade(p, vec2(0.0, -0.55), vec2(0.0, 0.7), 0.09),
                blade(p, vec2(0.0, -0.55), vec2(0.55, 0.5), 0.09)));
    }
    if (species < 1.5) {
        return max(dotShape(p, vec2(-0.3, 0.1), 0.35),
            max(dotShape(p, vec2(0.3, 0.1), 0.35), dotShape(p, vec2(0.0, -0.35), 0.35)));
    }
    if (species < 2.5) {
        float d = length(p);
        return dotShape(p, vec2(0.0), 0.62) * mix(1.0, 0.55, smoothstep(0.42, 0.5, d));
    }
    if (species < 3.5) {
        float edge = 0.42 + 0.18 * cos(5.0 * atan(p.y, p.x));
        return 1.0 - smoothstep(edge - vPx, edge + vPx, length(p));
    }
    float cap = dotShape(vec2(p.x, (p.y - 0.12) * 1.8), vec2(0.0), 0.65) * step(-0.04, p.y);
    float stalk = (1.0 - smoothstep(0.16 - vPx, 0.16 + vPx, abs(p.x))) * step(-0.65, p.y) * step(p.y, 0.08);
    float rim = species > 4.5 ? dotShape(vec2(p.x, (p.y + 0.02) * 5.0), vec2(0.0), 0.62) : 0.0;
    return max(max(cap, stalk), rim);
}
vec3 plantColor(float hue) {
    float h = mod(120.0 - 90.0 * (clamp(hue, -1.0, 1.0) + 1.0) + 360.0, 360.0) / 60.0;
    float x = 1.0 - abs(mod(h, 2.0) - 1.0);
    vec3 rgb = h < 1.0 ? vec3(1.0, x, 0.0) : h < 2.0 ? vec3(x, 1.0, 0.0) :
        h < 3.0 ? vec3(0.0, 1.0, x) : vec3(1.0, 0.0, x);
    float y = dot(rgb, vec3(0.2126729, 0.7151522, 0.072175));
    float ceiling = uIntensity * dot(uColor, vec3(0.2126729, 0.7151522, 0.072175));
    return rgb * min(1.0, ceiling / y);
}
void main() {
    float d = length(vLocal);
    float twinkle = 1.0 + 0.15 * sin(uTime * 2.0943951 + vPhase);
    vec2 p = abs(vLocal) / 0.8;
    float star = sqrt(p.x) + sqrt(p.y);
    float core = 1.0 - smoothstep(0.8, 1.0, star);
    float glow = exp(-dot(p, p) * 2.5) * 0.2;
    vec3 rgb = mix(uColor, uMeatColor, vMeat) * uIntensity * vDim * twinkle * (core + glow) * (1.0 - smoothstep(1.0, 2.2, d));
    if (uFlora > 0.5 && vMeat < 0.5) {
        float rim = 1.0 - smoothstep(0.05, 0.12, abs(vLocal.y));
        float capShade = vLook.x > 4.5 ? mix(0.65, 1.0, rim) : 1.0;
        rgb = plantColor(vLook.y) * plantShape(vLocal, vLook.x) * capShade * smoothstep(0.0, 0.05, vAge);
    }
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
            // A lit upper-left edge: the rim is the union's outline only (bodies cover the rest), so it has no seam.
            float lit = max(0.0, dot(normalize(vLocal + vec2(0.0001)), vec2(-0.6, 0.8)));
            gl_FragColor = vec4(uRim * (0.9 + 1.7 * lit), rimEdge);
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
        // The shading reads world position only, with no per-rock radial term: a radial gradient would leave an arc
        // inside the ridge wherever one rock's body covers its neighbour's, and touching rocks must read as one mass.
        float shade = 1.0;
        if (uTier < 0.5) {
            // A relief lit from the upper left: the slope of a world-space height field, so it is seamless across rocks.
            vec2 hp = vWorld * 0.045;
            float h0 = fbm2(hp);
            float relief = (fbm2(hp + vec2(0.5, -0.5)) - h0) * 2.4;
            shade = 0.7 + 0.8 * h0 * (0.7 + 0.6 * valueNoise(vWorld * 0.11)) + relief;
        }
        vec3 col = uBody * clamp(shade, 0.55, 1.6);

        if (uTier < 0.5 && normD > 0.75) {
            vec2 cell = floor(vWorld * 0.4);
            float lichenSeed = vShape.w;
            float cellHash = hash21(cell + vec2(lichenSeed * 91.3, lichenSeed * 47.1));
            if (cellHash < 0.07) {
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

export const HERD_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody; // x, y, radius, normalized speed
uniform float uZoom;
uniform float uMinPx;
varying vec2 vLocal;
varying float vPx;
void main() {
    float radius = max(iBody.z, uMinPx / uZoom);
    float halfSize = radius + 1.0 / uZoom;
    vLocal = corner * halfSize / radius;
    vPx = 1.0 / (uZoom * radius);
    gl_Position = projectionMatrix * viewMatrix * vec4(iBody.xy + corner * halfSize, 0.0, 1.0);
}
`;

export const HERD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vLocal;
varying float vPx;
void main() {
    float edge = 1.0 - smoothstep(1.0 - vPx, 1.0 + vPx, length(vLocal));
    gl_FragColor = vec4(uColor * uIntensity, edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
