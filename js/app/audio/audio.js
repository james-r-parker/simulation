// Wires `createAudioEngine`, `padParams`, `cueFor` and `createCueLimiter` to the world's `stats`, played effects,
// `visibilitychange`, user gestures (`keydown` and `pointerdown`) and the volume setting.

import { createCueLimiter, cueFor } from './cues.js';
import { createAudioEngine } from './engine.js';
import { padParams, SEASON_ROOT_MIDI } from './pad.js';

/** Step size for `volumeUp` (`0`) and `volumeDown` (`9`). */
export const VOLUME_STEP = 0.1;

/**
 * @param {{enabled: boolean, unlocked: boolean, suspended: boolean}} state the engine state
 * @returns {'audio: waiting for a key' | 'audio: suspended' | 'audio: on' | 'audio: off'} the top-bar audio label
 */
export function audioStatus({ enabled, unlocked, suspended }) {
    if (!enabled) {
        return 'audio: off';
    }
    if (!unlocked) {
        return 'audio: waiting for a key';
    }
    return suspended ? 'audio: suspended' : 'audio: on';
}

/**
 * @param {Record<string, any>} stats a worker stats message
 * @param {Record<string, any> | null} ready the newest `ready` message
 * @returns {import('./pad.js').PadParams} the pad parameters for this stats sample
 */
function padFromStats(stats, ready) {
    const maxAgents = ready?.info?.maxAgents ?? 500;
    const pop = stats.population ?? 0;
    const popShare = pop / maxAgents;
    const predShare = pop > 0 ? (stats.predators ?? 0) / pop : 0;
    return padParams(stats.season ?? 0, popShare, predShare);
}

/**
 * @typedef {object} MountAudioDeps
 * @property {{hidden: boolean, addEventListener: (type: string, fn: () => void) => void}} doc the `document`
 * @property {(new () => any) | null} AudioContext the `AudioContext` constructor, null where unsupported
 * @property {() => number} now wall time in ms
 * @property {() => {x: number, y: number, zoom: number, canvas: {width: number, height: number}}} getCamera the camera
 * @property {() => Record<string, any> | null} getReady the newest `ready` message
 * @property {(status: string) => void} onStatus called whenever the audio status text changes
 * @property {boolean} enabled initial audio-on state
 * @property {number} volume initial master volume, 0 to 1
 */

/**
 * @param {Record<string, any>} ctx internal audio state
 * @returns {{gesture: (type: string) => void, setEnabled: (on: boolean) => void, toggle: () => boolean,
 *   isEnabled: () => boolean, setVolume: (v: number) => number, stepVolume: (dir: number) => number,
 *   getVolume: () => number, onStats: (stats: Record<string, any>) => void,
 *   onEffect: (effect: import('../renderer/effects-player.js').Effect) => void, status: () => string}} controller API
 */
function createApi(ctx) {
    const { deps, engine, limiter, emit } = ctx;
    const setEnabled = (/** @type {boolean} */ on) => {
        engine.setEnabled(on);
        if (on) {
            engine.updatePad(ctx.lastPad);
        }
        emit();
    };
    const setVolume = (/** @type {number} */ v) => {
        const clamped = Math.round(Math.min(Math.max(v, 0), 1) * 100) / 100;
        engine.setVolume(clamped);
        return clamped;
    };
    return {
        gesture(type) {
            if (type === 'keydown' || type === 'pointerdown') {
                engine.unlock();
                engine.updatePad(ctx.lastPad);
                emit();
            }
        },
        setEnabled,
        toggle: () => (setEnabled(!engine.state().enabled), engine.state().enabled),
        isEnabled: () => engine.state().enabled,
        setVolume,
        stepVolume: (dir) => setVolume(engine.state().volume + dir * VOLUME_STEP),
        getVolume: () => engine.state().volume,
        onStats(stats) {
            ctx.lastPad = padFromStats(stats, deps.getReady());
            ctx.rootMidi = ctx.lastPad.rootMidi;
            engine.updatePad(ctx.lastPad);
        },
        onEffect(effect) {
            const state = engine.state();
            const ready = deps.getReady();
            if (!state.enabled || !state.unlocked || state.suspended || ready === null) {
                return;
            }
            const cue = cueFor(effect, { layout: ready.layout, camera: deps.getCamera(), rootMidi: ctx.rootMidi });
            if (cue !== null && limiter.allow(cue.kind, deps.now())) {
                engine.playCue(cue);
            }
        },
        status: () => audioStatus(engine.state()),
    };
}

/**
 * @param {MountAudioDeps} deps the injected browser and world dependencies
 * @returns {ReturnType<typeof createApi>} the audio controller
 */
export function mountAudio(deps) {
    const engine = createAudioEngine({ AudioContext: deps.AudioContext });
    const ctx = {
        deps,
        engine,
        limiter: createCueLimiter(),
        rootMidi: SEASON_ROOT_MIDI[0],
        lastPad: padParams(0, 0, 0),
        lastStatus: '',
        emit() {
            const next = audioStatus(engine.state());
            if (next !== ctx.lastStatus) {
                ctx.lastStatus = next;
                deps.onStatus(next);
            }
        },
    };
    engine.setVolume(deps.volume);
    engine.setHidden(deps.doc.hidden);
    engine.setEnabled(deps.enabled);
    ctx.emit();
    deps.doc.addEventListener('visibilitychange', () => {
        engine.setHidden(deps.doc.hidden);
        ctx.emit();
    });
    return createApi(ctx);
}
