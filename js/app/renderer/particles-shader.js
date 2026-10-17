// The ambient motes: points placed in the vertex shader from a per-point seed and the time, drifting on a slow flow
// inside the view.

export const MOTE_VERTEX = /* glsl */ `
attribute vec4 seed;     // four random numbers in [0, 1)
uniform float uTime;     // seconds
uniform float uPx;       // the point size scale in device pixels
varying float vAlpha;
void main() {
    float t = uTime * (0.012 + 0.02 * seed.z);
    vec2 flow = vec2(sin(t * 6.2831853 + seed.x * 17.0) + 0.5 * sin(t * 3.1 + seed.y * 11.0),
                     cos(t * 5.1 + seed.y * 13.0) + 0.5 * cos(t * 2.3 + seed.w * 7.0)) * 0.035;
    vec2 p = fract(seed.xy + flow + (seed.zw - 0.5) * uTime * 0.004);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = uPx * (1.5 + 2.2 * seed.w);
    vAlpha = 0.05 + 0.09 * seed.z * (0.6 + 0.4 * sin(uTime * (0.4 + seed.x) + seed.y * 40.0));
}
`;

export const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.2, 1.0, d);
    gl_FragColor = vec4(uColor * vAlpha * soft, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
