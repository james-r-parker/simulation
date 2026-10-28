// Generative ambient pad parameters from the world's season, population share and predator share. Pure over numbers so
// every formula tests without Web Audio.

/** Root MIDI notes for spring, summer, autumn and winter. */
export const SEASON_ROOT_MIDI = Object.freeze([50, 55, 45, 40]);

/** Semitone offsets of the four triangle voices: root, fifth, octave, major tenth. */
export const PAD_INTERVALS = Object.freeze([0, 7, 12, 16]);

/** Seconds over which a season change cross-fades to the new root. */
export const CROSSFADE_S = 8;

/** Cutoff LFO frequency in Hz and fractional depth (15% of cutoff). */
export const LFO_HZ = 0.05;
export const LFO_DEPTH = 0.15;

/**
 * @param {number} value a ratio
 * @returns {number} clamped to 0..1
 */
function clamp01(value) {
    return Math.min(Math.max(value, 0), 1);
}

/**
 * @param {number} midi a MIDI note number (69 is A4 = 440 Hz)
 * @returns {number} its frequency in Hz
 */
export function midiToHz(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * @typedef {object} PadParams
 * @property {number} season the season index, 0 to 3
 * @property {number} rootMidi the root MIDI note (50, 55, 45 or 40)
 * @property {number} rootHz the root frequency in Hz
 * @property {number[]} voicesHz the four voice frequencies (root, fifth, octave, major tenth) in Hz
 * @property {number} cutoffHz the low-pass filter cutoff in Hz (`300 + 1700 * populationShare`)
 * @property {number} gain the pad bus gain (`0.05 + 0.1 * populationShare`)
 * @property {number} detuneCents the voice detune spread in cents (`12 * predatorShare`)
 */

/**
 * @param {number} season the season index (0 spring, 1 summer, 2 autumn, 3 winter)
 * @param {number} populationShare alive population divided by `maxAgents`, 0 to 1
 * @param {number} predatorShare alive hunters divided by alive population, 0 to 1
 * @returns {PadParams} the pad's root, voice frequencies, filter cutoff, gain and detune
 */
export function padParams(season, populationShare, predatorShare) {
    const s = (((season | 0) % 4) + 4) % 4;
    const pop = clamp01(populationShare);
    const pred = clamp01(predatorShare);
    const rootMidi = SEASON_ROOT_MIDI[s];
    return {
        season: s,
        rootMidi,
        rootHz: midiToHz(rootMidi),
        voicesHz: PAD_INTERVALS.map((semi) => midiToHz(rootMidi + semi)),
        cutoffHz: 300 + 1700 * pop,
        gain: 0.05 + 0.1 * pop,
        detuneCents: 12 * pred,
    };
}
