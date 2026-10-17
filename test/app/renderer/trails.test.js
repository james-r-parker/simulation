import { describe, expect, it } from 'vitest';
import { createInterpolated, interpolateInto } from '../../../js/app/interpolate.js';
import {
    createTrails,
    recordTrails,
    TRAIL_AGENTS,
    TRAIL_POINTS,
    trackTrails,
    trailIndex,
} from '../../../js/app/renderer/trails.js';
import { makeSnapshot } from '../helpers/snapshots.js';

/**
 * @param {number} x where agent 7 is
 * @returns {ReturnType<typeof createInterpolated>} agents 7 and 8
 */
function at(x) {
    const out = createInterpolated(8);
    interpolateInto(
        null,
        makeSnapshot(1, [
            { slot: 0, genomeId: 7, x, y: 1 },
            { slot: 1, genomeId: 8, x: 0, y: 0 },
        ]),
        1,
        out,
    );
    return out;
}

describe('trails', () => {
    it('records a position per call and keeps the last 32 in order', () => {
        const t = createTrails();
        trackTrails(t, Uint32Array.from([7]), 1);
        for (let i = 0; i < 40; i++) {
            recordTrails(t, at(i));
        }
        const slot = t.ids.indexOf(7);
        expect(t.length[slot]).toBe(TRAIL_POINTS);
        expect(t.xs[trailIndex(t, slot, 0)]).toBe(8);
        expect(t.xs[trailIndex(t, slot, TRAIL_POINTS - 1)]).toBe(39);
    });

    it('keeps the trail of an agent that stays tracked and frees the rest', () => {
        const t = createTrails();
        trackTrails(t, Uint32Array.from([7, 8]), 2);
        recordTrails(t, at(5));
        recordTrails(t, at(6));
        trackTrails(t, Uint32Array.from([7]), 1);
        expect(t.length[t.ids.indexOf(7)]).toBe(2);
        expect(t.ids.includes(8)).toBe(false);
        trackTrails(t, Uint32Array.from([7, 9]), 2);
        expect(t.length[t.ids.indexOf(9)]).toBe(0);
    });

    it('releases a tracked agent that has died', () => {
        const t = createTrails();
        trackTrails(t, Uint32Array.from([99]), 1);
        recordTrails(t, at(1));
        expect(t.ids.includes(99)).toBe(false);
    });

    it('tracks at most 64 agents', () => {
        const t = createTrails();
        const many = Uint32Array.from({ length: 70 }, (_, i) => i + 1);
        trackTrails(t, many, 70);
        expect(t.ids.filter((v) => v !== 0)).toHaveLength(TRAIL_AGENTS);
    });
});
