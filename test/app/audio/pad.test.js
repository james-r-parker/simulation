import { describe, expect, it } from 'vitest';
import {
    CROSSFADE_S,
    LFO_DEPTH,
    LFO_HZ,
    midiToHz,
    PAD_INTERVALS,
    padParams,
    SEASON_ROOT_MIDI,
} from '../../../js/app/audio/pad.js';

describe('padParams', () => {
    it('maps each season to its root MIDI note (50, 55, 45, 40) and four triangle voice intervals', () => {
        expect(SEASON_ROOT_MIDI).toEqual([50, 55, 45, 40]);
        expect(PAD_INTERVALS).toEqual([0, 7, 12, 16]);
        expect(CROSSFADE_S).toBe(8);
        expect(LFO_HZ).toBe(0.05);
        expect(LFO_DEPTH).toBe(0.15);

        const spring = padParams(0, 0.5, 0.25);
        expect(spring.rootMidi).toBe(50);
        expect(spring.rootHz).toBeCloseTo(midiToHz(50), 5);
        expect(spring.voicesHz).toEqual([midiToHz(50), midiToHz(57), midiToHz(62), midiToHz(66)]);
        expect(padParams(1, 0, 0).rootMidi).toBe(55);
        expect(padParams(2, 0, 0).rootMidi).toBe(45);
        expect(padParams(3, 0, 0).rootMidi).toBe(40);
        expect(padParams(-1, 0, 0).rootMidi).toBe(40);
    });

    it('computes filter cutoff, pad gain and detune from population and predator shares, clamped to 0..1', () => {
        const half = padParams(0, 0.5, 0.25);
        expect(half.cutoffHz).toBeCloseTo(300 + 1700 * 0.5, 5);
        expect(half.gain).toBeCloseTo(0.05 + 0.1 * 0.5, 5);
        expect(half.detuneCents).toBeCloseTo(12 * 0.25, 5);

        const below = padParams(0, -1, -2);
        expect(below.cutoffHz).toBe(300);
        expect(below.gain).toBeCloseTo(0.05, 5);
        expect(below.detuneCents).toBe(0);

        const above = padParams(0, 2, 3);
        expect(above.cutoffHz).toBe(2000);
        expect(above.gain).toBeCloseTo(0.15, 5);
        expect(above.detuneCents).toBe(12);
    });
});
