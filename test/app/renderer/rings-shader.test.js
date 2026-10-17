import { describe, expect, it } from 'vitest';
import { RING_FRAGMENT, RING_VERTEX } from '../../../js/app/renderer/rings-shader.js';

describe('ring shader', () => {
    it('reads the instance ring and colour and the zoom', () => {
        expect(RING_VERTEX).toContain('attribute vec4 iRing');
        expect(RING_VERTEX).toContain('attribute vec4 iColor');
        expect(RING_VERTEX).toContain('uZoom');
        expect(RING_FRAGMENT).toContain('uZoom');
        expect(RING_FRAGMENT).toContain('colorspace_fragment');
    });
});
