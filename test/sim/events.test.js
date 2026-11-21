import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    BLOCKED_CAUSE,
    BORN_CAUSE,
    BORN_CAUSES,
    DEATH_CAUSE,
    DEATH_CAUSES,
    EVENT,
    EVENT_BY_CODE,
    EVENT_STRIDE,
    EVENT_TYPE,
    EVENTS,
    clearEvents,
    createEventRing,
    offsetsOf,
    pushEvent,
    readEvents,
} from '../../js/sim/events.js';
import { LOG_LEVEL, createSimLog, drainEvents } from '../../js/sim/log.js';
import { LOGGED_CODES, buildReferenceRing } from './helpers/event-rings.js';

/** The records of the reference ring as the log wrote them before the events were a registry (test/fixtures). */
const REFERENCE = JSON.parse(readFileSync(new URL('../fixtures/event-log-reference.json', import.meta.url), 'utf8'));

/**
 * @param {import('../../js/sim/events.js').EventRing} ring the ring to drain
 * @param {'debug' | 'info' | 'warn'} level the log level
 * @returns {Record<string, any>[]} the records drained
 */
function drain(ring, level) {
    /** @type {Record<string, any>[]} */
    const records = [];
    drainEvents(
        { events: ring },
        createSimLog((r) => records.push(r), { level }),
    );
    return records;
}

describe('EVENTS', () => {
    it('lists every event once, with its code, a level and distinct field names that fit the record', () => {
        expect(new Set(EVENTS.map((def) => def.code)).size).toBe(EVENTS.length);
        expect(new Set(EVENTS.map((def) => def.name)).size).toBe(EVENTS.length);
        for (const def of EVENTS) {
            expect(Object.keys(LOG_LEVEL)).toContain(def.level);
            expect(new Set(def.fields).size).toBe(def.fields.length);
            expect(def.fields.length).toBeLessThanOrEqual(EVENT_STRIDE - 2);
            expect(EVENT_BY_CODE[def.code]).toBe(def);
        }
    });

    it('builds EVENT_TYPE with the codes of today, the unused PROVISIONED among them', () => {
        expect(Object.values(EVENT_TYPE)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
            32, 33, 34, 35, 36, 37, 38, 39,
        ]);
        expect(EVENT_TYPE.PROVISIONED).toBe(32);
        expect(EVENTS.filter((def) => def.log === null).map((def) => def.name)).toEqual(['PROVISIONED']);
    });

    it('numbers each field from offset 2, after the type and the tick', () => {
        for (const def of EVENTS) {
            expect(EVENT[def.name].TYPE).toBe(0);
            expect(EVENT[def.name].TICK).toBe(1);
            expect(Object.values(EVENT[def.name]).slice(2)).toEqual(def.fields.map((_, i) => 2 + i));
        }
    });

    it('keeps the offsets the emitters wrote before the registry, including those the log leaves out', () => {
        expect(EVENT.AGENT_BORN).toMatchObject({ SLOT: 2, GENOME_ID: 3, LINEAGE_ID: 4, SPEC: 5, PARENT_A: 6 });
        expect(EVENT.AGENT_BORN).toMatchObject({ PARENT_B: 7, CAUSE: 8, SEX: 9 });
        expect(EVENT.AGENT_DIED).toMatchObject({ SLOT: 2, GENOME_ID: 3, CAUSE: 4, BY: 5, SPEC: 6, LINEAGE_ID: 7 });
        expect(EVENT.AGENT_DIED).toMatchObject({
            AGE_TICKS: 8,
            FOOD_ENERGY: 9,
            BITE_ENERGY: 10,
            PARTNER: 11,
            SIZE: 12,
        });
        expect(EVENT.POPULATION_FLOOR).toMatchObject({ ADDED: 2, POPULATION: 3 });
        expect(EVENT.SMOKE_RELEASED).toMatchObject({ SPEC: 4, X: 5, Y: 6, CLOUD: 7 });
        expect(EVENT.HERD_STAMPEDE).toMatchObject({ GROUP: 2, HUNTER: 3, ANIMALS: 4, X: 5, Y: 6 });
        expect(EVENT.HERD_SEEDED).toMatchObject({ HERD: 2, ANIMAL: 3, SOURCE: 4, PATCH: 5, SPECIES: 6, X: 7, Y: 8 });
        expect(EVENT.PATCH_SEEDED).toMatchObject({ SPECIES: 2, PATCH: 3, PARENT_A: 4, HUE: 6, X: 7, Y: 8 });
        expect(EVENT.HUNTER_LEDGER).toMatchObject({ GENOME_ID: 2, AGE_TICKS: 3, PACKED: 4, BITE_COST_ENERGY: 11 });
        expect(EVENT.HUNTER_KILL).toMatchObject({ GENOME_ID: 2, AGE_TICKS: 3, KILLS: 4, DEPENDENT: 5 });
        expect(EVENT.LAST_HUNTER_DIED).toMatchObject({ GENOME_ID: 2, BASIN: 3, NON_PREDATORS_WEST: 4 });
        expect(EVENT.MERIT_SUMMARY).toMatchObject({ MERIT_MEAN: 2, DELIBERATE_READY_SHARE: 6 });
    });
});

