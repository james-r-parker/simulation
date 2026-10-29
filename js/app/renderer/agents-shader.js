// The agent shader: one program for all five silhouettes. A quad of 2.4 x the radius to each side holds a signed-distance
// body (shape chosen by the `uShape` uniform, one per mesh), a bright core, a membrane line, a hot nucleus and a halo
// that falls to 0 at the quad edge. Colours are linear; the bloom lifts what is above 1. See Look in
// docs/designs/worker-and-renderer.md.

/** Half the quad side in radii. */
export const QUAD_HALF = 2.4;

/** Body centre fill share at zero edge. */
export const BODY_CENTRE_FILL = 0.34;

/** Brightness multiplier floor at zero energy. */
export const BRIGHTNESS_FLOOR = 0.7;

export const AGENT_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPose;   // x, y, angle, radius
attribute vec4 iColor;  // r, g, b, energy01
attribute vec4 iState;  // temperature01, ate flash, bitten flash, jaw open
attribute vec4 iExtra;  // pregnant, neutral family, reserved
attribute vec4 iMotion; // speed01, turn01, phase, 0
uniform float uZoom;    // device pixels per world unit
varying vec2 vP;
varying vec4 vColor;
varying vec4 vState;
varying vec4 vMotion;
varying float vPregnant;
varying float vNeutral;
varying vec2 vWorld;
varying float vPx;
void main() {
    float radius = max(iPose.w, 1.5 / uZoom);       // never under 3 device px across
    vP = corner * ${QUAD_HALF.toFixed(1)};
    float c = cos(iPose.z);
    float s = sin(iPose.z);
    vec2 local = vP * radius;
    vec2 world = iPose.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
    vWorld = world;
    vPx = 1.0 / (uZoom * radius);                    // one device pixel in radii
    vColor = iColor;
    vState = iState;
    vMotion = iMotion;
    vPregnant = iExtra.x;
    vNeutral = iExtra.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const AGENT_FRAGMENT = /* glsl */ `
uniform float uShape;      // 0 predator, 1 forager, 2 reproducer, 3 scout, 4 defender
uniform float uHunter;     // 1 when the specialisation can hunt: it has the nose notch and, small, the hot tip
uniform float uTime;       // seconds
uniform float uBiteArc;    // the jaw wedge's half-angle when fully open, radians
uniform float uTempLens;   // 1 replaces the lineage colour with the temperature ramp
uniform float uDim;        // 0.55 under the scent lens
uniform float uPalette;    // 2 for the high-contrast palette: a rim twice as wide, neutral families faint with no halo
uniform float uMotion;     // 1 level 0 (wobble + squash), 0.5 level 1 (squash), 0 level 2
uniform sampler2D uRamp;
uniform sampler2D uSmoke;  // smoke alpha over the view, quarter resolution
uniform vec4 uView;        // left, bottom, width, height of the view in world units
varying vec2 vP;
varying vec4 vColor;
varying vec4 vState;
varying vec4 vMotion;
varying float vPregnant;
varying float vNeutral;
varying vec2 vWorld;
varying float vPx;

float sdWedge(vec2 p, vec2 apex, float halfAngle) {
    vec2 q = vec2(p.x - apex.x, abs(p.y - apex.y));
    vec2 e = vec2(cos(halfAngle), sin(halfAngle));
    return dot(q, e) > 0.0 ? q.y * e.x - q.x * e.y : length(q);
}

float sdPredator(vec2 p, float open) {
    vec2 v[6];
    v[0] = vec2(1.35, 0.0);  v[1] = vec2(-0.05, 0.95); v[2] = vec2(-1.0, 0.72);
    v[3] = vec2(-0.5, 0.0);  v[4] = vec2(-1.0, -0.72); v[5] = vec2(-0.05, -0.95);
    float d = dot(p - v[0], p - v[0]);
    float sgn = 1.0;
    for (int i = 0, j = 5; i < 6; j = i, i++) {
        vec2 e = v[j] - v[i];
        vec2 w = p - v[i];
        vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        d = min(d, dot(b, b));
        bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) sgn = -sgn;
    }
    float body = sgn * sqrt(d);
    return max(body, -sdWedge(p, vec2(0.15, 0.0), uBiteArc * (0.3 + 0.7 * open)));
}

float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

float sdTeardrop(vec2 p) {
    vec2 q = vec2(abs(p.y), p.x + 1.35);
    float r1 = 0.04;
    float r2 = 0.5;
    float h = 2.3;
    float b = (r1 - r2) / h;
    float a = sqrt(1.0 - b * b);
    float k = dot(q, vec2(-b, a));
    if (k < 0.0) return length(q) - r1;
    if (k > a * h) return length(q - vec2(0.0, h)) - r2;
    return dot(q, vec2(a, b)) - r1;
}

float sdRoundedSquare(vec2 p) {
    vec2 q = abs(p) - vec2(0.62);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.28;
}

float body(vec2 p, float open, out float noseX) {
    noseX = 1.0;
    if (uShape < 0.5) { noseX = 1.35; return sdPredator(p, open); }
    if (uShape < 1.5) return length(p) - 1.0;
    if (uShape < 2.5) {
        float pulse = 1.0 + 0.08 * vPregnant * sin(uTime * 6.2831853);
        return sdHexagon(p / pulse, 0.88) * pulse;
    }
    if (uShape < 3.5) { noseX = 1.45; return sdTeardrop(p); }
    noseX = 0.9;
    return sdRoundedSquare(p);
}

void main() {
    vec2 p = vP;
    if (uMotion > 0.0) {
        float speed01 = vMotion.x;
        float turn01 = vMotion.y;
        float phase = vMotion.z;
        if (uMotion > 0.75) {
            p.y += 0.08 * speed01 * sin(uTime * (4.0 + 10.0 * speed01) + 6.2831853 * phase + 2.5 * p.x) * smoothstep(0.2, -1.0, p.x);
        }
        p *= vec2(1.0 / (1.0 + 0.12 * turn01), 1.0 + 0.12 * turn01);
    }
    float open = vState.w;
    float noseX;
    float d = body(p, open, noseX);
    if (uShape > 0.5 && uHunter > 0.5) {
        // the heading notch is part of the body outline, so the rim follows it
        d = max(d, -sdWedge(p, vec2(noseX - 0.5, 0.0), 0.5));
    }
    float cover = 1.0 - smoothstep(-vPx, vPx, d);
    float contrast = uPalette > 1.5 ? 1.0 : 0.0;
    float faint = contrast * vNeutral;                // a neutral family in the high-contrast palette
    float bright = (${BRIGHTNESS_FLOOR.toFixed(1)} + 1.5 * vColor.a) * (1.0 - 0.65 * faint);
    vec3 base = uTempLens > 0.5 ? texture2D(uRamp, vec2(clamp(vState.x, 0.0, 1.0), 0.5)).rgb : vColor.rgb;
    // The halo and the rim are sized in screen pixels (capped in radii for small agents), so zooming in never lets the
    // glow swallow the silhouette: a luminous membrane around a darker body with a glowing core.
    float across = 2.0 / vPx;                        // the agent's width in device px
    float small = 1.0 - smoothstep(23.0, 25.0, across);
    float haloWidth = min(0.263, mix(9.0, 4.0, small) * vPx);
    float rimWidth = min(2.2 * vPx * (1.0 + contrast), 0.12 * (1.0 + contrast));
    float halo = exp(-max(d, 0.0) / haloWidth) * 0.45 * (1.0 - faint);
    float rim = exp(-abs(d) / rimWidth) * 1.0;
    float edge = smoothstep(-rimWidth * 5.0, 0.0, d);
    float nucleus = exp(-dot(p, p) * 3.2) * 0.45 * (1.0 - small);
    float fill = ${BODY_CENTRE_FILL.toFixed(2)} + 0.5 * edge;
    vec3 rgb = base * bright * (cover * fill + halo * (1.0 - cover));
    rgb += base * bright * rim * 0.85;
    rgb += mix(base, vec3(1.0), 0.4) * bright * nucleus * cover;
    if (uShape > 3.5) {
        rgb += base * bright * 0.9 * smoothstep(-0.2, -0.08, d) * (1.0 - smoothstep(-0.08, 0.0, d));
    }
    // below 24 px a hunter gets a hot white-red tip at the nose, so it reads as a hunter at a glance
    float tip = 1.0 - smoothstep(0.0, 0.42, length(p - vec2(noseX * 0.8, 0.0)));
    rgb += vec3(1.0, 0.45, 0.35) * 1.6 * tip * small * uHunter * cover;
    vec2 eyeAt = p - vec2(0.45, 0.0);
    rgb += vec3(0.85, 0.95, 1.0) * 1.1 * (1.0 - smoothstep(0.13 - vPx, 0.13 + vPx, length(eyeAt))) * cover;
    rgb += vec3(0.35, 0.9, 0.7) * vState.y * 0.9 * (cover + halo * 0.5);
    rgb += vec3(1.0, 0.18, 0.15) * vState.z * 1.3 * (cover + halo * 0.5);
    float window = 1.0 - smoothstep(0.3, 1.0, length(vP) / ${QUAD_HALF.toFixed(1)});
    vec2 uv = (vWorld - uView.xy) / uView.zw;
    rgb *= window * uDim * (1.0 - texture2D(uSmoke, uv).r);
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
