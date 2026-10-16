import { describe, expect, it } from 'vitest';
import { decodeWeights, encodeWeights } from '../../js/evo/base64.js';

describe('weights encoding', () => {
    it.each([1, 2, 3, 4, 7])('round-trips %i floats exactly', (count) => {
        const weights = Float32Array.from({ length: count }, (_, i) => Math.fround(i * 0.37 - 1.1));
        const text = encodeWeights(weights);
        expect(decodeWeights(text, count)).toEqual(weights);
        expect(text).toBe(Buffer.from(weights.buffer).toString('base64'));
    });

    it('rejects the wrong length and non-base64 text', () => {
        const text = encodeWeights(new Float32Array(3));
        expect(() => decodeWeights(text, 4)).toThrow(/weights/);
        expect(() => decodeWeights('!!!!', 1)).toThrow(/weights/);
    });
});
