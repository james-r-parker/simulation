// The body sense (docs/designs/body-genes.md, "Raw lanes"): each case is cast through the sense kernel, whose lanes
// must equal the naive reference rounded to float32, and the reference must read what the doc says.
import { describe, expect, it } from 'vitest';
import { SPEED_SENSE_SPAN, speedSenseSpan } from '../../js/sim/body-sense.js';
import { detTanh } from '../../js/sim/det-math.js';
import { AGENT, KIND_STRIDE } from '../../js/sim/ray-gather.js';
import { castRays } from '../../js/sim/ray-march.js';
import { bodySenseReference } from './helpers/body-sense-reference.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * Casts the caster's rays, turned to face the hit, and reads the lanes of a ray whose nearest hit is that body.
 * @param {{ casterSize?: number, hitSize?: number, at?: [number, number], hitV?: [number, number],
 *   casterV?: [number, number] }} pose the two bodies: sizes, the hit's position and both velocities
 * @returns {{ ref: number[], w: ReturnType<typeof senseWorld> }} the reference's three doubles, after checking the
 *   kernel's lanes equal them in float32
 */
function sense({ casterSize = 20, hitSize = 20, at = [600, 500], hitV = [0, 0], casterV = [0, 0] } = {}) {
    const w = senseWorld();
    const caster = addAgent(w, 500, 500, casterSize);
    const hit = addAgent(w, at[0], at[1], hitSize);
    w.angle[caster] = Math.atan2(at[1] - 500, at[0] - 500);
    [w.vx[caster], w.vy[caster]] = casterV;
    [w.vx[hit], w.vy[hit]] = hitV;
    castRays(w, rebuild(w), caster);
    const k = w.wasm.views.rayBestKey.indexOf(AGENT * KIND_STRIDE + hit);
    expect(k, 'a ray hits the body').toBeGreaterThanOrEqual(0);
    const lane = caster * w.config.rayCount + k;
    const ref = bodySenseReference(w, caster, hit);
    expect([w.raySize[lane], w.raySpeed[lane], w.rayClosing[lane]]).toEqual(ref.map(Math.fround));
    return { ref, w };
}

describe('speedSenseSpan', () => {
    it('is maxVelocity times SPEED_SENSE_SPAN', () => {
        const { w } = sense();
        expect(speedSenseSpan(w.config)).toBe(w.config.maxVelocity * SPEED_SENSE_SPAN);
    });
});

describe('the body sense: size', () => {
    it('reads 0 for an equal body', () => {
        expect(sense().ref[0]).toBe(0);
    });

    it('reads below 0 for a smaller body and above 0 for a larger one, as tanh of the ratio less 1', () => {
        expect(sense({ hitSize: 10 }).ref[0]).toBe(detTanh(-0.5));
        expect(sense({ hitSize: 10 }).ref[0]).toBeLessThan(0);
        expect(sense({ hitSize: 40 }).ref[0]).toBe(detTanh(1));
    });
});

describe('the body sense: speed', () => {
    it('reads 0 for a resting body', () => {
        expect(sense().ref[1]).toBe(0);
    });

    it('reads 0.5 for a body at the cruise cap, more for a sprinting one, and at most 1', () => {
        const { w } = sense();
        const cap = w.config.maxVelocity;
        expect(sense({ hitV: [0, cap] }).ref[1]).toBeCloseTo(0.5, 12);
        expect(sense({ hitV: [cap * 0.6, cap * 0.8] }).ref[1]).toBeCloseTo(0.5, 6); // velocities are stored as float32
        expect(sense({ hitV: [cap * 1.5, 0] }).ref[1]).toBeCloseTo(0.75, 12);
        expect(sense({ hitV: [cap * SPEED_SENSE_SPAN * 3, 0] }).ref[1]).toBe(1);
    });
});

describe('the body sense: closing', () => {
    it('reads above 0 for two bodies approaching head on', () => {
        const { w } = sense();
        const cap = w.config.maxVelocity;
        const { ref } = sense({ casterV: [cap / 2, 0], hitV: [-cap / 2, 0] });
        expect(ref[2]).toBeGreaterThan(0);
        expect(ref[2]).toBeCloseTo(0.5, 12);
    });

    it('reads below 0 for a body leaving', () => {
        const { w } = sense();
        expect(sense({ hitV: [w.config.maxVelocity, 0] }).ref[2]).toBeCloseTo(-0.5, 12);
    });

    it('reads +0 for a body crossing at a constant gap', () => {
        const { w } = sense();
        expect(Object.is(sense({ hitV: [0, w.config.maxVelocity] }).ref[2], 0)).toBe(true);
        expect(Object.is(sense({ hitV: [0, -w.config.maxVelocity] }).ref[2], 0)).toBe(true);
    });

    it('clamps to plus or minus 1 and reads 0 when the two centres coincide', () => {
        const { w } = sense();
        const fast = w.config.maxVelocity * SPEED_SENSE_SPAN * 4;
        expect(sense({ hitV: [-fast, 0] }).ref[2]).toBe(1);
        expect(sense({ hitV: [fast, 0] }).ref[2]).toBe(-1);
        expect(sense({ at: [500, 500], hitV: [-fast, 0] }).ref[2]).toBe(0);
    });

    it('measures along the line between the two, not along x', () => {
        const { w } = sense();
        const v = w.config.maxVelocity;
        const { ref } = sense({ at: [500, 400], hitV: [0, v] });
        expect(ref[2]).toBeCloseTo(0.5, 12);
    });
});
