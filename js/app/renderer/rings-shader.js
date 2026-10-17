// A ring: a quad per ring, a thin line of constant device-pixel width at a world radius, with a faint inner glow.

export const RING_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 iRing;    // x, y, radius (world), width (device px)
attribute vec4 iColor;   // r, g, b, alpha
uniform float uZoom;
varying vec2 vLocal;     // world units from the centre
varying vec4 vRing;
varying vec4 vColor;
void main() {
    float reach = iRing.z + (iRing.w * 3.0 + 2.0) / uZoom;
    vLocal = corner * reach;
    vRing = iRing;
    vColor = iColor;
    gl_Position = projectionMatrix * viewMatrix * vec4(iRing.xy + vLocal, 0.0, 1.0);
}
`;

export const RING_FRAGMENT = /* glsl */ `
uniform float uZoom;
varying vec2 vLocal;
varying vec4 vRing;
varying vec4 vColor;
void main() {
    float px = abs(length(vLocal) - vRing.z) * uZoom;      // distance to the ring line in device px
    float line = 1.0 - smoothstep(vRing.w * 0.5, vRing.w * 0.5 + 1.0, px);
    float glow = exp(-px * 0.22) * 0.18;
    gl_FragColor = vec4(vColor.rgb * vColor.a * (line + glow), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
