import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { actAll, integrate } from '../../js/sim/physics.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const NEUTRAL = { specialisations: { predator: { turnMultiplier: 1, sprintBoost: 1 } } };
const TUNED = { specialisations: { predator: { turnMultiplier: 0.7, sprintBoost: 1.6 } } };

/**
 * Adds an agent with a specialisation and outputs `[thrust, turn, sprint, mate, bite]`.
 * @param {ReturnType<typeof senseWorld>} w the world
 * @param {{spec: number, out: number[], vx?: number, y?: number}} a the agent
 * @returns {number} the slot
 */
function put(w, { spec, out, vx = 0, y = 500 }) {
    const slot = addAgent(w, 500, y, 25);
    w.spec[slot] = spec;
    w.vx[slot] = vx;
    w.outputs.set(out, slot * OUTPUT_COUNT);
    return slot;
}

describe('specialisation tables in actAll', () => {
    it('reproduces the multiplier-1 numbers exactly for every specialisation', () => {
        const w = senseWorld(NEUTRAL);
        const slots = [0, 1, 2, 3, 4].map((spec) => put(w, { spec, out: [1, 1, 1, 0, 0], y: 100 + 100 * spec }));
        actAll(w);
        const { maxTurn, maxThrust, sprintMultiplier } = w.config;
        for (const slot of slots) {
            expect(w.turnRate[slot]).toBe(Math.fround(maxTurn));
            expect(w.vx[slot]).toBeCloseTo(maxThrust * (1 + sprintMultiplier) * Math.cos(maxTurn), 6);
        }
    });

    it('scales the predator turn by turnMultiplier and leaves a forager alone', () => {
        const w = senseWorld(TUNED);
        const predator = put(w, { spec: PREDATOR, out: [0, 1, 0, 0, 0] });
        const forager = put(w, { spec: FORAGER, out: [0, 1, 0, 0, 0], y: 700 });
        actAll(w);
        expect(w.turnRate[predator]).toBeCloseTo(0.7 * w.config.maxTurn, 6);
        expect(w.turnRate[forager]).toBeCloseTo(w.config.maxTurn, 6);
    });

    it('scales the sprint thrust by sprintBoost', () => {
        const w = senseWorld(TUNED);
        const predator = put(w, { spec: PREDATOR, out: [1, 0, 1, 0, 0] });
        const forager = put(w, { spec: FORAGER, out: [1, 0, 1, 0, 0], y: 700 });
        actAll(w);
        const { maxThrust, sprintMultiplier } = w.config;
        expect(w.vx[predator]).toBeCloseTo(maxThrust * (1 + sprintMultiplier * 1.6), 6);
        expect(w.vx[forager]).toBeCloseTo(maxThrust * (1 + sprintMultiplier), 6);
    });
});

describe('specialisation tables in integrate', () => {
    it('scales the sprint speed cap by sprintBoost', () => {
        const w = senseWorld(TUNED);
        const predator = put(w, { spec: PREDATOR, out: [0, 0, 1, 0, 0], vx: 100 });
        const forager = put(w, { spec: FORAGER, out: [0, 0, 1, 0, 0], vx: 100, y: 700 });
        integrate(w);
        const { maxVelocity, sprintMultiplier } = w.config;
        expect(w.vx[predator]).toBeCloseTo(maxVelocity * (1 + sprintMultiplier * 1.6), 5);
        expect(w.vx[forager]).toBeCloseTo(maxVelocity * (1 + sprintMultiplier), 5);
    });

    it('does not change the cap of a predator that is not sprinting', () => {
        const w = senseWorld(TUNED);
        const predator = put(w, { spec: PREDATOR, out: [0, 0, 0, 0, 0], vx: 100 });
        integrate(w);
        expect(w.vx[predator]).toBeCloseTo(w.config.maxVelocity, 5);
    });

    it('keeps the multiplier-1 cap exact', () => {
        const w = senseWorld(NEUTRAL);
        const slot = put(w, { spec: PREDATOR, out: [0, 0, 1, 0, 0], vx: 100 });
        integrate(w);
        expect(w.vx[slot]).toBeCloseTo(w.config.maxVelocity * (1 + w.config.sprintMultiplier), 6);
    });
});
