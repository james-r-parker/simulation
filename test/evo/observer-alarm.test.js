import { describe, expect, it } from 'vitest';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { ALARM_RESPONSE_TICKS, observeCombat } from '../../js/evo/observer-combat.js';
import { addBorn, nextTick, observed, pushCall } from './helpers/observer-world.js';

const PREDATOR = 1;

/**
 * A hunter at (500, 500), a caller, a hearer near the caller, and a control outside the caller's radius in the
 * hearer's band of distance to the hunter.
 * @returns {{world: any, combat: any, ids: Record<string, number>}} slots by role
 */
function scene() {
    const { world, observer } = observed();
    const slots = {
        hunter: addBorn(world, { spec: PREDATOR, x: 500, y: 500 }),
        caller: addBorn(world, { x: 500, y: 750 }),
        hearer: addBorn(world, { x: 500, y: 720 }),
        control: addBorn(world, { x: 780, y: 500 }),
    };
    nextTick(world, 1);
    world.heard[slots.hearer * HEARD_STRIDE] = 0.5;
    pushCall(world, EVENT_TYPE.ALARM_CALLED, slots.caller);
    return { world, combat: observer.combat, ids: slots };
}

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} speed its speed along x
 * @returns {void}
 */
function setSpeed(world, slot, speed) {
    world.vx[slot] = speed;
    world.vy[slot] = 0;
}

describe('alarm follow-up', () => {
    it('scores the hearers speed change minus the matched control change, over maxVelocity', () => {
        const { world, combat, ids } = scene();
        observeCombat(combat, world);
        nextTick(world, world.tick + ALARM_RESPONSE_TICKS - 1);
        setSpeed(world, ids.hearer, 3);
        observeCombat(combat, world);
        expect(combat.alarm.matchedCalls).toBe(0);
        nextTick(world, world.tick + 1);
        setSpeed(world, ids.hearer, 3);
        setSpeed(world, ids.control, 1);
        observeCombat(combat, world);
        expect(combat.alarm.calls).toBe(1);
        expect(combat.alarm.matchedCalls).toBe(1);
        expect(combat.alarm.sum).toBeCloseTo(2 / world.config.maxVelocity, 5);
    });

    it('ignores agents that are dead or replaced at the second reading', () => {
        const { world, combat, ids } = scene();
        observeCombat(combat, world);
        nextTick(world, world.tick + ALARM_RESPONSE_TICKS);
        setSpeed(world, ids.hearer, 3);
        world.genomeId[ids.control] += 100;
        setSpeed(world, ids.control, 3);
        observeCombat(combat, world);
        expect(combat.alarm.matchedCalls).toBe(0);
        expect(combat.alarm.calls).toBe(1);
    });

    it('does not match a hearer to a control in another distance band', () => {
        const { world, combat, ids } = scene();
        world.x[ids.control] = 900;
        observeCombat(combat, world);
        nextTick(world, world.tick + ALARM_RESPONSE_TICKS);
        setSpeed(world, ids.hearer, 3);
        observeCombat(combat, world);
        expect(combat.alarm.matchedCalls).toBe(0);
    });

    it('skips a call with no hunter alive, which has no band', () => {
        const { world, combat, ids } = scene();
        world.alive[ids.hunter] = 0;
        observeCombat(combat, world);
        nextTick(world, world.tick + ALARM_RESPONSE_TICKS);
        observeCombat(combat, world);
        expect([combat.alarm.calls, combat.alarm.matchedCalls]).toEqual([1, 0]);
    });

    it('recycles call records', () => {
        const { world, combat, ids } = scene();
        observeCombat(combat, world);
        nextTick(world, world.tick + ALARM_RESPONSE_TICKS);
        setSpeed(world, ids.hearer, 3);
        observeCombat(combat, world);
        expect(combat.alarm.free).toHaveLength(1);
        const record = combat.alarm.free[0];
        pushCall(world, EVENT_TYPE.ALARM_CALLED, ids.caller);
        observeCombat(combat, world);
        expect(combat.alarm.queue[0]).toBe(record);
    });

    it('measures each alive agent to its nearest alive hunter, and leaves dead slots and a lone hunter at Infinity', () => {
        const { world, combat, ids } = scene();
        const far = addBorn(world, { spec: PREDATOR, x: 900, y: 300 });
        const gone = addBorn(world, { x: 640, y: 480 });
        world.alive[gone] = 0;
        observeCombat(combat, world);
        const dist = combat.alarm.hunterDist;
        const to = (/** @type {number} */ a, /** @type {number} */ b) =>
            Math.sqrt((world.x[a] - world.x[b]) ** 2 + (world.y[a] - world.y[b]) ** 2);
        expect(dist[ids.caller]).toBe(Math.min(to(ids.caller, ids.hunter), to(ids.caller, far)));
        expect(dist[ids.control]).toBe(Math.min(to(ids.control, ids.hunter), to(ids.control, far)));
        expect(dist[ids.hunter]).toBe(to(ids.hunter, far));
        expect(dist[far]).toBe(to(far, ids.hunter));
        expect(dist[gone]).toBe(Infinity);
    });
});
