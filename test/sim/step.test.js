import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { STEP_PHASES, step } from '../../js/sim/step.js';
import { smallWorld } from './helpers/small-world.js';
import { testPolicy } from './helpers/test-policy.js';

const NAMES = ['environment', 'hash', 'sense', 'brain', 'signal', 'physics', 'lifecycle', 'field', 'invariants'];

/**
 * @param {string[]} log receives each phase name as it runs
 * @returns {Record<string, () => void>} overrides recording every phase
 */
function recorders(log) {
    return Object.fromEntries(NAMES.map((name) => [name, () => log.push(name)]));
}

describe('STEP_PHASES', () => {
    it('lists the phases in the design order', () => {
        expect(STEP_PHASES.map((p) => p.name)).toEqual(NAMES);
    });

    it('is frozen, with frozen phases', () => {
        expect(Object.isFrozen(STEP_PHASES)).toBe(true);
        expect(STEP_PHASES.every((p) => Object.isFrozen(p))).toBe(true);
    });
});

describe('step', () => {
    it('runs the phases in order', () => {
        const world = smallWorld();
        /** @type {string[]} */
        const log = [];
        step(world, testPolicy, recorders(log));
        expect(log).toEqual(NAMES);
    });

    it('replaces only the overridden phase', () => {
        const world = smallWorld({ checkInvariants: true });
        /** @type {string[]} */
        const log = [];
        step(world, testPolicy, { brain: () => log.push('brain') });
        expect(log).toEqual(['brain']);
        expect(world.tick).toBe(1);
    });

    it('increments the tick once per call, with or without overrides', () => {
        const world = smallWorld();
        step(world, testPolicy);
        step(world, testPolicy, {});
        expect(world.tick).toBe(2);
    });

    it('clears the event ring before the first phase', () => {
        const world = smallWorld();
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 0);
        let seen = -1;
        step(world, testPolicy, { environment: () => (seen = world.events.count) });
        expect(seen).toBe(0);
    });

    it('names the tick and phase when a phase throws, keeping the original as the cause', () => {
        const world = smallWorld();
        world.tick = 7;
        const original = new Error('boom');
        const thrower = () => {
            throw original;
        };
        /** @type {any} */
        let error;
        try {
            step(world, testPolicy, { sense: thrower });
        } catch (e) {
            error = e;
        }
        expect(error.message).toContain('tick 7');
        expect(error.message).toContain('phase sense');
        expect(error.message).toContain('boom');
        expect(error.cause).toBe(original);
        expect(world.tick).toBe(7);
    });

    it('wraps a thrown non-Error value by its string form', () => {
        const world = smallWorld();
        const thrower = () => {
            throw 'plain';
        };
        expect(() => step(world, testPolicy, { hash: thrower })).toThrow(/phase hash: plain/);
    });

    it('runs the invariants phase only when the config asks for it', () => {
        const run = STEP_PHASES[NAMES.indexOf('invariants')].run;
        const off = smallWorld({ checkInvariants: false });
        off.population = 5;
        expect(() => run(off, testPolicy)).not.toThrow();
        const on = smallWorld({ checkInvariants: true });
        on.population = 5;
        expect(() => run(on, testPolicy)).toThrow(/population/);
    });
});
