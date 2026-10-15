import { describe, expect, it } from 'vitest';
import { writeBodyInputs } from '../../js/sim/body-inputs.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { depositPheromone } from '../../js/sim/pheromones.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';

/**
 * @param {ReturnType<typeof senseWorld>} w
 * @param {number} slot
 * @returns {number[]} the fifteen body inputs
 */
function body(w, slot) {
    writeBodyInputs(w, slot);
    const base = slot * w.layout.inputCount + w.config.rayCount * 8;
    return Array.from(w.inputs.subarray(base, base + 15));
}

/** @returns {{w: ReturnType<typeof senseWorld>, slot: number}} a mature agent ready to mate */
function ready() {
    const w = senseWorld();
    const slot = addAgent(w, 500, 500, 25);
    w.ageTicks[slot] = w.config.maturityTicks;
    w.energy[slot] = w.config.mateMinEnergy + 1;
    return { w, slot };
}

describe('writeBodyInputs', () => {
    it('writes energy, size and age as fractions of their maxima', () => {
        const { w, slot } = ready();
        const c = w.config;
        w.energy[slot] = c.maxEnergy / 2;
        w.ageTicks[slot] = c.maxAgeTicks / 4;
        const v = body(w, slot);
        expect(v[0]).toBeCloseTo(0.5, 6);
        expect(v[4]).toBeCloseTo(25 / (c.baseSize + c.maxEnergy / c.energyToSize), 6);
        expect(v[14]).toBeCloseTo(0.25, 6);
    });

    it('writes forward and lateral velocity in the heading frame', () => {
        const { w, slot } = ready();
        const c = w.config;
        w.angle[slot] = Math.PI / 2;
        w.vx[slot] = 0;
        w.vy[slot] = 2;
        let v = body(w, slot);
        expect(v[1]).toBeCloseTo(2 / c.maxVelocity, 5);
        expect(v[2]).toBeCloseTo(0, 5);
        w.vx[slot] = 2;
        w.vy[slot] = 0;
        v = body(w, slot);
        expect(v[1]).toBeCloseTo(0, 5);
        expect(v[2]).toBeCloseTo(-2 / c.maxVelocity, 5);
    });

    it('writes the turn rate over maxTurn', () => {
        const { w, slot } = ready();
        w.turnRate[slot] = w.config.maxTurn / 2;
        expect(body(w, slot)[3]).toBeCloseTo(0.5, 6);
    });

    it('writes pregnant, and ready to mate only when every condition holds', () => {
        const { w, slot } = ready();
        expect(body(w, slot).slice(5, 7)).toEqual([0, 1]);
        w.pregnancy[slot] = 5;
        expect(body(w, slot).slice(5, 7)).toEqual([1, 0]);
        w.pregnancy[slot] = 0;
        w.cooldown[slot] = 1;
        expect(body(w, slot)[6]).toBe(0);
        w.cooldown[slot] = 0;
        w.ageTicks[slot] = w.config.maturityTicks - 1;
        expect(body(w, slot)[6]).toBe(0);
        w.ageTicks[slot] = w.config.maturityTicks;
        w.energy[slot] = w.config.mateMinEnergy;
        expect(body(w, slot)[6]).toBe(0);
    });

    it('samples the danger and attack pheromones at the agent', () => {
        const { w, slot } = ready();
        depositPheromone(w, w.danger, 500, 500);
        depositPheromone(w, w.attack, 500, 500);
        depositPheromone(w, w.attack, 500, 500);
        expect(body(w, slot).slice(7, 9)).toEqual([1, 1]);
        w.attack.fill(0);
        expect(body(w, slot)[8]).toBe(0);
    });

    it('writes the season as sine and cosine of the phase', () => {
        const { w, slot } = ready();
        w.season[1] = 0.125;
        const v = body(w, slot);
        expect(v[9]).toBe(Math.fround(detSin(2 * Math.PI * 0.125)));
        expect(v[10]).toBe(Math.fround(detCos(2 * Math.PI * 0.125)));
        expect(v[9]).toBeCloseTo(Math.SQRT1_2, 5);
    });

    it('writes the eat and bite timers as 1 minus their fraction of the cap', () => {
        const { w, slot } = ready();
        w.ateTimer[slot] = 30;
        w.bittenTimer[slot] = 15;
        const v = body(w, slot);
        expect(v[11]).toBe(0);
        expect(v[12]).toBe(0.5);
    });

    it('writes the specialisation index over four', () => {
        const { w, slot } = ready();
        w.spec[slot] = 3;
        expect(body(w, slot)[13]).toBe(0.75);
    });

    it('writes after the ray block and touches nothing before it', () => {
        const { w, slot } = ready();
        writeBodyInputs(w, slot);
        const rays = w.config.rayCount * 8;
        expect(Array.from(w.inputs.subarray(0, rays)).every((v) => v === 0)).toBe(true);
        expect(w.inputs[rays]).toBeGreaterThan(0);
    });
});
