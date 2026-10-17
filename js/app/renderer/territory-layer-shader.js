// The territory quad: the world as one quad over the texture `territoryPixels` writes, added to the frame.

import { HAZE_VERTEX } from './haze-layer-shader.js';

export const TERRITORY_VERTEX = HAZE_VERTEX;

export const TERRITORY_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
    vec4 c = texture2D(uMap, vUv);
    gl_FragColor = vec4(c.rgb * c.a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
