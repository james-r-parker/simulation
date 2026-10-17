import { describe, expect, it } from 'vitest';
import { PUFF_HALF, SMOKE_FRAGMENT, SMOKE_VERTEX } from '../../../js/app/renderer/smoke-layer-shader.js';

describe('smoke shader', () => {
    it('has an alpha-only branch for the dimming target and a coloured one for the puff', () => {
        expect(SMOKE_FRAGMENT).toContain('#ifdef ALPHA_ONLY');
        expect(SMOKE_FRAGMENT).toContain('uSmoke');
        expect(SMOKE_FRAGMENT).toContain('uNoise');
        expect(SMOKE_VERTEX).toContain('attribute vec4 iCloud');
        expect(PUFF_HALF).toBeGreaterThan(1);
    });
});
