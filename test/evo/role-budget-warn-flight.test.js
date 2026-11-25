import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { FORAGER_TURN } from '../../js/evo/role-budget-warn.js';
import { flightAfter } from '../../js/evo/role-budget-warn-flight.js';

const config = arenaConfig();
const bodies = { hunter: roleParams(config, 'predator'), forager: roleParams(config, 'forager') };
const start = { gap: 405, turn: FORAGER_TURN, ticks: 11, model: MODEL_DEFAULTS };

describe('flightAfter', () => {
    it('has the forager gain on the hunter while it turns, and fly at the end of the turn', () => {
        const flight = flightAfter(bodies, start);
        // the hunter alone sprints about 115 px in 11 ticks from a creep; the forager moving away gives back about 25 of them
        expect(flight.gap).toBeCloseTo(314.64, 1);
        expect(flight.preyStart.speed).toBeCloseTo(5.84, 2);
        expect(flight.preyStart.offset).toBeCloseTo(0.075, 3);
    });

    it('holds the forager still for the ticks of a delay, so the hunter closes on it and it has turned less', () => {
        const free = flightAfter(bodies, start);
        const late = flightAfter(bodies, { ...start, ticks: 13, still: 2 });
        expect(late.gap).toBeLessThan(free.gap - 16);
    });

    it('a forager that does not turn through a right angle is not flying yet when it has had no ticks', () => {
        const none = flightAfter(bodies, { ...start, ticks: 0 });
        expect(none.gap).toBe(405);
        expect(none.preyStart.speed).toBe(0);
        expect(none.preyStart.offset).toBeCloseTo(FORAGER_TURN, 9);
    });

    it('with a sprint store, a forager that sprints from tick 0 (preySprint always) is faster than one that waits for the hunter', () => {
        // far enough that the hunter is outside the sprint range the rationed forager waits for
        const stored = arenaConfig({ sprintStoreEnabled: true, sprintDrain: 0.01 });
        const own = { hunter: roleParams(stored, 'predator'), forager: roleParams(stored, 'forager') };
        const far = { ...start, gap: 2000 };
        const rationed = flightAfter(own, far);
        const always = flightAfter(own, { ...far, model: { ...MODEL_DEFAULTS, preySprint: 'always' } });
        expect(always.preyStart.speed).toBeGreaterThan(rationed.preyStart.speed);
        expect(always.gap).toBeGreaterThan(rationed.gap);
    });
});
