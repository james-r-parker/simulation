import { describe, expect, it } from 'vitest';
import {
    createCueLimiter,
    cueFor,
    KIND_COOLDOWN_MS,
    MAX_CUES_PER_S,
    PAN_LIMIT,
    PENTATONIC,
} from '../../../js/app/audio/cues.js';
import { midiToHz } from '../../../js/app/audio/pad.js';

const LAYOUT = {
    effectKinds: { BORN: 1, DIED: 2, BITE: 3, ALARM: 4, PACK_CALL: 5, SMOKE: 6 },
    deathCauses: { EATEN: 1, STARVED: 2 },
};

const CAMERA = {
    x: 1000,
    y: 500,
    zoom: 1,
    canvas: { width: 1000, height: 600 },
};

describe('cueFor', () => {
    it('builds a pentatonic sine pluck two octaves above the root for BORN', () => {
        const cue = cueFor({ kind: 1, x: 1000, y: 500, a: 7, c: 0 }, { layout: LAYOUT, camera: CAMERA, rootMidi: 50 });
        expect(cue).toEqual({
            kind: 'born',
            wave: 'sine',
            startHz: midiToHz(50 + 24 + PENTATONIC[7 % 5]),
            endHz: midiToHz(50 + 24 + PENTATONIC[7 % 5]),
            durationMs: 400,
            gain: 0.08,
            pan: 0,
            blips: 1,
        });
    });

    it('builds a falling 80->50 Hz thud only for DIED of cause eaten', () => {
        const eaten = cueFor(
            { kind: 2, x: 1000, y: 500, a: 1, c: 1 << 8 },
            { layout: LAYOUT, camera: CAMERA, rootMidi: 50 },
        );
        expect(eaten).toMatchObject({
            kind: 'eaten',
            wave: 'sine',
            startHz: 80,
            endHz: 50,
            durationMs: 250,
            gain: 0.14,
            blips: 1,
        });
        const starved = cueFor(
            { kind: 2, x: 1000, y: 500, a: 1, c: 2 << 8 },
            { layout: LAYOUT, camera: CAMERA, rootMidi: 50 },
        );
        expect(starved).toBeNull();
    });

    it('builds two falling triangle blips for ALARM and a root pulse for PACK_CALL, ignoring other effects', () => {
        const alarm = cueFor(
            { kind: 4, x: 1000, y: 500, a: 1, c: 0 },
            { layout: LAYOUT, camera: CAMERA, rootMidi: 50 },
        );
        expect(alarm).toMatchObject({
            kind: 'alarm',
            wave: 'triangle',
            startHz: 660,
            endHz: 520,
            durationMs: 220,
            blips: 2,
        });
        const pack = cueFor({ kind: 5, x: 1000, y: 500, a: 1, c: 0 }, { layout: LAYOUT, camera: CAMERA, rootMidi: 55 });
        expect(pack).toMatchObject({
            kind: 'pack',
            wave: 'triangle',
            startHz: midiToHz(55),
            endHz: midiToHz(55),
            durationMs: 300,
            blips: 1,
        });
        expect(
            cueFor({ kind: 3, x: 1000, y: 500, a: 1, c: 0 }, { layout: LAYOUT, camera: CAMERA, rootMidi: 50 }),
        ).toBeNull();
    });

    it('clamps stereo pan to -0.8..0.8 and halves gain when the effect lies outside the view', () => {
        const farRight = cueFor(
            { kind: 1, x: 3000, y: 500, a: 0, c: 0 },
            { layout: LAYOUT, camera: CAMERA, rootMidi: 50 },
        );
        expect(farRight?.pan).toBe(PAN_LIMIT);
        expect(farRight?.gain).toBeCloseTo(0.04, 5);

        const farLeftY = cueFor(
            { kind: 1, x: -2000, y: 2000, a: 0, c: 0 },
            { layout: LAYOUT, camera: CAMERA, rootMidi: 50 },
        );
        expect(farLeftY?.pan).toBe(-PAN_LIMIT);
        expect(farLeftY?.gain).toBeCloseTo(0.04, 5);
    });
});

describe('createCueLimiter', () => {
    it('enforces one cue per kind per 120 ms and at most 6 cues per second', () => {
        const limiter = createCueLimiter();
        expect(MAX_CUES_PER_S).toBe(6);
        expect(KIND_COOLDOWN_MS).toBe(120);
        expect(limiter.allow('born', 0)).toBe(true);
        expect(limiter.allow('born', 50)).toBe(false);
        expect(limiter.allow('born', 120)).toBe(true);

        expect(limiter.allow('eaten', 130)).toBe(true);
        expect(limiter.allow('alarm', 140)).toBe(true);
        expect(limiter.allow('pack', 150)).toBe(true);
        expect(limiter.allow('born', 300)).toBe(true);
        expect(limiter.allow('eaten', 310)).toBe(false);

        expect(limiter.allow('eaten', 1001)).toBe(true);
    });
});
