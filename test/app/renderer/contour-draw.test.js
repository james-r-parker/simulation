import { describe, expect, it } from 'vitest';
import {
    contourLevels,
    createScentContours,
    createTerritoryContours,
    packScent,
} from '../../../js/app/renderer/contour-draw.js';
import { createFamilySlots } from '../../../js/app/family-slots.js';
import { makeSnapshot } from '../helpers/snapshots.js';

describe('contourLevels', () => {
    it('spaces the lines evenly inside 0 to 1', () => {
        expect(Array.from(contourLevels(4))).toEqual([0.2, 0.4, 0.6, 0.8].map((v) => Math.fround(v)));
    });
});

describe('packScent', () => {
    it('saturates each grid into a byte channel and leaves empty cells at 0', () => {
        const grid = { cols: 2, rows: 1, pheromoneMax: 10 };
        const out = packScent(new Float32Array([0, 10, 0, 0, 100, 0]), grid, new Uint8Array(8));
        expect(out[0]).toBe(0);
        expect(out[4]).toBe(Math.round(255 * (1 - Math.exp(-1.6))));
        expect(out[2]).toBe(Math.round(255 * (1 - Math.exp(-16))));
        expect(out[3]).toBe(255);
    });
});

describe('the contour lenses', () => {
    it('show only while their lens is on', () => {
        const info = { cols: 2, rows: 2, pheromoneMax: 1, worldWidth: 100, worldHeight: 100 };
        const scent = createScentContours({ info });
        scent.pushField(new Float32Array(12), 0);
        scent.update?.(/** @type {any} */ ({ lenses: { scent: true } }));
        expect(scent.object.visible).toBe(true);
        scent.update?.(/** @type {any} */ ({ lenses: { scent: false } }));
        expect(scent.object.visible).toBe(false);
        const territory = createTerritoryContours({ info });
        const frame = {
            lenses: { territory: true },
            family: createFamilySlots(),
            snapshot: makeSnapshot(1, []),
            nowMs: 1000,
        };
        territory.update?.(/** @type {any} */ (frame));
        expect(territory.object.visible).toBe(true);
        scent.dispose();
        territory.dispose();
    });
});

describe('the territory lens refresh', () => {
    it('skips the work while hidden, without a new snapshot or before the refresh is due', () => {
        const info = { worldWidth: 100, worldHeight: 100 };
        const layer = createTerritoryContours({ info });
        const family = createFamilySlots();
        const snapshot = makeSnapshot(1, []);
        layer.update?.(/** @type {any} */ ({ lenses: { territory: false }, family, snapshot, nowMs: 0 }));
        expect(layer.object.visible).toBe(false);
        layer.update?.(/** @type {any} */ ({ lenses: { territory: true }, family, snapshot, nowMs: 1000 }));
        layer.update?.(/** @type {any} */ ({ lenses: { territory: true }, family, snapshot, nowMs: 1001 }));
        layer.update?.(/** @type {any} */ ({ lenses: { territory: true }, family, snapshot: null, nowMs: 2000 }));
        expect(layer.object.visible).toBe(true);
        layer.dispose();
    });
});
