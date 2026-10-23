import { describe, expect, it } from 'vitest';
import {
    WINDOW_COUNT,
    WINDOW_FIELDS,
    createWindows,
    noteWindows,
    windowDelta,
    windowsComplete,
} from '../../js/evo/observer-windows.js';

/**
 * A stand-in observer whose counters the test sets directly.
 * @returns {{intent: {run: Record<string, number>}, combat: Record<string, number>}}
 */
function fake() {
    const observer = {
        intent: { run: /** @type {Record<string, number>} */ ({}) },
        combat: /** @type {Record<string, number>} */ ({}),
    };
    for (const [source, field] of WINDOW_FIELDS) {
        (source === 'run' ? observer.intent.run : observer.combat)[field] = 0;
    }
    return observer;
}

describe('createWindows', () => {
    it('cuts 10000 to the run end into 8 equal windows: 9 boundaries', () => {
        const w = createWindows(10800);
        expect(Array.from(w.boundaries)).toEqual([10000, 10100, 10200, 10300, 10400, 10500, 10600, 10700, 10800]);
        expect(WINDOW_COUNT).toBe(8);
    });

    it('rounds an uneven boundary up to the next tick', () => {
        const w = createWindows(10010);
        expect(Array.from(w.boundaries)).toEqual([10000, 10002, 10003, 10004, 10005, 10007, 10008, 10009, 10010]);
    });

    it('has no boundaries when the run length is unknown (0) or within burn-in', () => {
        expect(createWindows(0).boundaries).toHaveLength(0);
        expect(createWindows(10000).boundaries).toHaveLength(0);
        expect(windowsComplete(createWindows(0))).toBe(false);
    });
});

describe('noteWindows', () => {
    it('snapshots the cumulative totals at each boundary, and a window is the difference of two snapshots', () => {
        const w = createWindows(10080);
        const observer = fake();
        for (let tick = 1; tick <= 10080; tick++) {
            observer.intent.run.foodDeliberate += 1;
            observer.combat.huntKills += tick >= 10040 ? 3 : 0;
            noteWindows(w, observer, tick);
        }
        expect(windowsComplete(w)).toBe(true);
        const food = WINDOW_FIELDS.findIndex(([, field]) => field === 'foodDeliberate');
        const kills = WINDOW_FIELDS.findIndex(([, field]) => field === 'huntKills');
        for (let k = 0; k < WINDOW_COUNT; k++) {
            expect(windowDelta(w, k, food)).toBe(10);
            expect(windowDelta(w, k, kills)).toBe(k < 3 ? 0 : k === 3 ? 3 : 30);
        }
    });

    it('reads a boundary at the first tick at or past it, once', () => {
        const w = createWindows(10080);
        const observer = fake();
        noteWindows(w, observer, 9999);
        expect(w.filled).toBe(0);
        noteWindows(w, observer, 10000);
        noteWindows(w, observer, 10000);
        expect(w.filled).toBe(1);
        noteWindows(w, observer, 10025);
        expect(w.filled).toBe(3);
    });

    it('is incomplete until the run end is reached', () => {
        const w = createWindows(10080);
        noteWindows(w, fake(), 10079);
        expect(windowsComplete(w)).toBe(false);
    });

    it('allocates nothing: the snapshot array is the one made at creation', () => {
        const w = createWindows(10080);
        const snapshots = w.snapshots;
        const observer = fake();
        for (let tick = 9990; tick <= 10080; tick++) {
            noteWindows(w, observer, tick);
        }
        expect(w.snapshots).toBe(snapshots);
        expect(w.snapshots).toHaveLength(9 * WINDOW_FIELDS.length);
    });
});
