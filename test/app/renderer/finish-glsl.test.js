import { describe, expect, it } from 'vitest';
import {
    FINISH_NOISE_GLSL,
    INTERLEAVED_FRAME_OFFSET,
    INTERLEAVED_MAGIC1,
    INTERLEAVED_MAGIC2,
    INTERLEAVED_MULT,
    interleavedNoise,
} from '../../../js/app/renderer/finish-glsl.js';

describe('finish-glsl interleaved noise', () => {
    it('GLSL string contains the exact constants used by the JS reference', () => {
        expect(FINISH_NOISE_GLSL).toContain(String(INTERLEAVED_MAGIC1));
        expect(FINISH_NOISE_GLSL).toContain(String(INTERLEAVED_MAGIC2));
        expect(FINISH_NOISE_GLSL).toContain(String(INTERLEAVED_MULT));
        expect(FINISH_NOISE_GLSL).toContain(String(INTERLEAVED_FRAME_OFFSET));
    });

    it('stays strictly within [0, 1)', () => {
        for (let x = 0; x < 64; x++) {
            for (let y = 0; y < 64; y++) {
                const val = interleavedNoise(x, y, 0);
                expect(val).toBeGreaterThanOrEqual(0);
                expect(val).toBeLessThan(1);
            }
        }
    });

    it('has mean 0.5 within 0.02 over 4096 pixels', () => {
        let sum = 0;
        const total = 4096;
        for (let x = 0; x < 64; x++) {
            for (let y = 0; y < 64; y++) {
                sum += interleavedNoise(x, y, 0);
            }
        }
        const mean = sum / total;
        expect(mean).toBeGreaterThanOrEqual(0.48);
        expect(mean).toBeLessThanOrEqual(0.52);
    });

    it('differs between consecutive frames at the same pixel', () => {
        let differences = 0;
        for (let i = 0; i < 50; i++) {
            if (interleavedNoise(i, i, 0) !== interleavedNoise(i, i, 1)) {
                differences += 1;
            }
        }
        expect(differences).toBe(50);
    });
});
