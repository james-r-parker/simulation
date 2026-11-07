// The effect pool's shader. The vertex stage keys each instance's curve (from uniform arrays built by `curveUniforms`)
// at its age, moves it and sizes it; an instance outside its life collapses off screen, so the CPU never revisits a
// live instance. The fragment stage draws the curve's SDF shape with a soft glow, additively.

import { FX_CURVES, FX_SHAPES } from './fx-curves.js';

/** Half the quad side in shape units (a shape fills radius 1; the glow needs the rest). */
export const FX_PAD = 1.6;

const N = FX_CURVES.length;
const S = Object.fromEntries(FX_SHAPES.map((name, i) => [name, `${i}.0`]));

export const FX_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPose;   // x, y, angle, size (world)
attribute vec4 iColor;  // r, g, b, gain
attribute vec4 iTime;   // start tick (rebased), life ticks, curve index, seed
attribute vec4 iMove;   // reach (world), stretch along the heading, least size (device px), 0
uniform float uFxTick;  // the playhead tick, rebased like iTime.x
uniform float uZoom;
uniform float uCallBoost;
uniform vec4 uScale[${N}];
uniform vec4 uAlpha[${N}];
uniform vec4 uInfo[${N}];
varying vec2 vP;
varying vec4 vColor;
varying float vShape;
varying float vAge;
varying float vSeed;
varying float vPx;

float ease(float t, float id) {
    if (id < 0.5) return t;
    if (id < 1.5) return t * t;
    if (id < 2.5) return 1.0 - (1.0 - t) * (1.0 - t);
    if (id < 3.5) return 0.5 - 0.5 * cos(3.14159265 * t);
    if (id < 4.5) return t <= 0.0 ? 0.0 : pow(2.0, 10.0 * t - 10.0);
    if (id < 5.5) { float u = t - 1.0; return 1.0 + 2.70158 * u * u * u + 1.70158 * u * u; }
    if (t <= 0.0 || t >= 1.0) return t;
    return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * 2.0943951) + 1.0;
}

float keys(vec4 k, float t) {
    float s = clamp(t, 0.0, 1.0) * 3.0;
    if (s < 1.0) return mix(k.x, k.y, s);
    if (s < 2.0) return mix(k.y, k.z, s - 1.0);
    return mix(k.z, k.w, s - 2.0);
}

vec2 motion(float id, float t, vec2 dir, float reach, float seed) {
    if (id < 0.5) return vec2(0.0);
    if (id < 1.5) return dir * reach * t;
    if (id < 2.5) return dir * reach * (1.0 - t);
    if (id < 3.5) return vec2(sin(t * 6.0 + seed * 6.2831853) * reach * 0.12, reach * t);
    if (id < 4.5) return vec2(sin(t * 5.0 + seed * 6.2831853) * reach * 0.1, -reach * t);
    float a = atan(dir.y, dir.x) + t * 3.14159265;
    return vec2(cos(a), sin(a)) * reach * (1.0 - t);
}

void main() {
    float age = (uFxTick - iTime.x) / iTime.y;
    if (!(age >= 0.0 && age < 1.0)) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    int c = int(iTime.z + 0.5);
    vec4 info = uInfo[c];
    float t = ease(age, info.z);
    float scale = keys(uScale[c], t);
    float alpha = keys(uAlpha[c], t) * (mod(info.w, 2.0) > 0.5 ? uCallBoost : 1.0);
    vec2 dir = vec2(cos(iPose.z), sin(iPose.z));
    vec2 at = iPose.xy + motion(info.y, t, dir, iMove.x, iTime.w);
    float size = max(iPose.w * scale, 0.5 * iMove.z / uZoom);
    vP = corner * ${FX_PAD.toFixed(1)};
    vec2 local = vP * size * vec2(max(iMove.y, 1.0), 1.0);
    vec2 world = at + vec2(dir.x * local.x - dir.y * local.y, dir.y * local.x + dir.x * local.y);
    vColor = vec4(iColor.rgb * iColor.a, alpha);
    vShape = info.x;
    vAge = age;
    vSeed = iTime.w;
    vPx = 1.0 / max(uZoom * size, 0.001);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const FX_FRAGMENT = /* glsl */ `
varying vec2 vP;
varying vec4 vColor;
varying float vShape;
varying float vAge;
varying float vSeed;
varying float vPx;

float capsule(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}

float ringShape(vec2 p, float w) { return abs(length(p) - 0.85) - max(w, vPx * 1.2); }

float star(vec2 p) {
    vec2 q = abs(p);
    return min(q.x * 5.0 + q.y, q.y * 5.0 + q.x) * 0.3 - 0.3;
}

float shapeA(vec2 p, float s) {
    if (s < ${S.STREAK}) return ringShape(p, 0.06);
    if (s < ${S.CRESCENT}) return capsule(p, vec2(-0.9, 0.0), vec2(0.9, 0.0), 0.14);
    if (s < ${S.SHARD}) return max(length(p) - 0.8, -(length(p - vec2(0.38, 0.0)) - 0.68));
    if (s < ${S.MOTE}) return max(abs(p.y) * 1.7 + p.x * 0.9 - 0.6, -p.x - 0.6);
    if (s < ${S.DROP}) return length(p) - 0.5;
    if (s < ${S.PUFF}) return abs(length(p) - 0.6) - 0.12;
    if (s < ${S.CHEVRON}) return length(p) - (0.75 + 0.12 * sin(atan(p.y, p.x) * 5.0 + vSeed * 6.2831853));
    float a = atan(p.y, p.x);
    if (s < ${S.ARC}) return max(ringShape(p, 0.07), (abs(fract(a * 1.9098593 + 0.25) - 0.5) - 0.3) * 0.6);
    return max(ringShape(p, 0.08), (abs(a) - 0.785) * 0.85);
}

float shapeB(vec2 p, float s) {
    if (s < ${S.SPORE}) return length(p) - 0.45;
    if (s < ${S.SPARKLE}) return length(p) - 0.35;
    if (s < ${S.CRUMB}) return star(p);
    if (s < ${S.SPROUT}) { vec2 q = abs(p) - vec2(0.35); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08; }
    if (s < ${S.FISSION}) {
        float grow = min(vAge * 2.0, 1.0);
        float stem = capsule(p, vec2(0.0, -0.8), vec2(0.0, -0.8 + grow), 0.08);
        float leaves = min(length(p - vec2(-0.28, grow - 0.7)), length(p - vec2(0.28, grow - 0.7))) - 0.2 * grow;
        return min(stem, leaves);
    }
    if (s < ${S.GHOST}) {
        float apart = 0.08 + 0.5 * vAge;
        return min(length(p - vec2(apart, 0.0)), length(p + vec2(apart, 0.0))) - 0.55;
    }
    return length(p) - 0.9;
}

void main() {
    float d = vShape < ${S.ORBIT} ? shapeA(vP, vShape) : shapeB(vP, vShape);
    float body = 1.0 - smoothstep(-vPx, vPx, d);
    float glow = exp(-max(d, 0.0) / 0.22) * 0.45;
    float fill = vShape > ${S.FISSION} ? 0.35 + 0.65 * smoothstep(-0.25, 0.0, d) : 1.0;
    float edge = 1.0 - smoothstep(1.1, ${FX_PAD.toFixed(1)}, length(vP));
    gl_FragColor = vec4(vColor.rgb * vColor.a * (body * fill + glow * (1.0 - body)) * edge, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
