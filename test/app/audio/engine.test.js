import { describe, expect, it } from 'vitest';
import { createAudioEngine, DEFAULT_MASTER_GAIN } from '../../../js/app/audio/engine.js';
import { padParams } from '../../../js/app/audio/pad.js';
import { FakeAudioContext } from './fake-audio.js';

describe('createAudioEngine', () => {
    it('does not construct AudioContext until unlock() is called, and handles missing AudioContext', () => {
        FakeAudioContext.instances.length = 0;
        const engine = createAudioEngine({ AudioContext: FakeAudioContext });
        engine.setEnabled(true);
        engine.setVolume(0.6);
        engine.updatePad(padParams(0, 0.5, 0.2));
        engine.playCue({
            kind: 'born',
            wave: 'sine',
            startHz: 440,
            endHz: 440,
            durationMs: 400,
            gain: 0.08,
            pan: 0,
            blips: 1,
        });
        expect(FakeAudioContext.instances).toHaveLength(0);
        expect(engine.state()).toEqual({ enabled: true, unlocked: false, suspended: false, volume: 0.6 });

        engine.unlock();
        expect(FakeAudioContext.instances).toHaveLength(1);
        const ctx = FakeAudioContext.instances[0];
        expect(ctx.resumed).toBeGreaterThan(0);

        const noWebAudio = createAudioEngine({ AudioContext: null });
        expect(noWebAudio.state().volume).toBe(DEFAULT_MASTER_GAIN);
        noWebAudio.unlock();
        noWebAudio.setEnabled(true);
        expect(noWebAudio.state().unlocked).toBe(true);
    });

    it('updates the pad filter, LFO, detune, and cross-fades banks over 8 s when the season changes', () => {
        FakeAudioContext.instances.length = 0;
        const engine = createAudioEngine({ AudioContext: FakeAudioContext });
        engine.unlock();
        engine.setEnabled(true);
        const ctx = FakeAudioContext.instances[0];

        const spring = padParams(0, 0.5, 0.5);
        engine.updatePad(spring);
        expect(ctx.filters[0].frequency.value).toBeCloseTo(spring.cutoffHz, 5);

        const spring2 = padParams(0, 0.8, 0.2);
        engine.updatePad(spring2);
        expect(ctx.filters[0].frequency.value).toBeCloseTo(spring2.cutoffHz, 5);

        const summer = padParams(1, 0.6, 0.4);
        engine.updatePad(summer);
        expect(ctx.gains.some((g) => g.gain.ramps.length > 0)).toBe(true);
    });

    it('schedules single and double-blip cues and suspends/resumes on visibility or disable', () => {
        FakeAudioContext.instances.length = 0;
        const engine = createAudioEngine({ AudioContext: FakeAudioContext });
        engine.unlock();
        engine.setEnabled(true);
        engine.setVolume(0.4);
        const ctx = FakeAudioContext.instances[0];
        const oscBefore = ctx.oscillators.length;

        engine.playCue({
            kind: 'alarm',
            wave: 'triangle',
            startHz: 660,
            endHz: 520,
            durationMs: 220,
            gain: 0.09,
            pan: -0.3,
            blips: 2,
        });
        expect(ctx.oscillators.length - oscBefore).toBe(2);
        expect(ctx.panners.at(-1)?.pan.value).toBe(-0.3);

        engine.setHidden(true);
        expect(engine.state().suspended).toBe(true);
        expect(ctx.suspended).toBeGreaterThan(0);
        engine.playCue({
            kind: 'born',
            wave: 'sine',
            startHz: 440,
            endHz: 440,
            durationMs: 400,
            gain: 0.08,
            pan: 0,
            blips: 1,
        });
        expect(ctx.oscillators.length - oscBefore).toBe(2);

        engine.setHidden(false);
        expect(engine.state().suspended).toBe(false);
        engine.setEnabled(false);
        expect(engine.state().enabled).toBe(false);
    });
});
