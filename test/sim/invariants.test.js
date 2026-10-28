import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { INVARIANT, assertInvariants } from '../../js/sim/invariants.js';
import { allocAgent, allocateWorld } from '../../js/sim/world.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const SMALL = {
    maxAgents: 4,
    maxFood: 4,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    maxEnergy: 1000,
    initialEnergy: 100,
    worldWidth: 2000,
    worldHeight: 1000,
};

/**
 * A valid world with three agents inside the bounds, each holding 10 energy.
 * @returns {ReturnType<typeof allocateWorld>}
 */
function validWorld() {
    const world = allocateWorld(createConfig({ ...FEATURES_OFF, ...SMALL }));
    for (let i = 0; i < 3; i++) {
        const slot = allocAgent(world);
        world.x[slot] = 10 + i;
        world.y[slot] = 20 + i;
        addEnergy(world, slot, 10, ENERGY_SOURCE.INITIAL);
    }
    return world;
}

/**
 * @param {ReturnType<typeof allocateWorld>} world
 * @returns {any} the error thrown by `assertInvariants`
 */
function violationOf(world) {
    try {
        assertInvariants(world);
    } catch (error) {
        return error;
    }
    throw new Error('expected assertInvariants to throw');
}

describe('assertInvariants', () => {
    it('passes a valid world', () => {
        expect(() => assertInvariants(validWorld())).not.toThrow();
    });

    it('exposes a frozen name map', () => {
        expect(Object.isFrozen(INVARIANT)).toBe(true);
    });

    it.each([
        ['merit', -1],
        ['merit', Number.NaN],
        ['deliberateIntake', -0.5],
        ['deliberateIntake', Infinity],
    ])('throws the merit invariant when %s is %s on an alive slot', (name, value) => {
        const world = validWorld();
        /** @type {any} */ (world)[name][1] = value;
        const error = violationOf(world);
        expect(error.invariant).toBe(INVARIANT.MERIT);
        expect([error.tick, error.slot]).toEqual([0, 1]);
        expect(error.value).toBe(value);
    });

    it('accepts zero and positive merit, and ignores a dead slot', () => {
        const world = validWorld();
        world.merit[0] = 12.5;
        world.deliberateIntake[2] = 3;
        world.merit[3] = -4;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('ignores dead slots holding junk', () => {
        const world = validWorld();
        world.x[3] = Number.NaN;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('rejects a non-finite agent value with its slot', () => {
        const world = validWorld();
        world.vy[1] = Infinity;
        const error = violationOf(world);
        expect(error).toMatchObject({ invariant: INVARIANT.FINITE, slot: 1, value: Infinity, tick: 0 });
        expect(error.message).toContain('vy');
    });

    it('rejects a NaN agent value', () => {
        const world = validWorld();
        world.energy[2] = Number.NaN;
        const error = violationOf(world);
        expect(error.invariant).toBe(INVARIANT.FINITE);
        expect(error.slot).toBe(2);
        expect(error.value).toBeNaN();
    });

    it('rejects a NaN in alive food with the food slot and array name', () => {
        const world = validWorld();
        world.foodAlive[2] = 1;
        world.foodCount = 1;
        world.foodValue[2] = Number.NaN;
        const error = violationOf(world);
        expect(error.invariant).toBe(INVARIANT.FINITE);
        expect(error.slot).toBe(2);
        expect(error.message).toContain('foodValue');
    });

    it('accepts finite alive food and ignores dead food', () => {
        const world = validWorld();
        world.foodAlive[0] = 1;
        world.foodX[1] = Number.NaN;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it.each([
        ['x', -1],
        ['x', 2001],
        ['y', -0.5],
        ['y', 1000.5],
    ])('rejects an agent with %s = %s outside the world', (name, value) => {
        const world = validWorld();
        world[name][1] = value;
        expect(violationOf(world)).toMatchObject({ invariant: INVARIANT.IN_WORLD, slot: 1, value });
    });

    it('accepts an agent exactly on the world edge', () => {
        const world = validWorld();
        world.x[0] = 2000;
        world.y[0] = 1000;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('rejects a population count that differs from the alive agents', () => {
        const world = validWorld();
        world.population = 5;
        expect(violationOf(world)).toMatchObject({ invariant: INVARIANT.POPULATION, slot: -1, value: 3 });
    });

    it('accepts tiny ledger drift', () => {
        const world = validWorld();
        world.ledger[0] += 1e-9;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('rejects larger ledger drift with the difference as its value', () => {
        const world = validWorld();
        world.ledger[1] += 0.5;
        const error = violationOf(world);
        expect(error).toMatchObject({ invariant: INVARIANT.LEDGER, slot: -1 });
        expect(error.value).toBeCloseTo(0.5, 9);
    });

    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Infinity],
        ['below 0', -0.5],
        ['above temperatureMax', 100.5],
    ])('rejects a temperature %s with the slot and value', (_label, value) => {
        const world = validWorld();
        world.temperature[2] = value;
        const error = violationOf(world);
        expect(error).toMatchObject({ invariant: INVARIANT.TEMPERATURE, slot: 2, tick: 0 });
        expect(error.value).toBe(value);
        expect(error.message).toContain('temperature');
    });

    it('accepts a temperature at 0 and at temperatureMax, and ignores a dead slot', () => {
        const world = validWorld();
        world.temperature[0] = 0;
        world.temperature[1] = 100;
        world.temperature[3] = Number.NaN;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('reports the tick', () => {
        const world = validWorld();
        world.tick = 42;
        world.ledger[0] += 5;
        expect(violationOf(world).tick).toBe(42);
    });

    it('reports the first broken invariant when several are broken', () => {
        const world = validWorld();
        world.population = 9;
        world.ledger[0] += 5;
        world.x[0] = -3;
        world.y[2] = Number.NaN;
        expect(violationOf(world).invariant).toBe(INVARIANT.FINITE);
        world.y[2] = 20;
        expect(violationOf(world).invariant).toBe(INVARIANT.IN_WORLD);
        world.x[0] = 5;
        expect(violationOf(world).invariant).toBe(INVARIANT.POPULATION);
        world.population = 3;
        expect(violationOf(world).invariant).toBe(INVARIANT.LEDGER);
    });

    describe('calls', () => {
        it('accepts live clouds with a positive ttl and free slots with 0', () => {
            const world = validWorld();
            world.cloudCount = 2;
            world.cloudTtl[0] = 5;
            world.cloudTtl[1] = 1;
            expect(() => assertInvariants(world)).not.toThrow();
        });

        it.each([
            ['cloudCount above maxClouds', (/** @type {any} */ w) => (w.cloudCount = w.config.maxClouds + 1)],
            ['a live cloud with ttl 0', (/** @type {any} */ w) => (w.cloudCount = 1)],
            ['a free cloud slot with ttl above 0', (/** @type {any} */ w) => (w.cloudTtl[3] = 4)],
            ['an alarm timer above callTicks', (/** @type {any} */ w) => (w.alarmTimer[1] = w.config.callTicks + 1)],
            ['a hunt timer above callTicks', (/** @type {any} */ w) => (w.huntTimer[1] = w.config.callTicks + 1)],
            [
                'a smoke timer above smokeCooldown',
                (/** @type {any} */ w) => (w.smokeTimer[1] = w.config.smokeCooldown + 1),
            ],
            ['an alarm loudness above 1', (/** @type {any} */ w) => (w.heard[6] = 1.5)],
            ['a hunt loudness below 0', (/** @type {any} */ w) => (w.heard[9] = -0.5)],
        ])('throws the calls invariant for %s', (_name, damage) => {
            const world = validWorld();
            damage(world);
            const error = violationOf(world);
            expect(error.invariant).toBe(INVARIANT.CALLS);
            expect(error.message).toMatch(/invariant calls violated at tick 0, slot -?\d+, value /);
        });

        it('reports the slot and value of a bad timer', () => {
            const world = validWorld();
            world.smokeTimer[2] = world.config.smokeCooldown + 7;
            const error = violationOf(world);
            expect([error.slot, error.value]).toEqual([2, world.config.smokeCooldown + 7]);
        });
    });

    it('names the seven invariants', () => {
        expect({ ...INVARIANT }).toEqual({
            FINITE: 'finite',
            IN_WORLD: 'in-world',
            POPULATION: 'population',
            LEDGER: 'ledger',
            TEMPERATURE: 'temperature',
            CALLS: 'calls',
            MERIT: 'merit',
        });
    });

    it('accepts an agent at the origin corner', () => {
        const world = validWorld();
        world.x[0] = 0;
        world.y[0] = 0;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('states the bounds in the x and y messages', () => {
        const world = validWorld();
        world.x[1] = -1;
        expect(violationOf(world).message).toContain('x is outside [0, 2000]');
        world.x[1] = 5;
        world.y[1] = -1;
        expect(violationOf(world).message).toContain('y is outside [0, 1000]');
    });

    it('states the counts in the population message', () => {
        const world = validWorld();
        world.population = 5;
        expect(violationOf(world).message).toContain('3 agents are alive but world.population is 5');
    });

    it('states both sides in the ledger message', () => {
        const world = validWorld();
        world.ledger[1] += 0.5;
        expect(violationOf(world).message).toContain('alive energy 30 differs from ledger in - out 29.5');
    });

    it('leaves the energy of dead slots out of the ledger sum', () => {
        const world = validWorld();
        world.energy[3] = 500;
        expect(() => assertInvariants(world)).not.toThrow();
    });

    it('scales the ledger tolerance with the alive energy', () => {
        const world = validWorld();
        world.ledger[1] -= 2e-5;
        expect(() => assertInvariants(world)).not.toThrow();
        world.ledger[1] -= 2e-5;
        expect(violationOf(world).invariant).toBe(INVARIANT.LEDGER);
    });

    it('uses an absolute ledger tolerance of 1e-6 when the alive energy is below 1', () => {
        const world = allocateWorld(createConfig({ ...FEATURES_OFF, ...SMALL }));
        const slot = allocAgent(world);
        addEnergy(world, slot, 0.5, ENERGY_SOURCE.INITIAL);
        world.ledger[0] += 5e-7;
        expect(() => assertInvariants(world)).not.toThrow();
        world.ledger[0] += 1e-6;
        expect(violationOf(world).invariant).toBe(INVARIANT.LEDGER);
    });
});
