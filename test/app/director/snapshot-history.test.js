import { describe, expect, it } from 'vitest';
import {
    DECISION_INTERVAL_S,
    MAX_SNAPSHOT_HISTORY,
    SNAPSHOT_LOOKBACK_S,
    updateSnapshotHistory,
} from '../../../js/app/director/snapshot-history.js';

const at = (/** @type {number} */ x) => [
    { genomeId: 1, lineageId: 1, spec: 0, x, y: 0, angle: 0, size: 1, speed: 0, flags: 0 },
];

describe('updateSnapshotHistory', () => {
    it('returns the entry from about 1.5 s earlier, and nothing until there is one', () => {
        const history = /** @type {any[]} */ ([]);
        expect(updateSnapshotHistory(history, 0, at(0))).toEqual([]);
        for (let t = DECISION_INTERVAL_S; t <= 3; t += DECISION_INTERVAL_S) {
            const earlier = updateSnapshotHistory(history, t, at(t * 100));
            if (t >= SNAPSHOT_LOOKBACK_S) {
                expect(earlier[0].x).toBeCloseTo((t - SNAPSHOT_LOOKBACK_S) * 100);
            }
        }
    });

    it('keeps one entry per decision interval and no more than the bound', () => {
        const history = /** @type {any[]} */ ([]);
        for (let t = 0; t < 40; t += 0.1) {
            updateSnapshotHistory(history, t, at(t));
        }
        expect(history.length).toBe(MAX_SNAPSHOT_HISTORY);
        expect(history[1].timeS - history[0].timeS).toBeCloseTo(DECISION_INTERVAL_S);
    });

    it('starts again when time goes backwards, as after a new world', () => {
        const history = /** @type {any[]} */ ([]);
        updateSnapshotHistory(history, 100, at(1));
        updateSnapshotHistory(history, 2, at(2));
        expect(history.map((h) => h.timeS)).toEqual([2]);
    });
});
