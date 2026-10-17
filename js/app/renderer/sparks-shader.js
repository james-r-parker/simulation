// A spark: a capsule (a streak, or a dot when its half length is 0) of a world-unit thickness with a soft glow.

export const SPARK_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iPose;    // x, y, angle, half length (world)
attribute vec4 iColor;   // r, g, b, alpha
attribute vec4 iShape;   // thickness (world), reserved
uniform float uZoom;
varying vec2 vLocal;     // world units along and across the spark
varying vec4 vPose;
varying vec4 vColor;
varying float vThick;
void main() {
    float thick = max(iShape.x, 1.0 / uZoom);
    float pad = thick * 4.0 + 2.0 / uZoom;
    vLocal = corner * vec2(iPose.w + pad, pad);
    vPose = iPose;
    vColor = iColor;
    vThick = thick;
    float c = cos(iPose.z);
    float s = sin(iPose.z);
    vec2 world = iPose.xy + vec2(c * vLocal.x - s * vLocal.y, s * vLocal.x + c * vLocal.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const SPARK_FRAGMENT = /* glsl */ `
uniform float uZoom;
varying vec2 vLocal;
varying vec4 vPose;
varying vec4 vColor;
varying float vThick;
void main() {
    float d = length(vec2(max(abs(vLocal.x) - vPose.w, 0.0), vLocal.y)) - vThick;
    float px = 1.0 / uZoom;
    float body = 1.0 - smoothstep(-px, px, d);
    float glow = exp(-max(d, 0.0) / (vThick * 2.2)) * 0.45;
    gl_FragColor = vec4(vColor.rgb * vColor.a * (body + glow), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
