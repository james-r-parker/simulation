import { describe, expect, it } from 'vitest';
import { captionFor } from '../../../js/app/director/captions.js';
import { findMoments } from '../../../js/app/director/moments.js';
import {
    DIE_OFF_MIN,
    DIE_OFF_WINDOW_S,
    findSceneMoments,
    scoreDieOff,
    scoreSceneEffect,
} from '../../../js/app/director/moments-scenes.js';
import { MOMENT_KIND } from '../../../js/app/director/scoring.js';

const KINDS = { DIED: 2, PACK_CALL: 5, STRAIN_EMERGED: 11, HERD_DIED: 12, PATCH_WILTED: 15 };
const LAYOUT = { effectKinds: KINDS, deathCauses: { STARVED: 0, EATEN: 1 } };
const INFO = { ticksPerSecond: 60, worldWidth: 1000, worldHeight: 800, specs: [] };

/**
 * @param {number} kind the effect kind
 * @param {Partial<{tick: number, x: number, y: number, c: number}>} [over] fields
 * @returns {any} an effect record
 */
function fx(kind, over = {}) {
    return { kind, tick: 600, x: 10, y: 20, a: 1, b: 2, c: 0, d: 0, ...over };
}

describe('scoreSceneEffect', () => {
    it('scores each scene effect from its start score, fading to nothing over its window', () => {
        const at = (/** @type {number} */ kind, /** @type {number} */ ageS) =>
            scoreSceneEffect(fx(kind), { ageS, kinds: KINDS });
        expect(at(KINDS.HERD_DIED, 0)).toEqual({ kind: MOMENT_KIND.CARCASS, score: 60 });
        expect(at(KINDS.PACK_CALL, 4)).toEqual({ kind: MOMENT_KIND.PACK_CALL, score: 30 });
        expect(at(KINDS.PATCH_WILTED, 0)?.kind).toBe(MOMENT_KIND.PATCH_WILT);
        expect(at(KINDS.STRAIN_EMERGED, 5)).toEqual({ kind: MOMENT_KIND.STRAIN, score: 35 });
    });

    it('ignores an effect that is not a scene, a future one and an expired one', () => {
        const ctx = { kinds: KINDS };
        expect(scoreSceneEffect(fx(3), { ...ctx, ageS: 1 })).toBeNull();
        expect(scoreSceneEffect(fx(KINDS.HERD_DIED), { ...ctx, ageS: -1 })).toBeNull();
        expect(scoreSceneEffect(fx(KINDS.HERD_DIED), { ...ctx, ageS: 10 })).toBeNull();
    });
});

describe('scoreDieOff', () => {
    it('scores a die-off from the minimum starved deaths, capped', () => {
        expect([scoreDieOff(DIE_OFF_MIN - 1), scoreDieOff(DIE_OFF_MIN), scoreDieOff(20)]).toEqual([0, 65, 70]);
    });
});

describe('findSceneMoments', () => {
    const ctx = { tick: 600, ticksPerSecond: 60, layout: LAYOUT };
    const starved = (/** @type {number} */ x) => fx(KINDS.DIED, { x, c: 0 });

    it('finds a carcass, a pack call, a wilt and a strain at their effect', () => {
        const moments = findSceneMoments(
            [fx(KINDS.HERD_DIED), fx(KINDS.PACK_CALL), fx(KINDS.PATCH_WILTED), fx(KINDS.STRAIN_EMERGED)],
            ctx,
        );
        expect(moments.map((m) => m.kind).sort()).toEqual(
            [MOMENT_KIND.CARCASS, MOMENT_KIND.PACK_CALL, MOMENT_KIND.PATCH_WILT, MOMENT_KIND.STRAIN].sort(),
        );
        expect(moments.every((m) => m.y === 20)).toBe(true);
    });

    it('finds a die-off from starved deaths close together in the window, not eaten ones or old ones', () => {
        const near = [0, 1, 2, 3].map((k) => starved(100 + k * 20));
        const [dieOff] = findSceneMoments(near, ctx);
        expect(dieOff).toMatchObject({ kind: MOMENT_KIND.DIE_OFF, count: 4 });
        const eaten = near.map((e) => ({ ...e, c: 1 << 8 }));
        expect(findSceneMoments(eaten, ctx)).toEqual([]);
        const old = near.map((e) => ({ ...e, tick: 600 - (DIE_OFF_WINDOW_S + 1) * 60 }));
        expect(findSceneMoments(old, ctx)).toEqual([]);
        expect(findSceneMoments(near.slice(0, 3), ctx)).toEqual([]);
    });

    it('needs the starved death cause in the layout', () => {
        const near = [0, 1, 2, 3].map((k) => starved(100 + k * 20));
        expect(findSceneMoments(near, { ...ctx, layout: { effectKinds: KINDS } })).toEqual([]);
    });
});

describe('scene moments in findMoments and their captions', () => {
    it('joins the candidates findMoments ranks', () => {
        const found = findMoments({
            snapshot: [],
            effects: [fx(KINDS.STRAIN_EMERGED)],
            info: INFO,
            layout: LAYOUT,
            tick: 600,
        });
        expect(found.map((m) => m.kind)).toEqual([MOMENT_KIND.STRAIN]);
    });

    it('captions each scene kind', () => {
        expect(captionFor({ kind: MOMENT_KIND.CARCASS })).toBe('A carcass, and who comes for it');
        expect(captionFor({ kind: MOMENT_KIND.PACK_CALL })).toBe('The pack is called');
        expect(captionFor({ kind: MOMENT_KIND.PATCH_WILT })).toBe('A patch dies');
        expect(captionFor({ kind: MOMENT_KIND.STRAIN })).toBe('A new strain');
        expect(captionFor({ kind: MOMENT_KIND.DIE_OFF, count: 7 })).toBe('Die-off - 7 starve');
        expect(captionFor({ kind: MOMENT_KIND.DIE_OFF })).toBe('Die-off - 4 starve');
    });
});