describe('offsetsOf', () => {
    it('numbers the fields after the type and the tick', () => {
        const def = { code: 99, name: 'X', log: null, level: /** @type {const} */ ('debug'), fields: ['aB', 'c'] };
        expect(offsetsOf(def)).toEqual({ TYPE: 0, TICK: 1, A_B: 2, C: 3 });
    });

    it('throws for a field that does not fit the record, and for one that repeats an offset name', () => {
        const base = { code: 99, name: 'X', log: null, level: /** @type {const} */ ('debug') };
        const many = Array.from({ length: EVENT_STRIDE - 1 }, (_, i) => `f${i}`);
        expect(() => offsetsOf({ ...base, fields: many })).toThrow('record holds 11');
        expect(() => offsetsOf({ ...base, fields: ['a', 'a'] })).toThrow('twice');
        expect(() => offsetsOf({ ...base, fields: ['tick'] })).toThrow('reuses TYPE or TICK');
    });
});

describe('the cause lists', () => {
    it('carry code, name and colour, in code order, and build the keyed maps', () => {
        for (const list of [BORN_CAUSES, DEATH_CAUSES]) {
            expect(list.map((cause) => cause.code)).toEqual(list.map((_, i) => i));
            for (const cause of list) {
                expect(cause.name).toMatch(/^[a-z-]+$/);
                expect(cause.colour).toMatch(/^#[0-9a-f]{6}$/);
            }
        }
        expect(BORN_CAUSES.map((cause) => cause.name)).toEqual(['initial', 'mate', 'split', 'floor', 'immigrant']);
        expect(DEATH_CAUSES.map((cause) => cause.name)).toEqual([
            'starved',
            'eaten',
            'collision',
            'old-age',
            'poisoned',
            'trampled',
            'disease',
        ]);
        expect(BORN_CAUSE.SPLIT).toBe(2);
        expect(DEATH_CAUSE.OLD_AGE).toBe(3);
    });
});

describe('drainEvents with the one emitter', () => {
    it('writes what each hand-written emitter wrote, field for field and key for key, on a record of every event', () => {
        const written = drain(buildReferenceRing(), 'debug');
        expect(written).toEqual(REFERENCE);
        expect(written.map((r) => JSON.stringify(r))).toEqual(
            REFERENCE.map((/** @type {unknown} */ r) => JSON.stringify(r)),
        );
    });

    it('covers every logged event of the registry', () => {
        expect(LOGGED_CODES).toEqual(EVENTS.filter((def) => def.log !== null).map((def) => def.code));
    });

    it('skips a record below the log level and writes its warn and info records at info', () => {
        const levels = new Set(drain(buildReferenceRing(), 'info').map((r) => r.level));
        expect([...levels].sort()).toEqual(['info', 'warn']);
    });

    it('throws on the unused PROVISIONED code and on a code with no event', () => {
        for (const code of [EVENT_TYPE.PROVISIONED, 12]) {
            const ring = createEventRing(1);
            pushEvent(ring, code, 3);
            expect(() => drain(ring, 'debug')).toThrow(`unknown event type ${code} at record 0`);
        }
    });

    it('throws naming the event when a cause code is outside its table', () => {
        const ring = createEventRing(1);
        const o = pushEvent(ring, EVENT_TYPE.AGENT_DIED, 3);
        ring.data[o + EVENT.AGENT_DIED.CAUSE] = 9;
        expect(() => drain(ring, 'debug')).toThrow('AgentDied has unknown cause code 9');
    });
});

describe('event codes', () => {
    it('exports the record stride and the frozen code sets', () => {
        expect(EVENT_STRIDE).toBe(13);
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
            HERD_SEEDED: 25,
            STRAIN_EMERGED: 26,
            AGENT_INFECTED: 27,
            STRAIN_EXTINCT: 28,
            HUNTER_LEDGER: 29,
            LAST_HUNTER_DIED: 30,
            HUNTER_KILL: 31,
            PROVISIONED: 32,
            COVER_CONFIG: 33,
            COVER_TOTALS: 34,
            HUNTER_RECOIL_LIFE: 35,
            SPRINT_SPENT: 36,
            EFFECT_APPLIED: 37,
            EFFECT_CAPPED: 38,
            DEFENDER_SHOVED: 39,
        });
        expect(BORN_CAUSE).toEqual({ INITIAL: 0, MATE: 1, SPLIT: 2, FLOOR: 3, IMMIGRANT: 4 });
        expect(DEATH_CAUSE).toEqual({
            STARVED: 0,
            EATEN: 1,
            COLLISION: 2,
            OLD_AGE: 3,
            POISONED: 4,
            TRAMPLED: 5,
            DISEASE: 6,
        });
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
