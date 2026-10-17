import { describe, expect, it } from 'vitest';
import { TERRITORY_FRAGMENT, TERRITORY_VERTEX } from '../../../js/app/renderer/territory-layer-shader.js';

describe('territory shader', () => {
    it('reads the territory texture and places the quad over the world', () => {
        expect(TERRITORY_FRAGMENT).toContain('uMap');
        expect(TERRITORY_FRAGMENT).toContain('c.rgb * c.a');
        expect(TERRITORY_VERTEX).toContain('uWorld');
    });
});
