import { describe, expect, it } from 'vitest';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import {
    claimFrameSlot,
    createFrameSlots,
    createRequest,
    frameSlotBytes,
    LENS,
    publishFrame,
    readRequest,
} from '../../../js/app/pack/frame-slots.js';
import { createPackFeed, exchangeFrame, isSeq, LATE_REPORT_MS, reportLate } from '../../../js/app/pack/pack-feed.js';

const INFO = { maxAgents: 4, specs: [{}] };

/** @returns {ReturnType<typeof createFrameSlots>} slots over a fresh shared buffer */
function slots() {
    return createFrameSlots(new SharedArrayBuffer(frameSlotBytes(INFO)), INFO);
}

/** @returns {Parameters<typeof exchangeFrame>[2]} one frame's inputs */
function inputs() {
    const family = createFamilySlots('cvd-safe');
    family.ids[1] = 12;
    return {
        client: { prev: { seq: 4 }, latest: { seq: 5 } },
        playhead: { alpha: 0.25, tick: 77.5 },
        nowMs: 2000,
        zoom: 3,
        lenses: { temperature: true, scent: false, territory: false, vision: true, calls: true },
        family,
    };
}

describe('exchangeFrame', () => {
    it('writes the request from the snapshots, playhead, camera, lenses and colour slots', () => {
        const feed = createPackFeed();
        const s = slots();
        expect(exchangeFrame(feed, s, inputs())).toBeNull();
        const out = createRequest();
        expect(readRequest(s, out)).toBe(1);
        expect(out).toMatchObject({
            prevSeq: 4,
            latestSeq: 5,
            alpha: 0.25,
            tick: 77.5,
            nowMs: 2000,
            zoom: 3,
            lens: LENS.TEMPERATURE | LENS.VISION | LENS.CALLS,
            palette: 1,
        });
        expect(out.family[1]).toBe(12);
        expect(feed.late).toBe(0);
    });

    it('sends prevSeq 0 when only one snapshot is held', () => {
        const feed = createPackFeed();
        const s = slots();
        exchangeFrame(feed, s, { ...inputs(), client: { prev: null, latest: { seq: 9 } } });
        const out = createRequest();
        readRequest(s, out);
        expect([out.prevSeq, out.latestSeq]).toEqual([0, 9]);
    });

    it('takes the newest published frame, and counts a frame late only when it is one it drew before', () => {
        const feed = createPackFeed();
        const s = slots();
        const k = claimFrameSlot(s);
        s.slots[k].agents.count = 2;
        publishFrame(s, k, 1);
        expect(exchangeFrame(feed, s, inputs())?.count).toBe(2);
        expect(feed.late).toBe(0);
        expect(exchangeFrame(feed, s, inputs())?.count).toBe(2);
        expect(exchangeFrame(feed, s, inputs())?.count).toBe(2);
        expect([feed.late, feed.lateTotal]).toEqual([2, 2]);
    });
});

describe('reportLate', () => {
    it('logs the late frames at most once per LATE_REPORT_MS, then starts counting again', () => {
        const feed = createPackFeed();
        const logs = /** @type {any[]} */ ([]);
        const log = (/** @type {string} */ level, /** @type {string} */ event, /** @type {any} */ f) =>
            logs.push({ level, event, ...f });
        reportLate(feed, { nowMs: 1000, seq: 3, log });
        expect(logs).toEqual([]);
        feed.late = 3;
        reportLate(feed, { nowMs: 1000, seq: 3, log });
        expect(logs).toEqual([{ level: 'warn', event: 'PackFrameLate', late: 3, seq: 3 }]);
        expect(feed.late).toBe(0);
        feed.late = 1;
        reportLate(feed, { nowMs: 1000 + LATE_REPORT_MS - 1, seq: 4, log });
        expect(logs).toHaveLength(1);
        reportLate(feed, { nowMs: 1000 + LATE_REPORT_MS, seq: 5, log });
        expect(logs.at(-1)).toMatchObject({ late: 1, seq: 5 });
    });
});

describe('isSeq', () => {
    it('is true only for a snapshot holding that sequence', () => {
        expect(isSeq({ seq: 4 }, 4)).toBe(true);
        expect(isSeq({ seq: 4 }, 5)).toBe(false);
        expect(isSeq(null, 0)).toBe(false);
    });
});
