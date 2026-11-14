import { describe, expect, it } from 'vitest';
import { CH, CHANNELS, CLIPS } from '../../../js/app/renderer/clips.js';
import {
    applyClip,
    bakeClips,
    CLIP_SAMPLES,
    keyedAt,
    restRig,
    sampleClip,
} from '../../../js/app/renderer/clip-sampler.js';
import { easeAt, FX_EASE } from '../../../js/app/renderer/fx-curves.js';

/** A naive reference: walk the keys from the start every time. @param {any[][]} keys @param {number} t @returns {number} */
function naive(keys, t) {
    let prev = keys[0];
    if (t <= prev[0]) {
        return prev[1];
    }
    for (const key of keys) {
        if (t <= key[0] && key !== keys[0]) {
            const u = (t - prev[0]) / (key[0] - prev[0] || 1);
            return prev[1] + (key[1] - prev[1]) * easeAt(u, FX_EASE.indexOf(key[2] ?? 'linear'));
        }
        prev = key;
    }
    return prev[1];
}

const TABLE = bakeClips(CLIPS);

describe('sampleClip', () => {
    it('matches a naive key walk at 1000 times on every track', () => {
        for (const clip of Object.values(CLIPS)) {
            for (const track of clip.tracks) {
                for (let i = 0; i <= 1000; i++) {
                    expect(keyedAt(track.keys, i / 1000)).toBeCloseTo(
                        naive(/** @type {any} */ (track.keys), i / 1000),
                        6,
                    );
                }
            }
        }
    });

    it('rests every channel a clip has no track for', () => {
        const out = sampleClip(CLIPS.graze, 0.5);
        expect(out[CH.head]).toBeCloseTo(0.3);
        expect(out[CH.sx]).toBe(1);
        expect(out[CH.tx]).toBe(0);
    });
});

describe('the baked table', () => {
    it('equals sampleClip within 1/64 of a clip for one-shots and loops', () => {
        const rig = new Float32Array(CHANNELS.length);
        for (const [name, clip] of Object.entries(CLIPS)) {
            for (let i = 0; i < 50; i++) {
                const t = i / 50;
                restRig(rig, 0);
                applyClip(TABLE, TABLE.ids[name], t, { amp: 1, rig, at: 0 });
                const near = [
                    sampleClip(clip, t),
                    sampleClip(clip, Math.max(t - 1 / CLIP_SAMPLES, 0)),
                    sampleClip(clip, Math.min(t + 1 / CLIP_SAMPLES, 1)),
                ];
                for (let c = 0; c < CHANNELS.length; c++) {
                    const lo = Math.min(...near.map((n) => n[c])) - 1e-4;
                    const hi = Math.max(...near.map((n) => n[c])) + 1e-4;
                    expect(rig[c], `${name}.${CHANNELS[c]} at ${t}`).toBeGreaterThanOrEqual(lo);
                    expect(rig[c], `${name}.${CHANNELS[c]} at ${t}`).toBeLessThanOrEqual(hi);
                }
            }
        }
    });

    it('wraps a loop: phase 1.25 samples as 0.25', () => {
        const a = new Float32Array(CHANNELS.length);
        const b = new Float32Array(CHANNELS.length);
        restRig(a, 0);
        restRig(b, 0);
        applyClip(TABLE, TABLE.ids.swim, 0.25, { amp: 1, rig: a, at: 0 });
        applyClip(TABLE, TABLE.ids.swim, 1.25, { amp: 1, rig: b, at: 0 });
        expect(Array.from(b)).toEqual(Array.from(a));
    });
});

describe('applyClip', () => {
    it('layers clips: scales multiply, the rest add, and amp scales the offset from rest', () => {
        const rig = new Float32Array(CHANNELS.length * 2);
        restRig(rig, 12);
        applyClip(TABLE, TABLE.ids.sated, 0, { amp: 1, rig, at: 12 });
        applyClip(TABLE, TABLE.ids.sated, 0, { amp: 0.5, rig, at: 12 });
        expect(rig[12 + CH.sy]).toBeCloseTo(1.08 * 1.04);
        applyClip(TABLE, TABLE.ids.graze, 0.5, { amp: 1, rig, at: 12 });
        applyClip(TABLE, TABLE.ids.graze, 0.5, { amp: 1, rig, at: 12 });
        expect(rig[12 + CH.head]).toBeCloseTo(0.6);
        expect(rig[CH.sy]).toBe(0);
    });

    it('does nothing for a negative clip id', () => {
        const rig = new Float32Array(CHANNELS.length);
        restRig(rig, 0);
        applyClip(TABLE, -1, 0.5, { amp: 1, rig, at: 0 });
        expect(rig[CH.sx]).toBe(1);
    });
});
