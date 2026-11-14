// The animation clips: keyframe tracks on the twelve rig channels a model's parts bind to. A key is `[t, value, ease]`
// with `t` in 0 to 1; the ease (an `FX_EASE` name) shapes the segment that ends at the key. One-shot clips run once over
// a body tween's age; loops repeat at `rate` Hz and scale by an amplitude the packer gives. Pure data.

import { TWEEN } from './body-tweens.js';

/** The rig channels, in the order of the three rig vec4 attributes. */
export const CHANNELS = Object.freeze([
    'tx',
    'ty',
    'rot',
    'sx',
    'sy',
    'open',
    'eye',
    'flash',
    'ring',
    'ringAlpha',
    'limb',
    'head',
]);
/** Each channel's rest value. */
export const REST = Object.freeze([0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0]);
/** Channels that multiply when clips layer (scales); the rest add. */
export const SCALES = Object.freeze([false, false, false, true, true, false, true, false, true, false, false, false]);
/** The channel index of each name. */
export const CH = Object.freeze(Object.fromEntries(CHANNELS.map((name, i) => [name, i])));

const S = 'sineInOut';

/**
 * @param {string} channel a channel name
 * @param {number} amp the swing either side of rest
 * @returns {{channel: string, keys: (number | string)[][]}} a smooth swing: rest, +amp, rest, -amp, rest
 */
function swing(channel, amp) {
    const rest = REST[CH[channel]];
    return {
        channel,
        keys: [
            [0, rest],
            [0.25, rest + amp, S],
            [0.5, rest, S],
            [0.75, rest - amp, S],
            [1, rest, S],
        ],
    };
}

/**
 * @param {string} channel a channel name
 * @param {number} to the value at the middle of the beat
 * @returns {{channel: string, keys: (number | string)[][]}} a pulse from rest to `to` and back
 */
function pulse(channel, to) {
    const rest = REST[CH[channel]];
    return {
        channel,
        keys: [
            [0, rest],
            [0.5, to, S],
            [1, rest, S],
        ],
    };
}

/**
 * @param {string} channel a channel name
 * @param {string} text keys as `t value [ease]` triples separated by commas
 * @returns {{channel: string, keys: (number | string)[][]}} the track
 */
function track(channel, text) {
    const keys = text.split(',').map((key) => {
        const [t, v, ease] = key.trim().split(/\s+/);
        return ease === undefined ? [Number(t), Number(v)] : [Number(t), Number(v), ease];
    });
    return { channel, keys };
}

