// Shaders for the food dots and the obstacle discs. Both draw a quad per instance: `iBody` is x, y, radius and a phase.

/** Food and obstacle quads: world position from the instance, a size floor in device pixels, the local coordinate. */
const VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iBody;   // x, y, radius, phase
uniform float uZoom;    // device pixels per world unit
uniform float uPad;     // extra quad half-size in device pixels (the rim, the soft edge)
uniform float uMinPx;   // smallest radius in device pixels
varying vec2 vLocal;    // in radii
varying float vPx;      // one device pixel in radii
varying float vPhase;
void main() {
    float radius = max(iBody.z, uMinPx / uZoom);
    float halfSize = radius + uPad / uZoom;
    vLocal = corner * halfSize / radius;
    vPx = 1.0 / (uZoom * radius);
    vPhase = iBody.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(iBody.xy + corner * halfSize, 0.0, 1.0);
}
`;

export const FOOD_VERTEX = VERTEX;

export const FOOD_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vLocal;
varying float vPx;
varying float vPhase;
void main() {
    float d = length(vLocal);
    float twinkle = 1.0 + 0.15 * sin(uTime * 2.0943951 + vPhase);   // a 3 s cycle, offset by position
    float core = 1.0 - smoothstep(0.55, 1.0, d);
    float glow = exp(-d * d * 1.6) * 0.45;
    vec3 rgb = uColor * uIntensity * twinkle * (core + glow) * (1.0 - smoothstep(1.0, 2.2, d));
    gl_FragColor = vec4(rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export const OBSTACLE_VERTEX = VERTEX;

export const OBSTACLE_FRAGMENT = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uRim;
uniform float uRimPx;
varying vec2 vLocal;
varying float vPx;
varying float vPhase;
void main() {
    float d = length(vLocal);
    float edge = 1.0 - smoothstep(1.0 - vPx, 1.0 + vPx, d);
    float rimWidth = uRimPx * vPx;
    float rim = smoothstep(1.0 - rimWidth - vPx, 1.0 - rimWidth + vPx, d);
    vec3 rgb = mix(uBody, uRim, rim);
    gl_FragColor = vec4(rgb, edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
