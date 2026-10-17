import { describe, expect, it } from 'vitest';
import {
    accumulateTerritory,
    assignLineages,
    createTerritory,
    FADE_EVERY,
    FADE_FACTOR,
    MAX_ALPHA,
    TERRITORY_LINEAGES,
    territoryPixels,
    WEIGHT_PER_ALPHA,
} from '../../js/app/territory.js';
import { makeSnapshot } from './helpers/snapshots.js';

/** @param {number[]} ids @returns {{ids: Uint32Array, count: number}} a top list */
const top = (ids) => ({ ids: Uint32Array.from(ids), count: ids.length });

/** @returns {ReturnType<typeof createTerritory>} a 4 x 2 grid over a 400 x 200 world */
function grid() {
    return createTerritory({ worldWidth: 400, worldHeight: 200, cols: 4 });
}

describe('createTerritory', () => {
    it('takes its rows from the world aspect: 128 x 72 on 16:9', () => {
        const t = createTerritory({ worldWidth: 7680, worldHeight: 4320 });
        expect([t.cols, t.rows]).toEqual([128, 72]);
        expect(t.weights).toHaveLength(TERRITORY_LINEAGES * 128 * 72);
        expect(grid().rows).toBe(2);
    });
});

describe('assignLineages', () => {
    it('keeps a lineage on its plane and zeroes a plane given to a new lineage', () => {
        const t = grid();
        assignLineages(t, top([5, 6]));
        expect(Array.from(t.slots.slice(0, 3))).toEqual([5, 6, -1]);
        t.weights.fill(3);
        assignLineages(t, top([6, 7]));
        expect(t.slots.indexOf(6)).toBe(1);
        const at = t.slots.indexOf(7);
        expect(at).toBe(0);
        expect(t.weights[at * 8]).toBe(0);
        expect(t.weights[1 * 8]).toBe(3);
        expect(t.slots.indexOf(5)).toBe(-1);
    });

    it('tracks at most eight lineages', () => {
        const t = grid();
        assignLineages(t, top([1, 2, 3, 4, 5, 6, 7, 8]));
        assignLineages(t, top([1, 2, 3, 4, 5, 6, 7, 8, 9]));
        expect(t.slots.indexOf(9)).toBe(-1);
        expect(new Set(t.slots).size).toBe(8);
    });
});

describe('accumulateTerritory', () => {
    it('adds one to the cell under each agent of a tracked lineage and ignores the others', () => {
        const t = grid();
        assignLineages(t, top([5]));
        const snap = makeSnapshot(1, [
            { slot: 0, genomeId: 1, lineageId: 5, x: 50, y: 50 },
            { slot: 1, genomeId: 2, lineageId: 5, x: 60, y: 60 },
            { slot: 2, genomeId: 3, lineageId: 9, x: 50, y: 50 },
            { slot: 3, genomeId: 4, lineageId: 5, x: 399, y: 199 },
        ]);
        accumulateTerritory(t, snap);
        expect(t.weights[0]).toBe(2);
        expect(t.weights[7]).toBe(1);
        expect(t.weights.reduce((a, b) => a + b, 0)).toBe(3);
    });

    it('clamps an agent just outside the world into the edge cell', () => {
        const t = grid();
        assignLineages(t, top([5]));
        accumulateTerritory(t, makeSnapshot(1, [{ slot: 0, genomeId: 1, lineageId: 5, x: -5, y: 900 }]));
        expect(t.weights[4]).toBe(1);
    });

    it('fades every weight by 0.97 on every 16th snapshot', () => {
        const t = grid();
        assignLineages(t, top([5]));
        const snap = makeSnapshot(1, [{ slot: 0, genomeId: 1, lineageId: 5, x: 50, y: 50 }]);
        for (let i = 0; i < FADE_EVERY; i++) {
            accumulateTerritory(t, snap);
        }
        expect(t.weights[0]).toBeCloseTo(FADE_EVERY * FADE_FACTOR);
    });
});

describe('territoryPixels', () => {
    it('colours each cell by the heaviest lineage with alpha growing to the cap, and leaves empty cells clear', () => {
        const t = grid();
        assignLineages(t, top([5, 6]));
        t.weights[0] = 3;
        t.weights[8 + 0] = 6;
        t.weights[1] = 100;
        const out = new Uint8Array(4 * 2 * 4);
        territoryPixels(t, out);
        expect(out[3]).toBe(Math.round((6 / WEIGHT_PER_ALPHA) * 255));
        expect(Array.from(out.slice(0, 3))).not.toEqual(Array.from(out.slice(4, 7)));
        expect(out[7]).toBe(Math.round(MAX_ALPHA * 255));
        expect(out[11]).toBe(0);
    });
});
