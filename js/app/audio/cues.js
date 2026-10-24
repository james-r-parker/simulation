// One-shot audio cues from worker effect records (`BORN`, `DIED` of cause `eaten`, `ALARM`, `PACK_CALL`) and the
// rate limiter (`createCueLimiter`: at most 6 cues a second and 1 per kind per 120 ms).

import { midiToHz } from './pad.js';

/** Pentatonic semitone offsets for a newborn's pluck (`genomeId mod 5` two octaves above the root). */
export const PENTATONIC = Object.freeze([0, 2, 4, 7, 9]);

/** Maximum cues allowed in any 1000 ms sliding window. */
export const MAX_CUES_PER_S = 6;
/** Minimum interval in ms between two cues of the same kind. */
export const KIND_COOLDOWN_MS = 120;
/** Maximum stereo pan magnitude. */
export const PAN_LIMIT = 0.8;

const CAUSE_SHIFT = 8;
const CAUSE_MASK = 255;

/**
 * @typedef {object} Cue
 * @property {'born' | 'eaten' | 'alarm' | 'pack'} kind which cue
 * @property {'sine' | 'triangle'} wave oscillator waveform
 * @property {number} startHz starting frequency in Hz
 * @property {number} endHz ending frequency in Hz
 * @property {number} durationMs total duration in ms
 * @property {number} gain peak gain (halved when the effect is outside the view)
 * @property {number} pan stereo pan in -0.8..0.8
 * @property {number} blips 2 for the two falling triangle blips of `ALARM`, 1 for the rest
 */

/**
 * @param {{x: number, y: number}} point the effect position in world units
 * @param {{x: number, y: number, zoom: number, canvas: {width: number, height: number}}} camera the view
 * @returns {{pan: number, scale: number}} stereo pan clamped to -0.8..0.8 and gain scale (0.5 outside view, 1 inside)
 */
function viewPlacement(point, camera) {
    const halfW = camera.canvas.width / (2 * camera.zoom);
    const halfH = camera.canvas.height / (2 * camera.zoom);
    const dx = point.x - camera.x;
    const dy = point.y - camera.y;
    const pan = Math.min(Math.max(dx / halfW, -PAN_LIMIT), PAN_LIMIT);
    const inView = Math.abs(dx) <= halfW && Math.abs(dy) <= halfH;
    return { pan, scale: inView ? 1 : 0.5 };
}

/**
 * @param {Cue['kind']} kind cue kind
 * @param {Cue['wave']} wave oscillator waveform
 * @param {[number, number, number, number]} tone `[startHz, endHz, durationMs, baseGain]`
 * @param {{pan: number, scale: number, blips?: number}} placement pan, gain scale and blip count
 * @returns {Cue} the built cue
 */
function makeCue(kind, wave, [startHz, endHz, durationMs, baseGain], { pan, scale, blips = 1 }) {
    return { kind, wave, startHz, endHz, durationMs, gain: baseGain * scale, pan, blips };
}

/**
 * @param {{kind: number, x: number, y: number, a: number, c: number}} effect an effect record from the snapshot
 * @param {{layout: {effectKinds: Record<string, number>, deathCauses: {EATEN: number}},
 *   camera: {x: number, y: number, zoom: number, canvas: {width: number, height: number}},
 *   rootMidi: number}} context the layout constants, the camera view and the current pad root MIDI note
 * @returns {Cue | null} the cue to play, or null when the effect has no sound
 */
export function cueFor(effect, { layout, camera, rootMidi }) {
    const { effectKinds: kinds, deathCauses } = layout;
    const place = viewPlacement(effect, camera);
    if (effect.kind === kinds.BORN) {
        const hz = midiToHz(rootMidi + 24 + PENTATONIC[(effect.a >>> 0) % PENTATONIC.length]);
        return makeCue('born', 'sine', [hz, hz, 400, 0.08], place);
    }
    if (effect.kind === kinds.DIED) {
        return ((effect.c >>> CAUSE_SHIFT) & CAUSE_MASK) === deathCauses.EATEN
            ? makeCue('eaten', 'sine', [80, 50, 250, 0.14], place)
            : null;
    }
    if (effect.kind === kinds.ALARM) {
        return makeCue('alarm', 'triangle', [660, 520, 220, 0.09], { ...place, blips: 2 });
    }
    if (effect.kind === kinds.PACK_CALL) {
        const hz = midiToHz(rootMidi);
        return makeCue('pack', 'triangle', [hz, hz, 300, 0.1], place);
    }
    return null;
}

/**
 * Rate-limits one-shot cues to at most `MAX_CUES_PER_S` (6) per second and one per kind per `KIND_COOLDOWN_MS` (120 ms).
 * @returns {{allow: (kind: string, nowMs: number) => boolean}} the limiter
 */
export function createCueLimiter() {
    /** @type {number[]} */
    const recent = [];
    /** @type {Map<string, number>} */
    const byKind = new Map();
    return {
        allow(kind, nowMs) {
            while (recent.length > 0 && nowMs - recent[0] >= 1000) {
                recent.shift();
            }
            const last = byKind.get(kind);
            if (recent.length >= MAX_CUES_PER_S || (last !== undefined && nowMs - last < KIND_COOLDOWN_MS)) {
                return false;
            }
            recent.push(nowMs);
            byKind.set(kind, nowMs);
            return true;
        },
    };
}
