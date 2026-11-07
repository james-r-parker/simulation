import { describe, expect, it } from 'vitest';
import { HAZE_FRAGMENT, HAZE_VERTEX } from '../../../js/app/renderer/haze-layer-shader.js';

describe('haze shader', () => {
    it('declares the textures and uniforms the layer sets and includes the noise', () => {
        for (const u of ['uPrev', 'uNext', 'uMix', 'uCap', 'uTime', 'uDanger', 'uAttack', 'uHunt']) {
            expect(HAZE_FRAGMENT).toContain(u);
        }
        expect(HAZE_FRAGMENT).toContain('float fbm2(');
        expect(HAZE_VERTEX).toContain('uWorld');
    });
});

describe('flow and heat map', () => {
    it('advects streaks down the field gradient when it flows, and draws a white-hot heat map under the lens', () => {
        expect(HAZE_FRAGMENT).toContain('vec2 grad = vec2(dFdx(total), dFdy(total));');
        expect(HAZE_FRAGMENT).toContain('if (uFlow > 0.5 && total > 0.01)');
        expect(HAZE_FRAGMENT.match(/texture2D\(/g)).toHaveLength(2);
        expect(HAZE_FRAGMENT).toContain('mix(uDanger, white, smoothstep(0.6, 1.0, hot.r))');
        expect(HAZE_FRAGMENT).toContain('mix(uHunt, white, smoothstep(0.6, 1.0, hot.b))');
    });
});
