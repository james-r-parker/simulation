import { describe, expect, it } from 'vitest';
import { createTerrainLayer, FROST_HEIGHT, FROST_WIDTH, frostTexture } from '../../../js/app/renderer/terrain-layer.js';
import { smallReady } from '../helpers/ready.js';

describe('frostTexture', () => {
    it('is deterministic per seed', () => {
        const t1 = frostTexture(123);
        const t2 = frostTexture(123);
        expect(Array.from(t1)).toEqual(Array.from(t2));
    });

    it('differs between seeds', () => {
        const t1 = frostTexture(123);
        const t2 = frostTexture(124);
        expect(Array.from(t1)).not.toEqual(Array.from(t2));
    });

    it('tiles horizontally (first and last columns differ by no more than neighbouring columns)', () => {
        const t = frostTexture(42);
        for (let y = 0; y < FROST_HEIGHT; y++) {
            const wrapDiff = Math.abs(t[y * FROST_WIDTH + 0] - t[y * FROST_WIDTH + (FROST_WIDTH - 1)]);
            let maxAdjInRow = 0;
            for (let x = 0; x < FROST_WIDTH - 1; x++) {
                const diff = Math.abs(t[y * FROST_WIDTH + x + 1] - t[y * FROST_WIDTH + x]);
                if (diff > maxAdjInRow) {
                    maxAdjInRow = diff;
                }
            }
            expect(wrapDiff).toBeLessThanOrEqual(maxAdjInRow);
        }
    });

    it('spans a useful dynamic range', () => {
        const t = frostTexture(42);
        let min = 255;
        let max = 0;
        for (let i = 0; i < t.length; i++) {
            if (t[i] < min) {
                min = t[i];
            }
            if (t[i] > max) {
                max = t[i];
            }
        }
        expect(max - min).toBeGreaterThan(100);
    });
});

describe('createTerrainLayer', () => {
    it('draws no frost and no refuge glow on an open layout, only the food patch glows', () => {
        const base = smallReady().info; // layout is 'open'
        const info = {
            ...base,
            patches: [
                { x: 100, y: 100, radius: 40 },
                { x: 500, y: 300, radius: 60 },
            ],
        };
        const layer = createTerrainLayer({ info });
        expect(layer.object.children).toHaveLength(1);
        expect(layer.object.children[0].count).toBe(2);
        layer.dispose();
    });

    it('creates frost and refuge meshes on basins layout and supports quality tiers', () => {
        const basinsInfo = {
            worldWidth: 6000,
            worldHeight: 4000,
            terrain: {
                layout: 'basins',
                coldMarginWidth: 600,
                wallX: 3000,
                rockFirst: 0,
                rockCount: 60,
                refuges: [
                    { x: 1000, y: 1500, radius: 250 },
                    { x: 5000, y: 2500, radius: 250 },
                ],
            },
        };
        const layer = createTerrainLayer({ info: basinsInfo, seed: 7 });
        expect(layer.object.visible).toBe(true);
        expect(layer.object.children.length).toBe(2);

        layer.setLook?.({ terrain: 0 });
        expect(layer.object.visible).toBe(true);

        layer.setLook?.({ terrain: 1 });
        expect(layer.object.visible).toBe(true);

        layer.setLook?.({ terrain: -1 });
        expect(layer.object.visible).toBe(false);

        layer.dispose();
    });
});
