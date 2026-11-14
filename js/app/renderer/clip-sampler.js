// Samples the animation clips of `clips.js`: `sampleClip` evaluates one clip's keys exactly (the reference), `bakeClips`
// tabulates every clip at `CLIP_SAMPLES` points, and `applyClip` layers a baked clip onto an agent's rig channels by
// blending two neighbouring samples. `applyClip` allocates nothing, so the packers call it per instance per frame.

import { CHANNELS, REST, SCALES } from './clips.js';
import { easeAt, FX_EASE } from './fx-curves.js';

/** Samples per clip in the baked table. */
export const CLIP_SAMPLES = 64;
const N = CHANNELS.length;

/**
 * @param {readonly (number | string)[][]} keys `[t, value, ease]` keys, sorted by `t`
 * @param {number} t 0 to 1
 * @returns {number} the keyed value at `t`
 */
export function keyedAt(keys, t) {
    if (t <= /** @type {number} */ (keys[0][0])) {
        return /** @type {number} */ (keys[0][1]);
    }
    for (let i = 1; i < keys.length; i++) {
        const [t1, v1, ease] = keys[i];
        if (t <= /** @type {number} */ (t1)) {
            const t0 = /** @type {number} */ (keys[i - 1][0]);
            const v0 = /** @type {number} */ (keys[i - 1][1]);
            const span = /** @type {number} */ (t1) - t0;
            const u = (t - t0) / span;
            const e = easeAt(u, ease === undefined ? 0 : FX_EASE.indexOf(/** @type {string} */ (ease)));
            const v1n = /** @type {number} */ (v1);
            return v0 + (v1n - v0) * e;
        }
    }
    return /** @type {number} */ (keys[keys.length - 1][1]);
}

/**
 * @param {{tracks: readonly {channel: string, keys: readonly (number | string)[][]}[]}} clip a clip
 * @param {number} t 0 to 1 (a loop's phase or a one-shot's age)
 * @param {Float32Array | number[]} [out] receives the twelve channel values; channels without a track rest
 * @returns {Float32Array | number[]} `out`
 */
export function sampleClip(clip, t, out = new Float32Array(N)) {
    for (let c = 0; c < N; c++) {
        out[c] = REST[c];
    }
    for (const track of clip.tracks) {
        out[CHANNELS.indexOf(track.channel)] = keyedAt(track.keys, t);
    }
    return out;
}

/**
 * @typedef {object} ClipTable
 * @property {Float32Array} samples clip-major: `CLIP_SAMPLES` samples of `CHANNELS.length` values per clip
 * @property {Record<string, number>} ids each clip's row
 * @property {Uint8Array} loops 1 where the clip loops
 * @property {Float32Array} rates each loop's rate in Hz, 0 for a one-shot
 */

/**
 * @param {Record<string, {loop: boolean, rate?: number, tracks: readonly {channel: string, keys: readonly (number | string)[][]}[]}>} clips the clips by name
 * @returns {ClipTable} the baked table; a loop's samples span one period (sample `CLIP_SAMPLES` wraps to 0), a
 *   one-shot's run from age 0 to 1 inclusive
 */
export function bakeClips(clips) {
    const names = Object.keys(clips);
    const samples = new Float32Array(names.length * CLIP_SAMPLES * N);
    const loops = new Uint8Array(names.length);
    const rates = new Float32Array(names.length);
    /** @type {Record<string, number>} */
    const ids = {};
    const row = new Float32Array(N);
    names.forEach((name, id) => {
        const clip = clips[name];
        ids[name] = id;
        loops[id] = clip.loop ? 1 : 0;
        rates[id] = clip.rate ?? 0;
        for (let s = 0; s < CLIP_SAMPLES; s++) {
            const t = clip.loop ? s / CLIP_SAMPLES : s / (CLIP_SAMPLES - 1);
            samples.set(sampleClip(clip, t, row), (id * CLIP_SAMPLES + s) * N);
        }
    });
    return { samples, ids, loops, rates };
}

/**
 * Layers a baked clip onto a rig: each channel's offset from rest, times `amp`, adds to an adding channel or scales a
 * scaling one.
 * @param {ClipTable} table the baked clips
 * @param {number} id the clip's row; below 0 does nothing
 * @param {number} t a loop's phase (any real, wrapped) or a one-shot's age (clamped to 0 to 1)
 * @param {{amp: number, rig: Float32Array, at: number}} into the amplitude, the rig array and the offset of this
 *   agent's twelve channels in it
 * @returns {void}
 */
export function applyClip(table, id, t, into) {
    if (id < 0) {
        return;
    }
    const loop = table.loops[id] === 1;
    const pos = loop ? (t - Math.floor(t)) * CLIP_SAMPLES : Math.min(Math.max(t, 0), 1) * (CLIP_SAMPLES - 1);
    const s0 = Math.floor(pos);
    const f = pos - s0;
    const s1 = loop ? (s0 + 1) % CLIP_SAMPLES : Math.min(s0 + 1, CLIP_SAMPLES - 1);
    const a = (id * CLIP_SAMPLES + (s0 % CLIP_SAMPLES)) * N;
    const b = (id * CLIP_SAMPLES + s1) * N;
    const { amp, rig, at } = into;
    const v = table.samples;
    for (let c = 0; c < N; c++) {
        const value = v[a + c] + (v[b + c] - v[a + c]) * f;
        if (SCALES[c]) {
            rig[at + c] *= 1 + (value - 1) * amp;
        } else {
            rig[at + c] += (value - REST[c]) * amp;
        }
    }
}

/**
 * @param {Float32Array} rig the rig array
 * @param {number} at the offset of one agent's channels
 * @returns {void}
 */
export function restRig(rig, at) {
    for (let c = 0; c < N; c++) {
        rig[at + c] = REST[c];
    }
}
