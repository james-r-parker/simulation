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
