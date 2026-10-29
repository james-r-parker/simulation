import { describe, expect, it } from 'vitest';
import {
    PACKED_SHAPE_FLOATS,
    SHAPE_FLOATS,
    packRockShape,
    rockOutline,
    rockShape,
} from '../../../js/app/renderer/rock-shape.js';

describe('rockShape and rockOutline', () => {
    it('is deterministic for same seed and slot', () => {
        const out1 = new Float32Array(SHAPE_FLOATS);
        const out2 = new Float32Array(SHAPE_FLOATS);
        rockShape(42, 3, out1);
        rockShape(42, 3, out2);
        expect(Array.from(out1)).toEqual(Array.from(out2));
    });

    it('differs between different slots and different seeds', () => {
        const outSlotA = rockShape(42, 0);
        const outSlotB = rockShape(42, 1);
        const outSeedB = rockShape(43, 0);
        expect(Array.from(outSlotA)).not.toEqual(Array.from(outSlotB));
        expect(Array.from(outSlotA)).not.toEqual(Array.from(outSeedB));
    });

    it('fills the preallocated array it is given and returns it', () => {
        const buffer = new Float32Array(SHAPE_FLOATS);
        const returned = rockShape(1234, 5, buffer);
        expect(returned).toBe(buffer);
        expect(buffer.some((v) => v !== 0)).toBe(true);
    });

    it('ensures harmonic amplitudes sum to at most 1.0', () => {
        for (let seed = 1; seed <= 100; seed++) {
            const shape = rockShape(seed, seed % 10);
            const sumAmplitudes = shape[0] + shape[1] + shape[2];
            expect(sumAmplitudes).toBeGreaterThan(0);
            expect(sumAmplitudes).toBeLessThanOrEqual(1.000001);
        }
    });

    it('stays strictly in [0.88, 1.0] for 1000 seeds and 360 angles', () => {
        const shape = new Float32Array(SHAPE_FLOATS);
        const angleStep = (2 * Math.PI) / 360;

        for (let s = 1; s <= 1000; s++) {
            rockShape(s, s % 16, shape);
            for (let a = 0; a < 360; a += 15) {
                const angle = a * angleStep;
                const r = rockOutline(shape, angle);
                expect(r).toBeGreaterThanOrEqual(0.879999);
                expect(r).toBeLessThanOrEqual(1.000001);
            }
        }
    });

    it('scales by radius argument when provided', () => {
        const shape = rockShape(99, 2);
        const r1 = rockOutline(shape, 1.2, 10);
        const rDefault = rockOutline(shape, 1.2);
        expect(r1).toBeCloseTo(rDefault * 10, 5);
    });

    it('packs 7 floats into vec4 array via packRockShape', () => {
        const shape = rockShape(100, 4);
        const packed = new Float32Array(PACKED_SHAPE_FLOATS);
        const ret = packRockShape(shape, packed);
        expect(ret).toBe(packed);
        expect(packed[3]).toBe(shape[6]); // lichen seed
        expect(packed[0]).toBeGreaterThanOrEqual(0);
    });
});
