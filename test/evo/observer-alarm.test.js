import { describe, expect, it } from 'vitest';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { HEARD_STRIDE } from '../../js/sim/world.js';
import { nearestHunterDistances } from '../../js/evo/observer-alarm.js';
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

    it('scores two calls of one tick, sharing a snapshot, as the sum of each call scored alone', () => {
        /** @param {string[]} callers the roles that call this tick @returns {{sum: number, matched: number, records: number}} */
        const run = (callers) => {
            const { world, combat, ids } = scene();
            /** @type {Record<string, number>} */
            const all = { ...ids, extra: addBorn(world, { x: 520, y: 740 }), far: addBorn(world, { x: 900, y: 520 }) };
            world.events.count = 0;
            for (const name of callers) {
                pushCall(world, EVENT_TYPE.ALARM_CALLED, all[name]);
            }
            observeCombat(combat, world);
            nextTick(world, world.tick + ALARM_RESPONSE_TICKS);
            setSpeed(world, all.hearer, 3);
            setSpeed(world, all.control, 1);
            setSpeed(world, all.far, 2);
            observeCombat(combat, world);
            const { sum, matchedCalls } = combat.alarm;
            return { sum, matched: matchedCalls, records: combat.alarm.free.length };
        };
        const both = run(['caller', 'control']);
        const first = run(['caller']);
        const second = run(['control']);
        expect(both.sum).toBe(first.sum + second.sum);
        expect(both.matched).toBe(first.matched + second.matched);
        expect(both.matched).toBeGreaterThan(0);
        expect(both.records).toBe(2);
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

    it('matches the naive all-pairs scan on random worlds, with coincident agents and dead slots', () => {
        const { world, combat } = scene();
        let seed = 12345;
        const rand = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let trial = 0; trial < 300; trial++) {
            for (let slot = 0; slot < world.alive.length; slot++) {
                world.spec[slot] = rand() < 0.3 ? PREDATOR : 0;
                world.x[slot] = Math.floor(rand() * 3) * 90;
                world.y[slot] = Math.floor(rand() * 3) * 70;
                world.alive[slot] = rand() < 0.85 ? 1 : 0;
            }
            const naive = new Float64Array(world.alive.length).fill(Infinity);
            const { alive, spec, x, y } = world;
            for (let h = 0; h < alive.length; h++) {
                if (alive[h] !== 1 || combat.alarm.hunterSpec[spec[h]] !== 1) {
                    continue;
                }
                for (let s = 0; s < alive.length; s++) {
                    const d2 = (x[s] - x[h]) ** 2 + (y[s] - y[h]) ** 2;
                    if (alive[s] === 1 && s !== h && d2 < naive[s]) {
                        naive[s] = d2;
                    }
                }
            }
            nearestHunterDistances(combat.alarm, world);
            for (let s = 0; s < alive.length; s++) {
                expect(combat.alarm.hunterDist[s]).toBe(alive[s] === 1 ? Math.sqrt(naive[s]) : naive[s]);
            }
        }
    });
});
