import { describe, expect, it } from 'vitest';
import { createPointGrid, fillPointGrid, MAX_CELLS, nearCells } from '../../js/app/pursuit-grid.js';

/**
 * @param {number[][]} points [x, y] pairs; ids are their indices
 * @returns {{at: {x: Float32Array, y: Float32Array}, points: {ids: Int32Array, n: number}}} the grid inputs
 */
function inputs(points) {
    return {
        at: { x: Float32Array.from(points.map((p) => p[0])), y: Float32Array.from(points.map((p) => p[1])) },
        points: { ids: Int32Array.from(points.map((_, k) => k)), n: points.length },
    };
}

/**
 * @param {import('../../js/app/pursuit-grid.js').PointGrid} grid a filled grid
 * @param {number} x a position
 * @param {number} y a position
 * @returns {number[]} the ids in the 3 x 3 cells around it
 */
function near(grid, x, y) {
    const r = nearCells(grid, x, y, { x0: 0, x1: 0, y0: 0, y1: 0 });
    const ids = [];
    for (let cy = r.y0; cy <= r.y1; cy++) {
        for (let cx = r.x0; cx <= r.x1; cx++) {
            const c = cy * grid.cols + cx;
            for (let s = grid.start[c]; s < grid.start[c + 1]; s++) {
                ids.push(grid.items[s]);
            }
        }
    }
    return ids;
}

describe('fillPointGrid', () => {
    it('sorts the ids by cell and keeps their order within a cell', () => {
        const { at, points } = inputs([
            [5, 5],
            [150, 5],
            [6, 6],
            [150, 150],
            [7, 7],
        ]);
        const grid = fillPointGrid(createPointGrid(), at, points, 100);
        expect([grid.cols, grid.rows]).toEqual([2, 2]);
        expect(Array.from(grid.items.slice(0, 5))).toEqual([0, 2, 4, 1, 3]);
        expect(Array.from(grid.start.slice(0, 5))).toEqual([0, 3, 4, 4, 5]);
    });

    it('finds every point within one cell size of a position on random clouds', () => {
        let s = 99;
        const rand = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
        const grid = createPointGrid();
        for (let trial = 0; trial < 10; trial++) {
            const pts = Array.from({ length: 300 }, () => [rand() * 3000 - 500, rand() * 2000]);
            const { at, points } = inputs(pts);
            fillPointGrid(grid, at, points, 450);
            for (let q = 0; q < 30; q++) {
                const x = rand() * 4000 - 1000;
                const y = rand() * 3000 - 500;
                const found = new Set(near(grid, x, y));
                pts.forEach(([px, py], k) => {
                    if (Math.hypot(px - x, py - y) <= 450) {
                        expect(found.has(k), `point ${k} near ${x}, ${y}`).toBe(true);
                    }
                });
            }
        }
    });

    it('widens its cells to stay under MAX_CELLS and empties for no points', () => {
        const { at, points } = inputs([
            [0, 0],
            [1e6, 1e6],
        ]);
        const grid = fillPointGrid(createPointGrid(), at, points, 10);
        expect(grid.cols * grid.rows).toBeLessThanOrEqual(MAX_CELLS);
        expect(grid.cell).toBeGreaterThan(10);
        fillPointGrid(grid, at, { ids: points.ids, n: 0 }, 10);
        expect(grid.cols).toBe(0);
        expect(near(grid, 0, 0)).toEqual([]);
    });
});
