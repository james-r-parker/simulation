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
import { TONES } from '../../../js/app/audio/cues.js';
import { CLIENT_KIND } from '../../../js/app/renderer/client-kinds.js';

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

describe('the effect-family cues', () => {
    const FULL = {
        effectKinds: {
            BORN: 1,
            DIED: 2,
            BITE: 3,
            ALARM: 4,
            PACK_CALL: 5,
            SMOKE: 6,
            MATED: 8,
            STAMPEDE: 10,
            STRAIN_EMERGED: 11,
        },
        deathCauses: { STARVED: 0, EATEN: 1, OLD_AGE: 3, TRAMPLED: 5 },
        bornCauses: { INITIAL: 0, MATE: 1, SPLIT: 2, FLOOR: 3, IMMIGRANT: 4 },
    };
    const CLOSE = { ...CAMERA, zoom: 2 };
    const at = (/** @type {number} */ kind, /** @type {number} */ d = 0) => ({ kind, x: 1000, y: 500, a: 3, c: 0, d });

    it('gives mating, stampede, smoke, strain and the client sickness kinds their tones at any zoom', () => {
        const ctx = { layout: FULL, camera: CAMERA, rootMidi: 50 };
        expect(cueFor(at(8), ctx)?.kind).toBe('mate');
        expect(cueFor(at(10), ctx)?.kind).toBe('stampede');
        expect(cueFor(at(6), ctx)?.kind).toBe('smoke');
        expect(cueFor(at(11), ctx)?.kind).toBe('strain');
        expect(cueFor(at(CLIENT_KIND.SICK), ctx)?.kind).toBe('sick');
        expect(cueFor(at(CLIENT_KIND.INFECTED), ctx)).toMatchObject({ wave: TONES.infected.wave });
        expect(cueFor(at(CLIENT_KIND.CURED), ctx)?.kind).toBe('recovered');
        expect(cueFor(at(CLIENT_KIND.RECOVERED), ctx)?.kind).toBe('recovered');
    });

    it('sounds bites and meals only at the close zoom band and in view', () => {
        expect(cueFor(at(3), { layout: FULL, camera: CAMERA, rootMidi: 50 })).toBeNull();
        expect(cueFor(at(3), { layout: FULL, camera: CLOSE, rootMidi: 50 })?.kind).toBe('bite');
        expect(cueFor(at(CLIENT_KIND.MEAL), { layout: FULL, camera: CLOSE, rootMidi: 50 })?.kind).toBe('meal');
        const off = { ...at(3), x: 9000 };
        expect(cueFor(off, { layout: FULL, camera: CLOSE, rootMidi: 50 })).toBeNull();
    });

    it('drops a split pluck an octave and rings a muted bell for a floor entrant', () => {
        const ctx = { layout: FULL, camera: CAMERA, rootMidi: 50 };
        const mate = cueFor(at(1, 1), ctx);
        const split = cueFor(at(1, 2), ctx);
        expect(split?.startHz).toBeCloseTo((mate?.startHz ?? 0) / 2);
        expect(cueFor(at(1, 3), ctx)?.kind).toBe('arrival');
        expect(cueFor(at(1, 4), ctx)?.kind).toBe('arrival');
    });

    it('gives a pack kill a lower thud, a trampling its own thud, and old age a soft tone at the close band only', () => {
        const ctx = { layout: FULL, camera: CAMERA, rootMidi: 50 };
        const died = (/** @type {number} */ c) => ({ kind: 2, x: 1000, y: 500, a: 0, c, d: 0 });
        expect(cueFor(died(1 << 8), ctx)?.kind).toBe('eaten');
        expect(cueFor(died((1 << 8) | 65536), ctx)?.kind).toBe('packKill');
        expect(cueFor(died(5 << 8), ctx)?.kind).toBe('trampled');
        expect(cueFor(died(3 << 8), ctx)).toBeNull();
        expect(cueFor(died(3 << 8), { ...ctx, camera: CLOSE })?.kind).toBe('oldAge');
        expect(cueFor(died(0), { ...ctx, camera: CLOSE })).toBeNull();
    });
});

describe('cueFor without a cue', () => {
    it('returns null for a kind it has no tone for', () => {
        const layout = { effectKinds: { BORN: 1, DIED: 2, ALARM: 4, PACK_CALL: 5 }, deathCauses: { EATEN: 1 } };
        const camera = { x: 0, y: 0, zoom: 1, canvas: { width: 10, height: 10 } };
        expect(cueFor({ kind: 99, x: 0, y: 0, a: 0, c: 0 }, { layout, camera, rootMidi: 50 })).toBeNull();
    });
});

describe('world cues', () => {
    it('thuds a herd death and rings a first kill', () => {
        const layout = {
            effectKinds: { BORN: 1, DIED: 2, ALARM: 4, PACK_CALL: 5, HERD_DIED: 12, FIRST_KILL: 16 },
            deathCauses: { EATEN: 1 },
        };
        const camera = { x: 0, y: 0, zoom: 1, canvas: { width: 10, height: 10 } };
        expect(cueFor({ kind: 12, x: 0, y: 0, a: 0, c: 0 }, { layout, camera, rootMidi: 50 })?.kind).toBe('herdDied');
        expect(cueFor({ kind: 16, x: 0, y: 0, a: 0, c: 0 }, { layout, camera, rootMidi: 50 })?.kind).toBe('firstKill');
    });
});
