import { describe, expect, it } from 'vitest';
import { HERD_FRAGMENT, HERD_VERTEX } from '../../../js/app/renderer/herd-layer-shader.js';

describe('herd shape shaders', () => {
    it('turns the head lobe with the heading, links gait to speed and shades a darker back', () => {
        expect(HERD_VERTEX).toContain('iMotion.x');
        expect(HERD_VERTEX).toContain('sin(uTime * (1.2 + speed * 3.8)');
        expect(HERD_FRAGMENT).toContain('headDistance');
        expect(HERD_FRAGMENT).toContain('backShade');
        expect(HERD_FRAGMENT).toContain('fbm2(vWorld');
    });
});
