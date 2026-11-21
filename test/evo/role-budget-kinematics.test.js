import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { bodyTable } from '../../js/evo/chase-body.js';
import {
    burstTicks,
    emptyTicks,
    norm,
    refillTicks,
    speedStep,
    sprintFactor,
    steadySpeed,
    swingTicks,
    ticksToSpeed,
    turnCircle,
    turnLoop,
} from '../../js/evo/role-budget-kinematics.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const courser = JSON.parse(readFileSync('evals/fair-chase/courser.json', 'utf8'));

describe('speedStep and steadySpeed', () => {
    it('is min(cap, (v + a) d) and agrees with a naive tick loop', () => {
        expect(speedStep(0, 0.525, 0.95, 8)).toBeCloseTo(0.49875, 12);
        expect(speedStep(10, 0.5, 0.95, 8)).toBe(8);
        let v = 0;
        for (let t = 0; t < 40; t++) {
            v = Math.min(8, (v + 0.525) * 0.95);
        }
        let w = 0;
        for (let t = 0; t < 40; t++) {
            w = speedStep(w, 0.525, 0.95, 8);
        }
        expect(w).toBe(v);
    });

    it('has the uncapped steady speed a d / (1 - d)', () => {
        expect(steadySpeed(0.525, 0.95)).toBeCloseTo(9.975, 9);
        expect(steadySpeed(0.945, 0.95)).toBeCloseTo(17.955, 9);
    });
});

describe('ticksToSpeed', () => {
    it('counts the ticks from rest to the cap, 32 for cruise and sprint of both bodies', () => {
        const prey = roleParams(arenaConfig(), 'forager');
        const hunter = roleParams(arenaConfig(), 'predator');
        for (const p of [prey, hunter]) {
            expect(ticksToSpeed(p.thrust.cruise, p.damping, p.cap.cruise)).toBe(32);
            expect(ticksToSpeed(p.thrust.sprint, p.damping, p.cap.sprint)).toBe(32);
        }
    });

    it('is infinite when the steady speed is under the cap', () => {
        expect(ticksToSpeed(0.1, 0.95, 8)).toBe(Infinity);
        expect(ticksToSpeed(1, 0.95, 1e9)).toBe(Infinity);
    });
});

describe('turnCircle, swingTicks and turnLoop', () => {
    it('settles at a d / sqrt(1 - 2 d cos w + d^2), the radius that over w, never above the cap', () => {
        const prey = roleParams(arenaConfig(), 'forager');
        const cruise = turnCircle(prey.thrust.cruise, prey.damping, prey.turnRate.start);
        expect(cruise.speed).toBeCloseTo(3.231, 3);
        expect(cruise.radius).toBeCloseTo(21.54, 2);
        expect(turnCircle(5, 0.95, 0.01, 8).speed).toBe(8);
    });

    it('agrees with the body table of the sim inside 0.5%, at the defaults and on the courser arm', () => {
        for (const overrides of [{}, courser]) {
            const config = arenaConfig(overrides);
            for (const row of bodyTable(config)) {
                const p = roleParams(config, row.name);
                const cruise = turnCircle(p.thrust.cruise, p.damping, p.turnRate.start, p.cap.cruise);
                const sprint = turnCircle(p.thrust.sprint, p.damping, p.turnRate.start, p.cap.sprint);
                expect(Math.abs(cruise.radius / row.turnRadius - 1)).toBeLessThan(0.005);
                expect(Math.abs(sprint.radius / row.sprintTurnRadius - 1)).toBeLessThan(0.005);
            }
        }
    });

    it('is phi over w for the swing', () => {
        expect(swingTicks(Math.PI / 2, 0.15)).toBeCloseTo(10.47, 2);
        expect(swingTicks(Math.PI / 2, 0.105)).toBeCloseTo(14.96, 2);
    });

    it('turns the hunter through an angle in ceil(angle / rate) ticks and loses speed doing it', () => {
        const hunter = roleParams(arenaConfig(), 'predator');
        const quarter = turnLoop(hunter, Math.PI / 2);
        expect(quarter.ticks).toBe(Math.ceil(Math.PI / 2 / hunter.turnRate.start));
        expect(quarter.endSpeed).toBeLessThan(hunter.cap.cruise);
        expect(quarter.endSpeed).toBeGreaterThan(turnCircle(hunter.thrust.cruise, hunter.damping, 0.105).speed);
        expect(turnLoop(hunter, Math.PI).endSpeed).toBeLessThan(quarter.endSpeed);
        expect(turnLoop(hunter, 0)).toEqual({ ticks: 0, distance: 0 * 0 + 8 * 0, endSpeed: hunter.cap.cruise });
    });
});

describe('the sprint store', () => {
    const config = arenaConfig(courser);
    const prey = roleParams(config, 'forager');
    const hunter = roleParams(config, 'predator');

    it('has a burst of 70 and 140 ticks, 100 and 200 to empty, and 500 to refill, on the courser arm', () => {
        expect(burstTicks(prey.store)).toBeCloseTo(70, 9);
        expect(burstTicks(hunter.store)).toBeCloseTo(140, 9);
        expect(emptyTicks(prey.store)).toBeCloseTo(100, 9);
        expect(emptyTicks(hunter.store)).toBeCloseTo(200, 9);
        expect(refillTicks(hunter.store)).toBeCloseTo(500, 9);
    });

    it('lasts longer at a lower effort, in proportion', () => {
        expect(burstTicks(hunter.store, 0.5)).toBeCloseTo(280, 9);
        expect(emptyTicks(hunter.store, 0.5)).toBeCloseTo(400, 9);
        expect(refillTicks(hunter.store, 0.5)).toBeCloseTo(250, 9);
    });

    it('is infinite with the store off, and refills nothing', () => {
        const off = roleParams(arenaConfig(), 'forager');
        expect(burstTicks(off.store)).toBe(Infinity);
        expect(emptyTicks(off.store)).toBe(Infinity);
        expect(refillTicks(off.store)).toBe(0);
    });

    it('has a sprint factor of 1 at or above the floor and level / floor under it', () => {
        expect(sprintFactor(1, 0.3)).toBe(1);
        expect(sprintFactor(0.3, 0.3)).toBe(1);
        expect(sprintFactor(0.15, 0.3)).toBeCloseTo(0.5, 12);
        expect(sprintFactor(0, 0.3)).toBe(0);
    });
});

describe('norm', () => {
    it('is the length of a vector', () => {
        expect(norm(3, 4)).toBe(5);
    });
});
