// The herd shader. An animal is drawn in the agents' visual language - a lit membrane line around a darker body - but
// with no halo, core or bloom and in a muted earth tone, so it reads as a large living body that is not a blob. The
// body fills the sim's `herdRadius` (the trample reach) with a head lobe along the heading. See The look in
// docs/designs/megafauna.md.

import { HERD_FILL_SHARE } from './colors.js';
import { NOISE_GLSL } from './noise-glsl.js';

/** Half the quad, in radii, along and across the heading: room for the body, the head lobe and the outline. */
export const HERD_QUAD = Object.freeze({ along: 1.5, across: 1.05 });

export const HERD_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, speed share
attribute vec4 iMotion; // heading, phase, and spare values
attribute vec4 iColor;  // muted group colour
uniform float uZoom;
uniform float uMinPx;
uniform float uTime;
uniform float uDetail;
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
    float gait = uDetail < 0.5 ? sin(uTime * (1.2 + speed * 3.8) + iMotion.y) * speed : 0.0;
    vec2 local = corner * vec2(${HERD_QUAD.along.toFixed(2)}, ${HERD_QUAD.across.toFixed(2)});
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
uniform float uDetail;
uniform float uTime;
void main() {
    bool plain = uDetail > 1.5;
    // Signed distance in radii, negative inside: an ellipse body that fills the trample radius, and a head lobe.
    vec2 axes = vec2(1.0, 0.8);
    float bodyDistance = (length(vLocal / axes) - 1.0) * axes.y;
    // A slow animal grazes: its head dips on a slow beat (renderer-event-effects Phase 3).
    float graze = (1.0 - smoothstep(0.05, 0.15, vSpeed)) * 0.08 * max(sin(uTime * 1.5 + vPhase), 0.0);
    float headNod = uDetail < 0.5 ? sin(vPhase + vSpeed * 2.0) * vSpeed * 0.045 - graze : 0.0;
    float headDistance = length(vLocal - vec2(1.0, headNod)) - 0.34;
    float d = plain ? length(vLocal) - 1.0 : min(bodyDistance, headDistance);
    // The outline is sized in screen pixels (capped in radii), like the agents' membrane.
    float rimWidth = min(1.8 * vPx, 0.08);
    float cover = 1.0 - smoothstep(-vPx, vPx, d);
    float rim = exp(-abs(d) / rimWidth);
    float alpha = max(cover, rim);
    if (alpha <= 0.004) {
        discard;
    }
    // The interior: a darker back, a slightly lighter flank towards the outline, and the rock layer's relief at full detail.
    float backShade = plain ? 1.0 : mix(0.7, 1.0, smoothstep(-0.9, 0.1, vLocal.x));
    float flank = 0.75 + 0.25 * smoothstep(-0.45, 0.0, d);
    float relief = uDetail < 0.5 ? 0.85 + 0.15 * fbm2(vWorld * 0.045) : 1.0;
    float fill = ${HERD_FILL_SHARE.toFixed(2)} * backShade * flank * relief;
    vec3 rgb = vColor * (cover * fill + rim);
    gl_FragColor = vec4(rgb / alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
