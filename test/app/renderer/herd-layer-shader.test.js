import { describe, expect, it } from 'vitest';
import { HERD_FILL_SHARE } from '../../../js/app/renderer/colors.js';
import { HERD_FRAGMENT, HERD_QUAD, HERD_VERTEX } from '../../../js/app/renderer/herd-layer-shader.js';

describe('herd shape shaders', () => {
    it('turns the head lobe with the heading, links gait to speed and shades a darker back', () => {
        expect(HERD_VERTEX).toContain('iMotion.x');
        expect(HERD_VERTEX).toContain('sin(uTime * (1.2 + speed * 3.8)');
        expect(HERD_FRAGMENT).toContain('headDistance');
        expect(HERD_FRAGMENT).toContain('backShade');
        expect(HERD_FRAGMENT).toContain('fbm2(vWorld');
    });

    it('draws a plain disc at the plain detail level', () => {
        expect(HERD_FRAGMENT).toContain('bool plain = uDetail > 1.5;');
        expect(HERD_FRAGMENT).toContain('plain ? length(vLocal) - 1.0');
    });

    it('outlines the body with a pixel-sized membrane over a darker fill sized to the trample radius', () => {
        expect(HERD_FRAGMENT).toContain('float rimWidth = min(1.8 * vPx, 0.08);');
        expect(HERD_FRAGMENT).toContain('vColor * (cover * fill + rim)');
        expect(HERD_FRAGMENT).toContain(`float fill = ${HERD_FILL_SHARE.toFixed(2)}`);
        expect(HERD_QUAD.along).toBeGreaterThan(1.34);
        expect(HERD_QUAD.across).toBeGreaterThan(1);
    });
});
