import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { CENTRE_X, CENTRE_Y } from '../../js/evo/memory-probe-scenarios.js';
import {
    DEG,
    SEQUENCE_TICKS,
    SETTLE_TICKS,
    bearingPoint,
    readOutputs,
    signedBearing,
    subjectAgent,
    withMirrors,
} from '../../js/evo/reflex-stage.js';

describe('the sequence', () => {
    it('is six rows with the first two not scored', () => {
        expect(SEQUENCE_TICKS).toBe(6);
        expect(SETTLE_TICKS).toBe(2);
    });
});

describe('bearingPoint', () => {
    it('puts the item at the bearing from the heading, relative to the arena centre', () => {
        const p = bearingPoint(Math.PI / 2, Math.PI / 2, 100);
        expect(p.x).toBeCloseTo(CENTRE_X - 100, 6);
        expect(p.y).toBeCloseTo(CENTRE_Y, 6);
    });
});

describe('withMirrors', () => {
    it('builds the drawn stagings then their mirror images from one draw', () => {
        /** @type {[number, number][]} */
        const seen = [];
        const stagings = withMirrors({ b: 0.3 }, (draw, mirror) => {
            seen.push([draw.b, mirror]);
            return [{ kind: 'k', bearing: mirror * draw.b, mirror, ticks: [] }];
        });
        expect(seen).toEqual([
            [0.3, 1],
            [0.3, -1],
        ]);
        expect(stagings.map((s) => s.bearing)).toEqual([0.3, -0.3]);
    });
});

describe('signedBearing', () => {
    it('draws two numbers and returns a size in range of either sign', () => {
        const rng = createRng(3);
        const probe = createRng(3);
        const values = Array.from({ length: 200 }, () => signedBearing(rng, 20, 40));
        expect(values.every((v) => Math.abs(v) >= 20 * DEG && Math.abs(v) <= 40 * DEG)).toBe(true);
        expect(values.some((v) => v < 0) && values.some((v) => v > 0)).toBe(true);
        for (let i = 0; i < 400; i++) {
            nextFloat(probe);
        }
        expect(nextFloat(rng)).toBe(nextFloat(probe));
    });

    it('does not depend on the range for the stream position', () => {
        const a = fork(createRng(1), 'x');
        const b = fork(createRng(1), 'x');
        signedBearing(a, 0, 5);
        signedBearing(b, 100, 180);
        expect(nextFloat(a)).toBe(nextFloat(b));
    });
});

describe('subjectAgent', () => {
    it('stands at the arena centre with the specialisation and its energy', () => {
        expect(subjectAgent(0, 1)).toMatchObject({ x: CENTRE_X, y: CENTRE_Y, angle: 1, spec: 0, energy: 800 });
        expect(subjectAgent(1, 0)).toMatchObject({ spec: 1, energy: 1500 });
    });
});

describe('readOutputs', () => {
    it('reads thrust, turn, sprint and bite of one slot', () => {
        const outputs = new Float32Array(2 * OUTPUT_COUNT);
        outputs[OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 0.5;
        outputs[OUTPUT_COUNT + OUTPUT_INDEX.TURN] = -0.25;
        outputs[OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = 1;
        outputs[OUTPUT_COUNT + OUTPUT_INDEX.BITE] = -1;
        expect(readOutputs(outputs, 1, { thrust: 0, turn: 0, sprint: 0, bite: 0 })).toEqual({
            thrust: 0.5,
            turn: -0.25,
            sprint: 1,
            bite: -1,
        });
    });
});
