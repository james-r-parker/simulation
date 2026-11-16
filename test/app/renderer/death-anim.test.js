import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../../js/sim/events.js';
import { clipForTween, CLIPS, CH } from '../../../js/app/renderer/clips.js';
import { sampleClip } from '../../../js/app/renderer/clip-sampler.js';
import {
    animFor,
    CARCASS_SCALE,
    DEATH_ANIMS,
    DEATH_MS,
    DEFAULT_DEATH,
    fadeOf,
    progressOf,
} from '../../../js/app/renderer/death-anim.js';

describe('DEATH_ANIMS', () => {
    it('has an animation for every death cause the sim names', () => {
        for (const name of Object.keys(DEATH_CAUSE)) {
            expect(DEATH_ANIMS, name).toHaveProperty(name);
        }
    });

    it('plays a clip that exists, on a tween kind that names it, for 0.6 to 2 seconds', () => {
        for (const [name, anim] of Object.entries(DEATH_ANIMS)) {
            expect(CLIPS, name).toHaveProperty(anim.clip);
            expect(clipForTween(anim.kind), name).toBe(anim.clip);
            expect(anim.ms).toBeGreaterThanOrEqual(DEATH_MS.min);
            expect(anim.ms).toBeLessThanOrEqual(DEATH_MS.max);
        }
    });

    it('links only a kill to the carcass: that clip ends at the carcass size', () => {
        const linked = Object.entries(DEATH_ANIMS).filter(([, anim]) => anim.carcass);
        expect(linked.map(([name]) => name)).toEqual(['EATEN']);
        const end = sampleClip(/** @type {any} */ (CLIPS).rupture, 1);
        expect(end[CH.sx]).toBeCloseTo(CARCASS_SCALE);
        expect(end[CH.sy]).toBeCloseTo(CARCASS_SCALE);
    });

    it('does not pop: every clip leaves the body drawn at its end or fades first', () => {
        for (const anim of Object.values(DEATH_ANIMS)) {
            expect(anim.fadeFrom).toBeGreaterThan(0);
            expect(anim.fadeFrom).toBeLessThan(1);
            expect(fadeOf(anim, 1)).toBe(1);
        }
    });
});

describe('animFor', () => {
    it('falls back to starvation for an unknown or missing cause', () => {
        expect(animFor('NOPE')).toBe(DEATH_ANIMS[DEFAULT_DEATH]);
        expect(animFor(undefined)).toBe(DEATH_ANIMS[DEFAULT_DEATH]);
        expect(animFor('EATEN')).toBe(DEATH_ANIMS.EATEN);
    });
});

describe('progressOf and fadeOf', () => {
    it('progress is the clamped share of the length and fade is 0 until fadeFrom then smooth to 1', () => {
        const anim = DEATH_ANIMS.STARVED;
        expect(progressOf(anim, -5)).toBe(0);
        expect(progressOf(anim, anim.ms / 2)).toBeCloseTo(0.5);
        expect(progressOf(anim, anim.ms * 3)).toBe(1);
        expect(fadeOf(anim, anim.fadeFrom)).toBe(0);
        const mid = fadeOf(anim, (anim.fadeFrom + 1) / 2);
        expect(mid).toBeCloseTo(0.5);
        expect(fadeOf(anim, 0.9)).toBeGreaterThan(mid);
    });
});
