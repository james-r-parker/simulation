// One-shot audio cues from effect records (the worker's, and the renderer's client kinds for meals and sickness) and
// the rate limiter (`createCueLimiter`: at most 6 cues a second and 1 per kind per 120 ms). Bites and meals are frequent,
// so they sound only at the close zoom band and in view.

import { CLIENT_KIND } from '../renderer/client-kinds.js';
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
const PACK_BIT = 65536;

/**
 * @typedef {object} Cue
 * @property {string} kind which cue: `born`, `eaten`, `alarm`, `pack`, or a `TONES` key
 * @property {'sine' | 'triangle' | 'square' | 'sawtooth'} wave oscillator waveform
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

/** The simple cues: wave, then `[startHz, endHz, durationMs, gain]`, then blips. */
export const TONES = Object.freeze({
    bite: { wave: 'square', tone: [900, 250, 40, 0.04], blips: 1 },
    meal: { wave: 'sine', tone: [600, 900, 60, 0.04], blips: 1 },
    mate: { wave: 'sine', tone: [523, 784, 320, 0.06], blips: 2 },
    arrival: { wave: 'triangle', tone: [392, 392, 500, 0.05], blips: 1 },
    sick: { wave: 'sawtooth', tone: [300, 240, 260, 0.03], blips: 1 },
    infected: { wave: 'triangle', tone: [220, 180, 200, 0.04], blips: 1 },
    stampede: { wave: 'sawtooth', tone: [70, 45, 800, 0.08], blips: 1 },
    smoke: { wave: 'triangle', tone: [1200, 400, 300, 0.03], blips: 1 },
    pollen: { wave: 'sine', tone: [1568, 1568, 180, 0.03], blips: 1 },
    strain: { wave: 'sawtooth', tone: [110, 98, 900, 0.05], blips: 1 },
    packKill: { wave: 'sine', tone: [120, 75, 320, 0.14], blips: 1 },
    oldAge: { wave: 'sine', tone: [1046, 1046, 600, 0.03], blips: 1 },
    trampled: { wave: 'sine', tone: [60, 40, 300, 0.12], blips: 1 },
    recovered: { wave: 'sine', tone: [880, 1320, 200, 0.03], blips: 1 },
});
/** Cues that sound only at the close zoom band (2 device px per world unit) and in view. */
const CLOSE_ONLY = new Set(['bite', 'meal', 'oldAge']);
const CLOSE_ZOOM = 2;

/**
 * @param {number} kind the effect's kind
 * @param {Record<string, number>} kinds `ready.layout.effectKinds`
 * @returns {keyof typeof TONES | null} the simple cue for a kind, null when it has none
 */
function toneOf(kind, kinds) {
    const byKind = {
        [kinds.BITE]: 'bite',
        [kinds.MATED]: 'mate',
        [kinds.STAMPEDE]: 'stampede',
        [kinds.SMOKE]: 'smoke',
        [kinds.POLLINATED]: 'pollen',
        [kinds.STRAIN_EMERGED]: 'strain',
        [CLIENT_KIND.MEAL]: 'meal',
        [CLIENT_KIND.SICK]: 'sick',
        [CLIENT_KIND.INFECTED]: 'infected',
        [CLIENT_KIND.RECOVERED]: 'recovered',
        [CLIENT_KIND.CURED]: 'recovered',
    };
    return /** @type {keyof typeof TONES | undefined} */ (byKind[kind]) ?? null;
}

/**
 * @param {keyof typeof TONES} name the cue
 * @param {{pan: number, scale: number}} place pan and gain scale
 * @param {number} zoom device px per world unit
 * @returns {Cue | null} the cue, null for a close-only cue off view or not close
 */
function toneCue(name, place, zoom) {
    if (CLOSE_ONLY.has(name) && (zoom < CLOSE_ZOOM || place.scale < 1)) {
        return null;
    }
    const t = TONES[name];
    return makeCue(name, /** @type {Cue['wave']} */ (t.wave), /** @type {any} */ (t.tone), {
        ...place,
        blips: t.blips,
    });
}

/**
 * @param {{c: number}} effect a `DIED` record
 * @param {{deathCauses: Record<string, number>}} layout the layout
 * @param {{pan: number, scale: number}} place pan and gain scale
 * @param {number} zoom device px per world unit
 * @returns {Cue | null} the eaten thud (lower for a pack kill), a trampling thud, a soft old-age tone at the close band,
 *   else null
 */
function deathCue(effect, { deathCauses }, place, zoom) {
    const cause = (effect.c >>> CAUSE_SHIFT) & CAUSE_MASK;
    if (cause === deathCauses.EATEN) {
        return (effect.c & PACK_BIT) !== 0
            ? toneCue('packKill', place, zoom)
            : makeCue('eaten', 'sine', [80, 50, 250, 0.14], place);
    }
    if (cause === deathCauses.TRAMPLED) {
        return toneCue('trampled', place, zoom);
    }
    return cause === deathCauses.OLD_AGE ? toneCue('oldAge', place, zoom) : null;
}

/**
 * @param {{a: number, d: number}} effect a `BORN` record (genome, cause)
 * @param {{bornCauses?: Record<string, number>}} layout the layout
 * @param {{pan: number, scale: number}} place pan and gain scale
 * @param {number} rootMidi the pad root
 * @returns {Cue} a pentatonic pluck, an octave down for a split, a muted bell for a floor entrant or immigrant
 */
function bornCue(effect, layout, place, rootMidi) {
    const causes = layout.bornCauses;
    if (causes !== undefined && (effect.d === causes.FLOOR || effect.d === causes.IMMIGRANT)) {
        return /** @type {Cue} */ (toneCue('arrival', place, CLOSE_ZOOM));
    }
    const down = causes !== undefined && effect.d === causes.SPLIT ? 12 : 0;
    const hz = midiToHz(rootMidi + 24 - down + PENTATONIC[(effect.a >>> 0) % PENTATONIC.length]);
    return makeCue('born', 'sine', [hz, hz, 400, 0.08], place);
}

/**
 * @param {{kind: number, x: number, y: number, a: number, c: number}} effect an effect record from the snapshot
 * @param {{layout: {effectKinds: Record<string, number>, deathCauses: {EATEN: number},
 *   bornCauses?: Record<string, number>},
 *   camera: {x: number, y: number, zoom: number, canvas: {width: number, height: number}},
 *   rootMidi: number}} context the layout constants, the camera view and the current pad root MIDI note
 * @returns {Cue | null} the cue to play, or null when the effect has no sound
 */
export function cueFor(effect, { layout, camera, rootMidi }) {
    const { effectKinds: kinds } = layout;
    const place = viewPlacement(effect, camera);
    if (effect.kind === kinds.BORN) {
        return bornCue(/** @type {any} */ (effect), layout, place, rootMidi);
    }
    if (effect.kind === kinds.DIED) {
        return deathCue(effect, layout, place, camera.zoom);
    }
    if (effect.kind === kinds.ALARM) {
        return makeCue('alarm', 'triangle', [660, 520, 220, 0.09], { ...place, blips: 2 });
    }
    if (effect.kind === kinds.PACK_CALL) {
        const hz = midiToHz(rootMidi);
        return makeCue('pack', 'triangle', [hz, hz, 300, 0.1], place);
    }
    const tone = toneOf(effect.kind, kinds);
    return tone === null ? null : toneCue(tone, place, camera.zoom);
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
