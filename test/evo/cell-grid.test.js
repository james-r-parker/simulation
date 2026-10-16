import { describe, expect, it } from 'vitest';
import { clearCells, createCellGrid, markCell } from '../../js/evo/cell-grid.js';

describe('createCellGrid', () => {
    it('sizes the default world at 72 x 41 cells of 200 px and 48 x 27 of 300 px', () => {
        const config = { worldWidth: 14400, worldHeight: 8100 };
        expect(createCellGrid(config, 200, 1)).toMatchObject({ cellCols: 72, cellRows: 41, cellBytes: 369 });
        expect(createCellGrid(config, 300, 2)).toMatchObject({ cellCols: 48, cellRows: 27, cellBytes: 162 });
        expect(createCellGrid(config, 300, 2).cellBits).toHaveLength(324);
    });
});

describe('markCell', () => {
    const grid = createCellGrid({ worldWidth: 1000, worldHeight: 1000 }, 100, 2);

    it('is true only the first time a slot enters a cell, and slots are independent', () => {
        expect(markCell(grid, 0, 150, 250)).toBe(true);
        expect(markCell(grid, 0, 199, 299)).toBe(false);
        expect(markCell(grid, 1, 150, 250)).toBe(true);
        expect(markCell(grid, 0, 250, 250)).toBe(true);
    });

    it('clamps points outside the world into the edge cells', () => {
        expect(markCell(grid, 0, -5, -5)).toBe(true);
        expect(markCell(grid, 0, 0, 0)).toBe(false);
        expect(markCell(grid, 0, 5000, 5000)).toBe(true);
        expect(markCell(grid, 0, 999, 999)).toBe(false);
    });

    it('starts again after clearCells, without touching other slots', () => {
        clearCells(grid, 0);
        expect(markCell(grid, 0, 150, 250)).toBe(true);
        expect(markCell(grid, 1, 150, 250)).toBe(false);
    });
});
