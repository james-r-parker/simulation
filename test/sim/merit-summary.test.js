import { describe, expect, it } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { TALLY } from '../../js/sim/merit-state.js';
import { pushMeritSummary, summaryDue } from '../../js/sim/merit-summary.js';
import { MERIT_LOG_TICKS } from '../../js/sim/merit.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

/**
 * @param {any} w the world
 * @returns {number[]} the summary record's tick, mean, p90, ready, gated and deliberate share
 */
function record(w) {
    expect(w.events.count).toBe(1);
    expect(w.events.data[0]).toBe(EVENT_TYPE.MERIT_SUMMARY);
    return Array.from(w.events.data.subarray(1, 7));
}

describe('summaryDue', () => {
    it('is true on every MERIT_LOG_TICKS multiple but tick 0', () => {
        const w = lifeWorld({});
        const due = [0, 1, MERIT_LOG_TICKS - 1, MERIT_LOG_TICKS, MERIT_LOG_TICKS + 1, 3 * MERIT_LOG_TICKS].map((t) => {
            w.tick = t;
            return summaryDue(w);
        });
        expect(MERIT_LOG_TICKS).toBe(1000);
        expect(due).toEqual([false, false, false, true, false, true]);
    });
});

describe('pushMeritSummary', () => {
    it('reports the mean and nearest-rank 90th percentile of alive merit', () => {
        const w = lifeWorld({ meritHalfLife: 0, maxAgents: 16 });
        for (let i = 1; i <= 10; i++) {
            addBlob(w, { merit: i * 10 });
        }
        const dead = addBlob(w, { merit: 9999 });
        w.alive[dead] = 0;
        w.population -= 1;
        w.tick = 1000;
        pushMeritSummary(w);
        expect(record(w)).toEqual([1000, 55, 90, 0, 0, 0]);
    });

    it('decays merit to the tick without storing it', () => {
        const w = lifeWorld({ meritHalfLife: 100 });
        const a = addBlob(w, { merit: 80 });
        w.tick = 1000;
        pushMeritSummary(w);
        const [, mean, p90] = record(w);
        expect(mean).toBeCloseTo(80 * 0.5 ** 10, 9);
        expect(p90).toBe(mean);
        expect(w.merit[a]).toBe(80);
        expect(w.meritStamp[a]).toBe(0);
    });

    it('reports zeros with no agent alive', () => {
        const w = lifeWorld({});
        w.tick = 2000;
        pushMeritSummary(w);
        expect(record(w)).toEqual([2000, 0, 0, 0, 0, 0]);
    });

    it('reports the tally of the window and restarts it', () => {
        const w = lifeWorld({});
        addBlob(w);
        w.meritTally.set([10, 4, 5, 0, 0, 0]);
        w.tick = 1000;
        pushMeritSummary(w);
        expect(record(w).slice(3)).toEqual([10, 4, 0.5]);
        w.meritTally[TALLY.READY] += 8;
        w.meritTally[TALLY.GATED] += 2;
        w.meritTally[TALLY.DELIBERATE] += 6;
        w.events.count = 0;
        w.tick = 2000;
        pushMeritSummary(w);
        expect(record(w).slice(3)).toEqual([8, 2, 0.75]);
        expect(Array.from(w.meritTally)).toEqual([18, 6, 11, 18, 6, 11]);
    });

    it('writes one record of EVENT_STRIDE fields', () => {
        const w = lifeWorld({});
        pushMeritSummary(w);
        expect(w.events.data.length).toBe(w.events.capacity * EVENT_STRIDE);
        expect(w.events.count).toBe(1);
    });
});
