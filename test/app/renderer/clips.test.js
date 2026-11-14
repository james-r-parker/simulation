import { describe, expect, it } from 'vitest';
import { TWEEN } from '../../../js/app/renderer/body-tweens.js';
import { CHANNELS, clipForTween, CLIPS, REST, SCALES } from '../../../js/app/renderer/clips.js';
import { FX_EASE } from '../../../js/app/renderer/fx-curves.js';

describe('clips', () => {
    it('maps every tween kind to a clip and nothing to TWEEN.NONE', () => {
        expect(clipForTween(TWEEN.NONE)).toBeNull();
        for (const [name, kind] of Object.entries(TWEEN).slice(1)) {
            const clip = clipForTween(kind);
            expect(clip, name).not.toBeNull();
            expect(CLIPS[/** @type {keyof typeof CLIPS} */ (clip)], name).toBeDefined();
        }
        expect(clipForTween(99)).toBeNull();
    });

    it('keys every track sorted in 0 to 1, starting at 0 and ending at 1, on a known channel and ease', () => {
        for (const [name, clip] of Object.entries(CLIPS)) {
            for (const track of clip.tracks) {
                expect(CHANNELS, `${name}.${track.channel}`).toContain(track.channel);
                const times = track.keys.map((k) => /** @type {number} */ (k[0]));
                expect(times[0], name).toBe(0);
                expect(times[times.length - 1], name).toBe(1);
                times.slice(1).forEach((t, i) => expect(t, name).toBeGreaterThanOrEqual(times[i]));
                for (const key of track.keys) {
                    if (key[2] !== undefined) {
                        expect(FX_EASE, name).toContain(key[2]);
                    }
                }
            }
        }
    });

    it('starts and ends every loop at the same value, so it wraps without a jump', () => {
        for (const [name, clip] of Object.entries(CLIPS)) {
            if (!clip.loop) {
                continue;
            }
            expect(/** @type {any} */ (clip).rate, name).toBeGreaterThan(0);
            for (const track of clip.tracks) {
                expect(track.keys[0][1], `${name}.${track.channel}`).toBeCloseTo(
                    /** @type {number} */ (track.keys[track.keys.length - 1][1]),
                );
            }
        }
    });

    it('rests scales at 1 and the rest at 0', () => {
        REST.forEach((rest, c) => expect(rest).toBe(SCALES[c] ? 1 : 0));
    });
});
