import { describe, expect, it } from 'vitest';
import { BODY_SENSE_SCRATCH, SPEED_SENSE_SPAN, bodySenseBegin, bodySenseOf } from '../../js/sim/body-sense.js';
import { detTanh } from '../../js/sim/det-math.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';

/**
 * @param {{ casterSize?: number, hitSize?: number, at?: [number, number], hitV?: [number, number],
 *   casterV?: [number, number] }} pose the two bodies: sizes, the hit's position and both velocities
 * @returns {{ out: Float64Array, w: ReturnType<typeof senseWorld> }} the three values the caster reads of the hit
 */
function sense({ casterSize = 20, hitSize = 20, at = [600, 500], hitV = [0, 0], casterV = [0, 0] } = {}) {
    const w = senseWorld();
    const caster = addAgent(w, 500, 500, casterSize);
    const hit = addAgent(w, at[0], at[1], hitSize);
    [w.vx[caster], w.vy[caster]] = casterV;
    [w.vx[hit], w.vy[hit]] = hitV;
    const out = new Float64Array(BODY_SENSE_SCRATCH);
    bodySenseBegin(w, caster, out);
    bodySenseOf(w, hit, out);
    return { out, w };
}

describe('bodySenseOf size', () => {
    it('reads 0 for an equal body', () => {
        expect(sense().out[0]).toBe(0);
    });

    it('reads below 0 for a smaller body and above 0 for a larger one, as tanh of the ratio less 1', () => {
        expect(sense({ hitSize: 10 }).out[0]).toBe(detTanh(-0.5));
        expect(sense({ hitSize: 10 }).out[0]).toBeLessThan(0);
        expect(sense({ hitSize: 40 }).out[0]).toBe(detTanh(1));
    });
});

describe('bodySenseOf speed', () => {
    it('reads 0 for a resting body', () => {
        expect(sense().out[1]).toBe(0);
    });

    it('reads 0.5 for a body at the cruise cap, more for a sprinting one, and at most 1', () => {
        const { w } = sense();
        const cap = w.config.maxVelocity;
        expect(sense({ hitV: [0, cap] }).out[1]).toBeCloseTo(0.5, 12);
        expect(sense({ hitV: [cap * 0.6, cap * 0.8] }).out[1]).toBeCloseTo(0.5, 6); // velocities are stored as float32
        expect(sense({ hitV: [cap * 1.5, 0] }).out[1]).toBeCloseTo(0.75, 12);
        expect(sense({ hitV: [cap * SPEED_SENSE_SPAN * 3, 0] }).out[1]).toBe(1);
    });
});

describe('bodySenseOf closing', () => {
    it('reads above 0 for two bodies approaching head on', () => {
        const { w } = sense();
        const cap = w.config.maxVelocity;
        const { out } = sense({ casterV: [cap / 2, 0], hitV: [-cap / 2, 0] });
        expect(out[2]).toBeGreaterThan(0);
        expect(out[2]).toBeCloseTo(0.5, 12);
    });

    it('reads below 0 for a body leaving', () => {
        const { w } = sense();
        expect(sense({ hitV: [w.config.maxVelocity, 0] }).out[2]).toBeCloseTo(-0.5, 12);
    });

    it('reads 0 for a body crossing at a constant gap', () => {
        const { w } = sense();
        expect(sense({ hitV: [0, w.config.maxVelocity] }).out[2]).toBe(0);
        expect(sense({ hitV: [0, -w.config.maxVelocity] }).out[2]).toBe(0);
    });

    it('clamps to plus or minus 1 and reads 0 when the two centres coincide', () => {
        const { w } = sense();
        const fast = w.config.maxVelocity * SPEED_SENSE_SPAN * 4;
        expect(sense({ hitV: [-fast, 0] }).out[2]).toBe(1);
        expect(sense({ hitV: [fast, 0] }).out[2]).toBe(-1);
        expect(sense({ at: [500, 500], hitV: [-fast, 0] }).out[2]).toBe(0);
    });

    it('measures along the line between the two, not along x', () => {
        const { w } = sense();
        const v = w.config.maxVelocity;
        const { out } = sense({ at: [500, 400], hitV: [0, v] });
        expect(out[2]).toBeCloseTo(0.5, 12);
    });
});
