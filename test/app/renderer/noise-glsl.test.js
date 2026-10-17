import { describe, expect, it } from 'vitest';
import { NOISE_GLSL } from '../../../js/app/renderer/noise-glsl.js';

describe('NOISE_GLSL', () => {
    it('defines the noise functions the haze and smoke shaders call', () => {
        for (const fn of ['hash21', 'valueNoise', 'fbm2']) {
            expect(NOISE_GLSL).toContain(`float ${fn}(`);
        }
    });
});
