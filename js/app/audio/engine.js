// Web Audio engine: lazy `AudioContext` creation on first user gesture, master gain (default 0.3), dynamics compressor,
// dual-bank 4-voice triangle pad with 8 s season cross-fade and 0.05 Hz filter LFO, and one-shot stereo cues.

import { CROSSFADE_S, LFO_DEPTH, LFO_HZ } from './pad.js';

/** Default master gain before any volume override. */
export const DEFAULT_MASTER_GAIN = 0.3;

const DETUNE_WEIGHTS = Object.freeze([-1.5, -0.5, 0.5, 1.5]);

/**
 * @param {any} param an `AudioParam`
 * @param {number} value target value
 * @param {number} endTime context time in seconds
 * @returns {void}
 */
function rampTo(param, value, endTime) {
    param.setValueAtTime(param.value, Math.max(0, endTime - 0.001));
    param.linearRampToValueAtTime(value, endTime);
}

/**
 * Builds one 4-oscillator triangle bank feeding `target`.
 * @param {any} ctx the `AudioContext`
 * @param {any} target destination `AudioNode`
 * @param {number} initialGain 1 for the starting bank, 0 for the alternate bank
 * @returns {{voices: any[], gain: any}} the bank
 */
function createPadBank(ctx, target, initialGain) {
    const gain = ctx.createGain();
    gain.gain.value = initialGain;
    gain.connect(target);
    const voices = DETUNE_WEIGHTS.map(() => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.25;
        osc.connect(voiceGain);
        voiceGain.connect(gain);
        osc.start();
        return osc;
    });
    return { voices, gain };
}

/**
 * Builds the master bus (`DynamicsCompressorNode` -> master `GainNode` -> `destination`) and the pad graph.
 * @param {any} ctx the `AudioContext`
 * @param {number} volume initial master gain
 * @returns {Record<string, any>} the audio graph state
 */
function buildGraph(ctx, volume) {
    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(master);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.connect(compressor);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = LFO_HZ;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 800 * LFO_DEPTH;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padGain.connect(filter);
    return {
        ctx,
        master,
        compressor,
        filter,
        lfoGain,
        padGain,
        banks: [createPadBank(ctx, padGain, 1), createPadBank(ctx, padGain, 0)],
        activeBank: 0,
        season: -1,
    };
}

/**
 * Tunes a bank's 4 oscillators to `voicesHz` and applies `detuneCents`.
 * @param {{voices: any[]}} bank the pad bank
 * @param {number[]} voicesHz four frequencies in Hz
 * @param {number} detuneCents detune spread in cents
 * @returns {void}
 */
function tuneBank(bank, voicesHz, detuneCents) {
    bank.voices.forEach((osc, i) => {
        osc.frequency.value = voicesHz[i];
        osc.detune.value = DETUNE_WEIGHTS[i] * detuneCents;
    });
}

/**
 * Updates the pad filter, LFO, gain and season cross-fade on `graph`.
 * @param {Record<string, any>} graph the audio graph
 * @param {import('./pad.js').PadParams} params the pad parameters
 * @returns {void}
 */
function applyPad(graph, params) {
    const now = graph.ctx.currentTime;
    graph.filter.frequency.value = params.cutoffHz;
    graph.lfoGain.gain.value = params.cutoffHz * LFO_DEPTH;
    graph.padGain.gain.value = params.gain;
    if (graph.season === -1) {
        graph.season = params.season;
        tuneBank(graph.banks[0], params.voicesHz, params.detuneCents);
        return;
    }
    if (params.season !== graph.season) {
        const prev = graph.activeBank;
        const next = 1 - prev;
        graph.activeBank = next;
        graph.season = params.season;
        tuneBank(graph.banks[next], params.voicesHz, params.detuneCents);
        rampTo(graph.banks[prev].gain.gain, 0, now + CROSSFADE_S);
        rampTo(graph.banks[next].gain.gain, 1, now + CROSSFADE_S);
        return;
    }
    tuneBank(graph.banks[graph.activeBank], params.voicesHz, params.detuneCents);
}

/**
 * Schedules one falling or constant oscillator blip into `target`.
 * @param {any} ctx the `AudioContext`
 * @param {any} target output `AudioNode`
 * @param {{wave: string, startHz: number, endHz: number, gain: number}} spec tone parameters
 * @param {{start: number, end: number}} window start and stop times in seconds
 * @returns {void}
 */
function scheduleBlip(ctx, target, spec, { start, end }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(spec.startHz, start);
    osc.frequency.linearRampToValueAtTime(spec.endHz, end);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(spec.gain, start + Math.min(0.015, (end - start) * 0.25));
    env.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(env);
    env.connect(target);
    osc.start(start);
    osc.stop(end);
}

/**
 * Plays a cue through a stereo panner into `graph.compressor`.
 * @param {Record<string, any>} graph the audio graph
 * @param {import('./cues.js').Cue} cue the cue
 * @returns {void}
 */
function triggerCue(graph, cue) {
    const panner = graph.ctx.createStereoPanner();
    panner.pan.value = cue.pan;
    panner.connect(graph.compressor);
    const now = graph.ctx.currentTime;
    const stepS = cue.durationMs / 1000 / cue.blips;
    for (let i = 0; i < cue.blips; i++) {
        scheduleBlip(graph.ctx, panner, cue, { start: now + i * stepS, end: now + (i + 1) * stepS });
    }
}

/**
 * @param {{AudioContext: (new () => any) | null}} deps injected `AudioContext` constructor
 * @returns {{unlock: () => void, setEnabled: (on: boolean) => void, setHidden: (hidden: boolean) => void,
 *   setVolume: (v: number) => void, updatePad: (params: import('./pad.js').PadParams) => void,
 *   playCue: (cue: import('./cues.js').Cue) => void,
 *   state: () => {enabled: boolean, unlocked: boolean, suspended: boolean, volume: number}}} the audio engine
 */
export function createAudioEngine({ AudioContext }) {
    let enabled = false;
    let unlocked = false;
    let hidden = false;
    let volume = DEFAULT_MASTER_GAIN;
    /** @type {Record<string, any> | null} */
    let graph = null;

    const sync = () => {
        if (graph === null && unlocked && AudioContext !== null) {
            graph = buildGraph(new AudioContext(), volume);
        }
        if (graph !== null) {
            void (enabled && !hidden ? graph.ctx.resume() : graph.ctx.suspend());
        }
    };

    return {
        unlock() {
            unlocked = true;
            sync();
        },
        setEnabled(on) {
            enabled = on;
            sync();
        },
        setHidden(nextHidden) {
            hidden = nextHidden;
            sync();
        },
        setVolume(nextVolume) {
            volume = Math.min(Math.max(nextVolume, 0), 1);
            if (graph !== null) {
                graph.master.gain.value = volume;
            }
        },
        updatePad: (params) => void (graph !== null && applyPad(graph, params)),
        playCue: (cue) => void (graph !== null && enabled && !hidden && triggerCue(graph, cue)),
        state: () => ({ enabled, unlocked, suspended: enabled && unlocked && hidden, volume }),
    };
}