/** Every clip by name. */
export const CLIPS = Object.freeze({
    swim: { loop: true, rate: 1.6, tracks: [pulse('sy', 0.92), swing('limb', 0.12)] },
    stalk: {
        loop: true,
        rate: 0.5,
        tracks: [pulse('sx', 1.1), pulse('sy', 0.86), pulse('open', 0.3), pulse('eye', 0.6)],
    },
    flee: { loop: true, rate: 2.5, tracks: [pulse('sx', 1.15), pulse('sy', 0.86), pulse('eye', 1.35)] },
    shiver: { loop: true, rate: 12, tracks: [swing('tx', 0.03), swing('ty', 0.02)] },
    pant: { loop: true, rate: 3, tracks: [pulse('sx', 1.04), pulse('sy', 1.04)] },
    rest: { loop: true, rate: 0.4, tracks: [pulse('sx', 1.04), pulse('sy', 1.04), track('eye', '0 0.15, 1 0.15')] },
    sated: { loop: true, rate: 0.3, tracks: [track('sy', '0 1.08, 1 1.08')] },
    sick: { loop: true, rate: 1.5, tracks: [swing('rot', 0.08)] },
    graze: { loop: true, rate: 0.5, tracks: [pulse('head', 0.3)] },
    gallop: { loop: true, rate: 1.4, tracks: [swing('limb', 0.5), pulse('ty', 0.05)] },
    stampede: { loop: true, rate: 2.6, tracks: [swing('limb', 0.9), pulse('ty', 0.09)] },
    fruitBob: { loop: true, rate: 0.7, tracks: [swing('head', 0.05)] },
    lunge: {
        loop: false,
        tracks: [
            track('sx', '0 1, 0.25 1.3 quadOut, 1 1 backOut'),
            track('sy', '0 1, 0.25 0.88 quadOut, 1 1 backOut'),
            track('open', '0 0, 0.25 1 quadOut, 0.4 0 quadIn, 1 0'),
            track('flash', '0 0, 0.4 0, 0.42 0.8, 1 0 quadOut'),
        ],
    },
    kill: {
        loop: false,
        tracks: [
            track('open', '0 1, 0.12 0 quadIn, 1 0'),
            track('sx', '0 1, 0.15 1.15 quadOut, 0.5 0.95 sineInOut, 1 1 sineInOut'),
            track('sy', '0 1, 0.15 1.1 quadOut, 1 1 sineInOut'),
            track('flash', '0 1, 1 0 quadOut'),
        ],
    },
    flinch: {
        loop: false,
        tracks: [
            track('sx', '0 1, 0.2 0.85 quadOut, 1 1 backOut'),
            track('rot', '0 0, 0.15 0.2, 0.3 -0.2, 0.45 0.12, 0.6 -0.06, 1 0 sineInOut'),
        ],
    },
    gulp: {
        loop: false,
        tracks: [
            track('open', '0 0, 0.3 0.6 quadOut, 0.6 0 quadIn, 1 0'),
            track('sy', '0 1, 0.6 1.1 sineInOut, 1 1 sineInOut'),
        ],
    },
    court: {
        loop: false,
        tracks: [
            track('ty', '0 0, 0.25 0.2 quadOut, 0.5 0 quadIn, 0.75 0.2 quadOut, 1 0 quadIn'),
            track('flash', '0 0, 0.25 0.5, 0.5 0, 0.75 0.5, 1 0'),
        ],
    },
    birthPop: {
        loop: false,
        tracks: [
            track('sx', '0 0.2, 1 1 elasticOut'),
            track('sy', '0 0.2, 1 1 elasticOut'),
            track('flash', '0 1, 1 0 quadOut'),
        ],
    },
    callThrob: {
        loop: false,
        tracks: [
            track('ring', '0 1, 0.5 1.6 quadOut, 0.5001 1, 1 1.6 quadOut'),
            track('ringAlpha', '0 1, 0.5 0, 0.5001 1, 1 0'),
        ],
    },
    howl: {
        loop: false,
        tracks: [
            track('sx', '0 1, 0.3 1.12 quadOut, 1 1 sineInOut'),
            track('open', '0 0, 0.3 0.5 quadOut, 1 0 sineInOut'),
            track('ring', '0 1, 1 1.6 quadOut'),
            track('ringAlpha', '0 1, 1 0'),
        ],
    },
    shakeOff: {
        loop: false,
        tracks: [track('rot', '0 0, 0.12 0.25, 0.25 -0.25, 0.38 0.2, 0.5 -0.15, 0.62 0.08, 1 0 sineInOut')],
    },
    wilt: { loop: false, tracks: [track('ringAlpha', '0 1, 1 0 quadIn'), track('sx', '0 1, 1 0.9 sineInOut')] },
});

/** The clip each `TWEEN` kind plays, by kind number; `null` for none. */
export const TWEEN_CLIPS = Object.freeze([
    null,
    'lunge',
    'flinch',
    'gulp',
    'callThrob',
    'howl',
    'court',
    'birthPop',
    'shakeOff',
    'kill',
]);

/**
 * @param {number} kind a `TWEEN` kind
 * @returns {string | null} the name of the clip it plays, null for `TWEEN.NONE` or an unknown kind
 */
export function clipForTween(kind) {
    return kind > TWEEN.NONE && kind < TWEEN_CLIPS.length ? TWEEN_CLIPS[kind] : null;
}
