import { describe, expect, it } from 'vitest';
import {
    SNAPSHOT_GAP_MS,
    createPacer,
    markSnapshot,
    nextDelay,
    restartClock,
    snapshotDue,
    ticksDue,
} from '../../js/worker/pacing.js';

describe('ticksDue', () => {
    it('owes ticks in proportion to the elapsed time and the requested rate', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        expect(ticksDue(pacer, 50, 60)).toBe(3);
        expect(pacer.owed).toBeCloseTo(0, 9);
        expect(ticksDue(pacer, 100, 120)).toBe(6);
    });

    it('carries the fraction of a tick to the next slice', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        let total = 0;
        for (let t = 10; t <= 1000; t += 10) {
            total += ticksDue(pacer, t, 60);
        }
        expect(total).toBeGreaterThanOrEqual(59);
        expect(total + pacer.owed).toBeCloseTo(60, 6);
    });

    it('runs at most maxTicksPerSlice and keeps the rest owed', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        expect(ticksDue(pacer, 200, 60)).toBe(8);
        expect(pacer.owed).toBeCloseTo(4, 9);
        expect(ticksDue(pacer, 200, 60)).toBe(4);
        expect(pacer.dropped).toBe(0);
    });

    it('caps what is owed at two slices and counts the excess as dropped', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        expect(ticksDue(pacer, 1000, 60)).toBe(8);
        expect(pacer.owed).toBe(8);
        expect(pacer.dropped).toBe(60 - 16);
    });

    it('starts its clock at the first call', () => {
        const pacer = createPacer();
        expect(ticksDue(pacer, 5000, 60)).toBe(0);
    });

    it('pays back nothing for the time after restartClock', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        ticksDue(pacer, 20, 60);
        restartClock(pacer, 10_000);
        expect(ticksDue(pacer, 10_000, 60)).toBe(0);
        expect(ticksDue(pacer, 10_050, 60)).toBe(3);
        expect(pacer.dropped).toBe(0);
    });

    it('honours a custom cap', () => {
        const pacer = createPacer({ maxTicksPerSlice: 2 });
        ticksDue(pacer, 0, 60);
        expect(ticksDue(pacer, 1000, 60)).toBe(2);
        expect(pacer.owed).toBe(2);
    });
});

describe('nextDelay', () => {
    it('is 0 while a whole tick is owed', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        ticksDue(pacer, 200, 60);
        expect(nextDelay(pacer, 60)).toBe(0);
    });

    it('is the time until the next tick when none is owed', () => {
        const pacer = createPacer();
        ticksDue(pacer, 0, 60);
        ticksDue(pacer, 25, 60);
        expect(pacer.owed).toBeCloseTo(0.5, 9);
        expect(nextDelay(pacer, 60)).toBeCloseTo(1000 / 120, 6);
        expect(nextDelay(pacer, 120)).toBeCloseTo(1000 / 240, 6);
    });
});

describe('snapshotDue', () => {
    it('is true before any snapshot and then only after the gap', () => {
        const pacer = createPacer();
        expect(snapshotDue(pacer, 0)).toBe(true);
        markSnapshot(pacer, 100);
        expect(snapshotDue(pacer, 100 + SNAPSHOT_GAP_MS - 0.1)).toBe(false);
        expect(snapshotDue(pacer, 100 + SNAPSHOT_GAP_MS)).toBe(true);
    });

    it('uses an 8 ms gap by default', () => {
        expect(SNAPSHOT_GAP_MS).toBe(8);
        expect(createPacer({ snapshotGapMs: 20 }).snapshotGapMs).toBe(20);
    });
});
