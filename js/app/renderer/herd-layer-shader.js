import { NOISE_GLSL } from './noise-glsl.js';

export const HERD_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, speed share
attribute vec4 iMotion; // heading, phase, and spare values
attribute vec4 iColor;  // muted group colour
uniform float uZoom;
uniform float uMinPx;
uniform float uTime;
varying vec2 vLocal;
varying vec2 vWorld;
varying float vPx;
varying float vSpeed;
varying float vPhase;
varying vec3 vColor;
void main() {
    float radius = max(iBody.z, uMinPx / uZoom);
    float heading = iMotion.x;
    vec2 forward = vec2(cos(heading), sin(heading));
    vec2 side = vec2(-forward.y, forward.x);
    float speed = clamp(iBody.w, 0.0, 1.0);
    float gait = sin(uTime * (1.2 + speed * 3.8) + iMotion.y) * speed;
    vec2 local = corner * vec2(1.42, 0.92);
    local.y += gait * 0.045;
    vec2 offset = forward * local.x + side * local.y;
    vec2 world = iBody.xy + offset * radius;
    vLocal = local;
    vWorld = world;
    vPx = 1.0 / (uZoom * radius);
    vSpeed = speed;
    vPhase = iMotion.y;
    vColor = iColor.rgb;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 0.0, 1.0);
}
`;

export const HERD_FRAGMENT = /* glsl */ `
${NOISE_GLSL}
varying vec2 vLocal;
varying vec2 vWorld;
varying float vPx;
varying float vSpeed;
varying float vPhase;
varying vec3 vColor;
void main() {
    vec2 bodyPoint = vec2(vLocal.x / 0.86, vLocal.y / 0.59);
    float bodyDistance = length(bodyPoint) - 1.0;
    float headNod = sin(vPhase + vSpeed * 2.0) * vSpeed * 0.045;
    float headDistance = length(vLocal - vec2(0.68, headNod)) / 0.34 - 1.0;
    float distanceFromBody = min(bodyDistance, headDistance);
    float alpha = 1.0 - smoothstep(-vPx, vPx, distanceFromBody);
    if (alpha <= 0.002) {
        discard;
    }
    float backShade = mix(0.58, 1.0, smoothstep(-0.74, -0.06, vLocal.x));
    float relief = 0.82 + 0.18 * fbm2(vWorld * 0.045);
    float rim = smoothstep(0.68, 0.96, distanceFromBody + 1.0);
    vec3 body = vColor * backShade * relief * mix(0.82, 1.0, rim);
    gl_FragColor = vec4(body, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
