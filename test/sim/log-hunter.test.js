import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';

/**
 * @param {number} type the event type to push
 * @param {number[]} fields fields 2 and on
 * @returns {Record<string, any>[]} the debug records the one event drains to
 */
function drain(type, fields) {
    const ring = createEventRing(2);
    const o = pushEvent(ring, type, 7);
    fields.forEach((v, i) => {
        ring.data[o + 2 + i] = v;
    });
    /** @type {Record<string, any>[]} */
    const records = [];
    drainEvents(
        { events: ring },
        createSimLog((r) => records.push(r), { level: 'debug' }),
    );
    return records;
}

describe('the hunter-learning log events', () => {
    it('turns a HunterKill record into a debug event with the killer, its age and its kills so far', () => {
        expect(drain(EVENT_TYPE.HUNTER_KILL, [41, 900, 2])).toEqual([
            { event: 'HunterKill', level: 'debug', tick: 7, genomeId: 41, ageTicks: 900, kills: 2 },
        ]);
    });

    it('turns a Provisioned record into a debug event with the giver, the energy and the young fed', () => {
        expect(drain(EVENT_TYPE.PROVISIONED, [41, 12.5, 3])).toEqual([
            { event: 'Provisioned', level: 'debug', tick: 7, genomeId: 41, energy: 12.5, young: 3 },
        ]);
    });

    it('keeps both out of an info-level log', () => {
        const ring = createEventRing(2);
        pushEvent(ring, EVENT_TYPE.PROVISIONED, 1);
        pushEvent(ring, EVENT_TYPE.HUNTER_KILL, 1);
        /** @type {Record<string, any>[]} */
        const records = [];
        drainEvents(
            { events: ring },
            createSimLog((r) => records.push(r), { level: 'info' }),
        );
        expect(records).toEqual([]);
    });
});
