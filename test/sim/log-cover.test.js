import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, createEventRing, pushEvent } from '../../js/sim/events.js';
import { createSimLog, drainEvents } from '../../js/sim/log.js';

/**
 * @param {number} type the event type to push
 * @param {number[]} fields fields 2 and on
 * @param {'debug' | 'info'} level the log level
 * @returns {Record<string, any>[]} the records the one event drains to
 */
function drain(type, fields, level) {
    const ring = createEventRing(2);
    const o = pushEvent(ring, type, 9);
    fields.forEach((v, i) => {
        ring.data[o + 2 + i] = v;
    });
    /** @type {Record<string, any>[]} */
    const records = [];
    drainEvents(
        { events: ring },
        createSimLog((r) => records.push(r), { level }),
    );
    return records;
}

describe('the cover log events', () => {
    it('turns a CoverConfig record into an info event', () => {
        expect(drain(EVENT_TYPE.COVER_CONFIG, [8, 60, 120.5], 'info')).toEqual([
            {
                event: 'CoverConfig',
                level: 'info',
                tick: 9,
                refugeCount: 8,
                aperturePx: 60,
                interiorRadius: 120.5,
            },
        ]);
    });

    it('turns a CoverTotals record into a debug event, skipped at info', () => {
        expect(drain(EVENT_TYPE.COVER_TOTALS, [4, 400, 12, 5], 'debug')).toEqual([
            {
                event: 'CoverTotals',
                level: 'debug',
                tick: 9,
                agentsInRings: 4,
                agentTicksInRings: 400,
                concealedHits: 12,
                foodRejected: 5,
            },
        ]);
        expect(drain(EVENT_TYPE.COVER_TOTALS, [4, 400, 12, 5], 'info')).toEqual([]);
    });
});
