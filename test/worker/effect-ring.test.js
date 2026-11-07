import { describe, expect, it } from 'vitest';
import { beginEffect, EFFECT_CAPACITY, EFFECT_KIND, EFFECT_WORDS, placeEffect } from '../../js/worker/effect-ring.js';

describe('the effect ring', () => {
    it('writes kind and tick at the next slot, then drops the oldest once full', () => {
        const buffer = new ArrayBuffer(EFFECT_CAPACITY * EFFECT_WORDS * 4);
        const log = { u32: new Uint32Array(buffer), f32: new Float32Array(buffer), start: 0, count: 0, dropped: 0 };
        const o = beginEffect(log, EFFECT_KIND.BITE, 9);
        placeEffect(log, o, 1.5, 2.5);
        expect([log.u32[0], log.u32[1], log.f32[2], log.f32[3]]).toEqual([EFFECT_KIND.BITE, 9, 1.5, 2.5]);
        for (let i = 1; i < EFFECT_CAPACITY + 2; i++) {
            beginEffect(log, EFFECT_KIND.BORN, i);
        }
        expect(log.count).toBe(EFFECT_CAPACITY);
        expect(log.dropped).toBe(2);
        expect(log.start).toBe(2);
    });

    it('numbers the world kinds after the strain', () => {
        expect([EFFECT_KIND.HERD_DIED, EFFECT_KIND.DUNG_DROPPED, EFFECT_KIND.CALF_BORN]).toEqual([12, 13, 14]);
        expect([EFFECT_KIND.PATCH_WILTED, EFFECT_KIND.FIRST_KILL]).toEqual([15, 16]);
    });
});
