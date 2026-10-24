import { describe, expect, it } from 'vitest';
import { audioStatus, mountAudio, VOLUME_STEP } from '../../../js/app/audio/audio.js';
import { FakeAudioContext } from './fake-audio.js';

const READY = {
    info: { maxAgents: 200 },
    layout: {
        effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5 },
        deathCauses: { EATEN: 1 },
    },
};

/**
 * @param {{enabled?: boolean, volume?: number, ready?: any}} [opts] test options
 * @returns {any} mounted audio with test harnesses
 */
function setup({ enabled = false, volume = 0.3, ready = READY } = {}) {
    FakeAudioContext.instances.length = 0;
    const listeners = /** @type {Record<string, (() => void)[]>} */ ({});
    const doc = {
        hidden: false,
        addEventListener(/** @type {string} */ type, /** @type {() => void} */ fn) {
            (listeners[type] ??= []).push(fn);
        },
        setHidden(/** @type {boolean} */ hidden) {
            doc.hidden = hidden;
            for (const fn of listeners.visibilitychange ?? []) {
                fn();
            }
        },
    };
    const statuses = /** @type {string[]} */ ([]);
    let clock = 1000;
    let currentReady = ready;
    const audio = mountAudio({
        doc,
        AudioContext: FakeAudioContext,
        now: () => clock,
        getCamera: () => ({ x: 500, y: 500, zoom: 1, canvas: { width: 1000, height: 1000 } }),
        getReady: () => currentReady,
        onStatus: (s) => statuses.push(s),
        enabled,
        volume,
    });
    return {
        audio,
        doc,
        statuses,
        setClock: (/** @type {number} */ t) => (clock = t),
        setReady: (/** @type {any} */ r) => (currentReady = r),
    };
}

describe('mountAudio', () => {
    it('reports waiting for a key when enabled before a gesture, then on, suspended and off', () => {
        expect(VOLUME_STEP).toBe(0.1);
        expect(audioStatus({ enabled: false, unlocked: false, suspended: false })).toBe('audio: off');
        expect(audioStatus({ enabled: true, unlocked: false, suspended: false })).toBe('audio: waiting for a key');
        expect(audioStatus({ enabled: true, unlocked: true, suspended: false })).toBe('audio: on');
        expect(audioStatus({ enabled: true, unlocked: true, suspended: true })).toBe('audio: suspended');

        const { audio, doc, statuses } = setup({ enabled: true });
        expect(audio.status()).toBe('audio: waiting for a key');
        expect(statuses).toEqual(['audio: waiting for a key']);
        expect(FakeAudioContext.instances).toHaveLength(0);

        audio.gesture('pointermove');
        expect(FakeAudioContext.instances).toHaveLength(0);

        audio.gesture('keydown');
        expect(FakeAudioContext.instances).toHaveLength(1);
        expect(audio.status()).toBe('audio: on');

        doc.setHidden(true);
        expect(audio.status()).toBe('audio: suspended');
        doc.setHidden(false);
        expect(audio.status()).toBe('audio: on');

        audio.setEnabled(false);
        expect(audio.isEnabled()).toBe(false);
        expect(audio.status()).toBe('audio: off');
        expect(audio.toggle()).toBe(true);
        expect(audio.isEnabled()).toBe(true);
        expect(audio.status()).toBe('audio: on');
        expect(audio.stepVolume(1)).toBe(0.4);
        expect(audio.stepVolume(-1)).toBe(0.3);
    });

    it('updates pad from stats, clamps volume, and rate-limits effect cues', () => {
        const { audio, setClock, setReady } = setup({ enabled: false, volume: 0.5 });
        expect(audio.getVolume()).toBe(0.5);
        expect(audio.setVolume(1.5)).toBe(1);
        expect(audio.setVolume(-0.2)).toBe(0);
        expect(audio.setVolume(0.4)).toBe(0.4);

        audio.onEffect({ kind: 1, tick: 1, x: 500, y: 500, a: 1, b: 0, c: 0, d: 0 });
        audio.gesture('pointerdown');
        audio.setEnabled(true);

        audio.onStats({ season: 1, population: 100, predators: 20 });
        audio.onStats({});
        setReady(null);
        audio.onStats({ season: 2, population: 50, predators: 10 });
        audio.onEffect({ kind: 1, tick: 1, x: 500, y: 500, a: 1, b: 0, c: 0, d: 0 });

        setReady(READY);
        const ctx = FakeAudioContext.instances[0];
        const before = ctx.oscillators.length;
        audio.onEffect({ kind: 1, tick: 1, x: 500, y: 500, a: 1, b: 0, c: 0, d: 0 });
        expect(ctx.oscillators.length).toBe(before + 1);
        audio.onEffect({ kind: 1, tick: 1, x: 500, y: 500, a: 2, b: 0, c: 0, d: 0 });
        expect(ctx.oscillators.length).toBe(before + 1);
        setClock(1200);
        audio.onEffect({ kind: 3, tick: 1, x: 500, y: 500, a: 1, b: 0, c: 0, d: 0 });
        expect(ctx.oscillators.length).toBe(before + 1);
    });
});
