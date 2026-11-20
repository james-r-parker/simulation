import { describe, expect, it } from 'vitest';
import { DEATH_CAUSE } from '../../../js/sim/events.js';
import { clipForTween, CLIPS, CH } from '../../../js/app/renderer/clips.js';
import { sampleClip } from '../../../js/app/renderer/clip-sampler.js';
import {
    animFor,
    BREAK_MS,
    breakOf,
    CARCASS_SCALE,
    DEATH_ANIMS,
    DEATH_MS,
    DEFAULT_DEATH,
    FAIL_MS,
    fadeOf,
    laneOf,
    LEAVE_MS,
    progressOf,
    tearBearing,
    tearOf,
} from '../../../js/app/renderer/death-anim.js';

describe('DEATH_ANIMS', () => {
    it('has an animation for every death cause the sim names', () => {
        for (const name of Object.keys(DEATH_CAUSE)) {
            expect(DEATH_ANIMS, name).toHaveProperty(name);
        }
    });

    it('plays a clip that exists, on a tween kind that names it, in three beats of the lengths the plan sets', () => {
        for (const [name, anim] of Object.entries(DEATH_ANIMS)) {
            expect(CLIPS, name).toHaveProperty(anim.clip);
            expect(clipForTween(anim.kind), name).toBe(anim.clip);
            expect(FAIL_MS).toBe(400);
            expect(anim.breakMs, name).toBeGreaterThanOrEqual(BREAK_MS.min);
            expect(anim.breakMs, name).toBeLessThanOrEqual(BREAK_MS.max);
            expect(anim.leaveMs, name).toBeGreaterThanOrEqual(LEAVE_MS.min);
            expect(anim.leaveMs, name).toBeLessThanOrEqual(LEAVE_MS.max);
            expect(anim.ms, name).toBe(FAIL_MS + anim.breakMs + anim.leaveMs);
            expect(anim.ms, name).toBeGreaterThanOrEqual(DEATH_MS.min);
            expect(anim.ms, name).toBeLessThanOrEqual(DEATH_MS.max);
        }
    });

    it('breaks each cause its own way: the total length differs by cause, and only old age opens no gap', () => {
        const total = new Set(Object.values(DEATH_ANIMS).map((a) => a.ms));
        expect(total.size).toBeGreaterThanOrEqual(6);
        const noGap = Object.entries(DEATH_ANIMS).filter(([, a]) => a.tear.where === 'none' || a.tear.depth === 0);
        expect(noGap.map(([name]) => name)).toEqual(['OLD_AGE']);
        expect(DEATH_ANIMS.EATEN.tear.where).toBe('bite');
        expect(DEATH_ANIMS.STARVED.tear.where).toBe('low');
        expect(DEATH_ANIMS.DISEASE.tear.scatter).toBe(true);
        expect(DEATH_ANIMS.POISONED.tear.scatter).toBe(true);
        expect(DEATH_ANIMS.EATEN.tear.scatter).toBe(false);
    });

    it('links only a kill to the carcass: that clip ends at the carcass size', () => {
        const linked = Object.entries(DEATH_ANIMS).filter(([, anim]) => anim.carcass);
        expect(linked.map(([name]) => name)).toEqual(['EATEN']);
        const end = sampleClip(/** @type {any} */ (CLIPS).rupture, 1);
        expect(end[CH.sx]).toBeCloseTo(CARCASS_SCALE);
        expect(end[CH.sy]).toBeCloseTo(CARCASS_SCALE);
    });

    it('does not pop: every death ends fully faded, and the tear and the colour drain finish before any opacity falls', () => {
        for (const [name, anim] of Object.entries(DEATH_ANIMS)) {
            expect(fadeOf(anim, anim.ms), name).toBe(1);
            expect(tearOf(anim, FAIL_MS + anim.breakMs), name).toBe(1);
            expect(fadeOf(anim, FAIL_MS + anim.breakMs), name).toBe(0);
            for (let t = 0; t <= FAIL_MS + anim.breakMs; t += 25) {
                expect(fadeOf(anim, t), `${name} at ${t}`).toBe(0);
            }
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

describe('the beats on the clock', () => {
    it('the failing beat tears and fades nothing, the breaking beat runs the clip, the leaving beat fades', () => {
        for (const anim of Object.values(DEATH_ANIMS)) {
            expect(breakOf(anim, -5)).toBe(0);
            expect(breakOf(anim, FAIL_MS)).toBe(0);
            expect(breakOf(anim, FAIL_MS + anim.breakMs / 2)).toBeCloseTo(0.5);
            expect(breakOf(anim, anim.ms * 3)).toBe(1);
            expect(tearOf(anim, FAIL_MS)).toBe(0);
            expect(fadeOf(anim, FAIL_MS + anim.breakMs + anim.leaveMs / 2)).toBeCloseTo(0.5);
        }
    });

    it('progressOf is the clamped share of the whole death', () => {
        const anim = DEATH_ANIMS.STARVED;
        expect(progressOf(anim, -5)).toBe(0);
        expect(progressOf(anim, anim.ms / 2)).toBeCloseTo(0.5);
        expect(progressOf(anim, anim.ms * 3)).toBe(1);
    });

    it('the tear is monotonic and the lane value (tear plus fade) rises from 0 to 2 without a step', () => {
        for (const [name, anim] of Object.entries(DEATH_ANIMS)) {
            let tear = 0;
            let lane = 0;
            for (let t = 0; t <= anim.ms; t += 10) {
                expect(tearOf(anim, t), name).toBeGreaterThanOrEqual(tear);
                expect(laneOf(anim, t), name).toBeGreaterThanOrEqual(lane);
                expect(laneOf(anim, t) - lane, name).toBeLessThan(0.1);
                tear = tearOf(anim, t);
                lane = laneOf(anim, t);
            }
            expect(laneOf(anim, 0), name).toBe(0);
            expect(laneOf(anim, anim.ms), name).toBe(2);
        }
    });

    it('drains the colour before the opacity: at every moment the drain is full whenever any fade has begun', () => {
        for (const anim of Object.values(DEATH_ANIMS)) {
            for (let t = 0; t <= anim.ms; t += 10) {
                if (fadeOf(anim, t) > 0) {
                    expect(Math.min(laneOf(anim, t), 1)).toBe(1);
                }
            }
        }
    });
});

describe('tearBearing', () => {
    const body = { bearing: 1.2, genome: 7 };

    it('opens towards the bite, at the lowest point, a quarter turn from the heading or at the stored heading', () => {
        expect(tearBearing(DEATH_ANIMS.EATEN.tear, body)).toBe(1.2);
        expect(tearBearing(DEATH_ANIMS.STARVED.tear, body)).toBeCloseTo(-Math.PI / 2);
        expect(tearBearing(DEATH_ANIMS.TRAMPLED.tear, body)).toBeCloseTo(1.2 + Math.PI / 2);
        expect(tearBearing(DEATH_ANIMS.COLLISION.tear, body)).toBe(1.2);
    });

    it('scatters from a bearing of the body own, steady for a genome and different between genomes, none for old age', () => {
        const a = tearBearing(DEATH_ANIMS.DISEASE.tear, { bearing: 0, genome: 7 });
        expect(tearBearing(DEATH_ANIMS.DISEASE.tear, { bearing: 3, genome: 7 })).toBe(a);
        expect(tearBearing(DEATH_ANIMS.DISEASE.tear, { bearing: 0, genome: 8 })).not.toBe(a);
        expect(tearBearing(DEATH_ANIMS.OLD_AGE.tear, body)).toBe(0);
    });
});
