import { describe, expect, it } from 'vitest';
import {
    createBodyTweens,
    startTween,
    TWEEN,
    TWEEN_RANK,
    TWEEN_TICKS,
    tweenAge,
} from '../../../js/app/renderer/body-tweens.js';

const WHO = { slot: 3, genome: 40 };

describe('body tweens', () => {
    it('gives every kind a length and a rank', () => {
        const kinds = Object.values(TWEEN);
        expect(TWEEN_TICKS).toHaveLength(kinds.length);
        expect(TWEEN_RANK).toHaveLength(kinds.length);
        for (const k of kinds.slice(1)) {
            expect(TWEEN_TICKS[k]).toBeGreaterThan(0);
        }
    });

    it('runs a tween from 0 to below 1 over its length, then clears it', () => {
        const t = createBodyTweens(8);
        expect(startTween(t, WHO, TWEEN.GULP, 100)).toBe(true);
        expect(tweenAge(t, 3, 40, 100)).toBe(0);
        expect(tweenAge(t, 3, 40, 106)).toBeCloseTo(0.5);
        expect(tweenAge(t, 3, 40, 100 + TWEEN_TICKS[TWEEN.GULP])).toBe(-1);
        expect(t.kind[3]).toBe(TWEEN.NONE);
    });

    it('a higher-ranked running tween keeps the slot; an equal or higher one replaces it', () => {
        const t = createBodyTweens(8);
        startTween(t, WHO, TWEEN.FLINCH, 100);
        expect(startTween(t, WHO, TWEEN.GULP, 101)).toBe(false);
        expect(t.kind[3]).toBe(TWEEN.FLINCH);
        expect(startTween(t, WHO, TWEEN.BIRTH_POP, 102)).toBe(true);
        expect(t.kind[3]).toBe(TWEEN.BIRTH_POP);
        expect(startTween(t, WHO, TWEEN.GULP, 200)).toBe(true);
    });

    it('drops a tween left by an earlier body in the slot', () => {
        const t = createBodyTweens(8);
        startTween(t, WHO, TWEEN.LUNGE, 100);
        expect(tweenAge(t, 3, 41, 101)).toBe(-1);
        expect(t.kind[3]).toBe(TWEEN.NONE);
    });
});
