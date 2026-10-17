import { describe, expect, it } from 'vitest';
import { createParticles, MOTE_COUNT, moteSeeds, motesAt } from '../../../js/app/renderer/particles.js';

describe('moteSeeds', () => {
    it('is the same for the same seed and in [0, 1)', () => {
        const a = moteSeeds(50, 7);
        expect(Array.from(a)).toEqual(Array.from(moteSeeds(50, 7)));
        expect(Array.from(a)).not.toEqual(Array.from(moteSeeds(50, 8)));
        expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
    });
});

describe('motesAt', () => {
    it('draws 700, halves at level 1 and none at level 2', () => {
        expect(MOTE_COUNT).toBe(700);
        expect(motesAt(0)).toBe(700);
        expect(motesAt(1)).toBe(350);
        expect(motesAt(2)).toBe(0);
        expect(motesAt(9)).toBe(0);
    });
});

describe('createParticles', () => {
    it('sets the draw range by quality and the time uniform each frame', () => {
        const layer = createParticles({ seed: 3 });
        expect(layer.object.geometry.drawRange.count).toBe(700);
        layer.setQuality?.(1);
        expect(layer.object.geometry.drawRange.count).toBe(350);
        layer.setQuality?.(2);
        expect(layer.object.geometry.drawRange.count).toBe(0);
        layer.update?.(/** @type {any} */ ({ nowMs: 4000 }));
        expect(layer.object.material.uniforms.uTime.value).toBe(4);
        layer.dispose();
    });
});
