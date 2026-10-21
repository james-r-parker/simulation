import { describe, expect, it } from 'vitest';
import {
    accumulateTerritory,
    createTerritory,
    FADE_EVERY,
    FADE_FACTOR,
    MAX_ALPHA,
    TERRITORY_LINEAGES,
    syncSlots,
    territoryPixels,
    WEIGHT_PER_ALPHA,
} from '../../js/app/territory.js';
import { assignSlots, createFamilySlots } from '../../js/app/family-slots.js';
import { makeSnapshot } from './helpers/snapshots.js';

/**
 * @param {ReturnType<typeof createTerritory>} t the grid
 * @param {ReturnType<typeof createFamilySlots>} slots the family slots
 * @param {number[]} ids the families by rank
 * @returns {void} gives the families their slots and syncs the grid to them
 */
function follow(t, slots, ids) {
    assignSlots(
        slots,
        ids.map((id) => ({ id })),
    );
    syncSlots(t, slots);
}

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

describe('syncSlots', () => {
    it('puts each family on its colour slot and empties a plane whose slot changed hands', () => {
        const t = grid();
        const slots = createFamilySlots();
        follow(t, slots, [5, 6]);
        expect(Array.from(t.slots.slice(0, 3))).toEqual([5, 6, -1]);
        t.weights.fill(3);
        follow(t, slots, [6, 7]);
        expect(Array.from(t.slots.slice(0, 3))).toEqual([7, 6, -1]);
        expect(t.weights[0]).toBe(0);
        expect(t.weights[8]).toBe(3);
    });

    it('leaves the weights alone when nothing changed', () => {
        const t = grid();
        const slots = createFamilySlots();
        follow(t, slots, [5]);
        t.weights.fill(2);
        syncSlots(t, slots);
        expect(t.weights[0]).toBe(2);
    });
});

describe('accumulateTerritory', () => {
    it('adds one to the cell under each agent of a tracked family and ignores the others', () => {
        const t = grid();
        follow(t, createFamilySlots(), [5]);
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
        follow(t, createFamilySlots(), [5]);
        accumulateTerritory(t, makeSnapshot(1, [{ slot: 0, genomeId: 1, lineageId: 5, x: -5, y: 900 }]));
        expect(t.weights[4]).toBe(1);
    });

    it('fades every weight by 0.97 on every 16th snapshot', () => {
        const t = grid();
        follow(t, createFamilySlots(), [5]);
        const snap = makeSnapshot(1, [{ slot: 0, genomeId: 1, lineageId: 5, x: 50, y: 50 }]);
        for (let i = 0; i < FADE_EVERY; i++) {
            accumulateTerritory(t, snap);
        }
        expect(t.weights[0]).toBeCloseTo(FADE_EVERY * FADE_FACTOR);
    });
});

describe('territoryPixels', () => {
    it('colours each cell by the heaviest family with alpha growing to the cap, and leaves empty cells clear', () => {
        const t = grid();
        follow(t, createFamilySlots(), [5, 6]);
        t.weights[0] = 3;
        t.weights[8 + 0] = 6;
        t.weights[1] = 100;
        const out = new Uint8Array(4 * 2 * 4);
        territoryPixels(t, { out, palette: 'default' });
        expect(out[3]).toBe(Math.round((6 / WEIGHT_PER_ALPHA) * 255));
        expect(Array.from(out.slice(0, 3))).not.toEqual(Array.from(out.slice(4, 7)));
        expect(out[7]).toBe(Math.round(MAX_ALPHA * 255));
        expect(out[11]).toBe(0);
    });

    it('uses the palette asked for', () => {
        const t = grid();
        follow(t, createFamilySlots(), [5]);
        t.weights[0] = 12;
        const a = new Uint8Array(32);
        const b = new Uint8Array(32);
        territoryPixels(t, { out: a, palette: 'default' });
        territoryPixels(t, { out: b, palette: 'cvd-safe' });
        expect(Array.from(a.slice(0, 3))).not.toEqual(Array.from(b.slice(0, 3)));
    });
});
