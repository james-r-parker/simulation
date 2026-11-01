import { describe, expect, it } from 'vitest';
import {
    BLOCKED_CAUSE,
    BORN_CAUSE,
    DEATH_CAUSE,
    EVENT_STRIDE,
    EVENT_TYPE,
    clearEvents,
    createEventRing,
    pushEvent,
    readEvents,
} from '../../js/sim/events.js';

describe('event codes', () => {
    it('exports the record stride and the frozen code sets', () => {
        expect(EVENT_STRIDE).toBe(12);
        expect(EVENT_TYPE).toEqual({
            AGENT_BORN: 1,
            AGENT_DIED: 2,
            BIRTH_BLOCKED: 3,
            POPULATION_FLOOR: 4,
            ALARM_CALLED: 5,
            SMOKE_RELEASED: 6,
            PACK_CALLED: 7,
            SMOKE_REFUSED: 8,
            FOOD_PATCHES_CREATED: 9,
            SEASON_CHANGED: 10,
            DROUGHT_STARTED: 11,
            MERIT_SUMMARY: 14,
            LINE_PROVEN: 15,
            AGENT_SICKENED: 16,
            PATCH_SEEDED: 17,
            PATCH_DIED: 18,
            SEEDING_REFUSED: 19,
            HERD_ROUTE_CHANGED: 20,
            HERD_STAMPEDE: 21,
            HERD_ANIMAL_DIED: 22,
            HERD_ANIMAL_BORN: 23,
            HERD_CARCASS_LOST: 24,
        });
        expect(BORN_CAUSE).toEqual({ INITIAL: 0, MATE: 1, SPLIT: 2, FLOOR: 3, IMMIGRANT: 4 });
        expect(DEATH_CAUSE).toEqual({ STARVED: 0, EATEN: 1, COLLISION: 2, OLD_AGE: 3, POISONED: 4, TRAMPLED: 5 });
        expect(BLOCKED_CAUSE).toEqual({ CAPACITY: 0, ENERGY: 1 });
        for (const codes of [EVENT_TYPE, BORN_CAUSE, DEATH_CAUSE, BLOCKED_CAUSE]) {
            expect(Object.isFrozen(codes)).toBe(true);
        }
    });
});

describe('createEventRing', () => {
    it('allocates capacity records of Float64 fields, empty', () => {
        const ring = createEventRing(5);
        expect(ring.capacity).toBe(5);
        expect(ring.count).toBe(0);
        expect(ring.data).toBeInstanceOf(Float64Array);
        expect(ring.data.length).toBe(5 * EVENT_STRIDE);
    });

    it('rejects a capacity that is not a positive integer, naming the value', () => {
        expect(() => createEventRing(0)).toThrow(/capacity must be a positive integer, got 0/);
        expect(() => createEventRing(2.5)).toThrow(/got 2\.5/);
    });
});

describe('pushEvent', () => {
    it('writes type and tick into fields 0 and 1 and returns the record offset', () => {
        const ring = createEventRing(3);
        const first = pushEvent(ring, EVENT_TYPE.AGENT_BORN, 42);
        const second = pushEvent(ring, EVENT_TYPE.AGENT_DIED, 43);
        expect([first, second]).toEqual([0, EVENT_STRIDE]);
        expect(ring.data[second]).toBe(EVENT_TYPE.AGENT_DIED);
        expect(ring.data[second + 1]).toBe(43);
        expect(ring.count).toBe(2);
    });

    it('zeroes the fields after the tick so a reused record carries no stale values', () => {
        const ring = createEventRing(1);
        ring.data.fill(7);
        pushEvent(ring, EVENT_TYPE.POPULATION_FLOOR, 1);
        expect(ring.data[0]).toBe(EVENT_TYPE.POPULATION_FLOOR);
        expect(ring.data[1]).toBe(1);
        expect([...ring.data.subarray(2, EVENT_STRIDE)].every((v) => v === 0)).toBe(true);
    });

    it('throws naming the tick and eventCapacity when the ring is full', () => {
        const ring = createEventRing(2);
        pushEvent(ring, EVENT_TYPE.AGENT_BORN, 7);
        pushEvent(ring, EVENT_TYPE.AGENT_BORN, 7);
        expect(() => pushEvent(ring, EVENT_TYPE.AGENT_DIED, 7)).toThrow(/at tick 7 \(eventCapacity 2\)/);
        expect(ring.count).toBe(2);
    });
});

describe('readEvents and clearEvents', () => {
    it('reads the record count', () => {
        const ring = createEventRing(4);
        expect(readEvents(ring)).toBe(0);
        pushEvent(ring, EVENT_TYPE.BIRTH_BLOCKED, 0);
        expect(readEvents(ring)).toBe(1);
    });

    it('empties the ring so the next push reuses record 0', () => {
        const ring = createEventRing(2);
        pushEvent(ring, EVENT_TYPE.AGENT_BORN, 1);
        pushEvent(ring, EVENT_TYPE.AGENT_BORN, 1);
        clearEvents(ring);
        expect(readEvents(ring)).toBe(0);
        expect(pushEvent(ring, EVENT_TYPE.AGENT_DIED, 2)).toBe(0);
        expect(ring.data[0]).toBe(EVENT_TYPE.AGENT_DIED);
    });
});
