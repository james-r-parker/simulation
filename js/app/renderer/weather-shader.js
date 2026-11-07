// The weather layer's shader: each instance is a mote whose world position is its seed wrapped into the view and
// drifted by the season's mode (spring pollen floats up, summer glints twinkle, autumn leaves tumble down, winter snow
// falls, denser and larger in the cold margins). The CPU writes the seeds once; nothing moves on the CPU per frame.

/** Mode indices, one per season (spring, summer, autumn, winter). */
export const WEATHER_MODE = Object.freeze({ POLLEN: 0, GLINT: 1, LEAF: 2, SNOW: 3 });

export const WEATHER_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iSeed;     // x, y, size and phase seeds, 0 to 1
uniform vec4 uView;       // left, bottom, width, height in world units
uniform float uTime;      // seconds
uniform float uZoom;      // device px per world unit
uniform float uModeA;     // the season's mode
uniform float uModeB;     // the neighbouring season's mode
uniform float uMix;       // the share of motes drawn in mode B
uniform float uColdMargin;
uniform float uWorldHeight;
uniform vec3 uColors[4];
varying vec2 vP;
varying vec3 vColor;
varying float vMode;

float marginNear(float y) {
    if (uColdMargin <= 0.0) return 0.0;
    float d = min(y, uWorldHeight - y);
    return 1.0 - clamp(d / (uColdMargin * 2.0), 0.0, 1.0);
}

vec2 drift(float mode, vec4 s, float t) {
    if (mode < 0.5) return vec2(sin(t * 0.3 + s.w * 6.28) * 30.0, t * 12.0);
    if (mode < 1.5) return vec2(0.0, 0.0);
    if (mode < 2.5) return vec2(t * 25.0 + sin(t * 0.9 + s.w * 6.28) * 60.0, -t * 30.0);
    return vec2(sin(t * 0.5 + s.w * 6.28) * 40.0 + t * 8.0, -t * 45.0 * (0.6 + s.z));
}

void main() {
    vec2 spread = vec2(9137.0, 7411.0);
    vec2 first = uView.xy + mod(iSeed.xy * spread - uView.xy, uView.zw);
    float bias = marginNear(first.y) * 0.3;
    float mode = iSeed.w * 0.7 + bias < uMix ? uModeB : uModeA;
    vec2 world = uView.xy + mod(iSeed.xy * spread + drift(mode, iSeed, uTime) - uView.xy, uView.zw);
    float cold = marginNear(world.y);
    float keep = mode > 2.5 ? step(iSeed.z, 0.5 + 0.5 * cold) : 1.0;
    float twinkle = mode > 0.5 && mode < 1.5 ? pow(max(sin(uTime * (0.7 + iSeed.z) + iSeed.w * 40.0), 0.0), 12.0) : 1.0;
    float px = (mode > 2.5 ? 2.0 + 2.5 * cold : 2.0) + 2.0 * iSeed.z;
    vP = corner;
    vMode = mode;
    vColor = uColors[int(mode + 0.5)] * keep * twinkle;
    vec2 local = corner * px / uZoom;
    if (mode > 1.5 && mode < 2.5) {
        float a = uTime * (1.0 + iSeed.z) + iSeed.w * 6.28;
        local = vec2(cos(a) * local.x * 1.8 - sin(a) * local.y, sin(a) * local.x * 1.8 + cos(a) * local.y);
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world + local, 0.0, 1.0);
}
`;

export const WEATHER_FRAGMENT = /* glsl */ `
varying vec2 vP;
varying vec3 vColor;
varying float vMode;
void main() {
    float d = length(vP);
    float a = 1.0 - smoothstep(0.4, 1.0, d);
    gl_FragColor = vec4(vColor * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
