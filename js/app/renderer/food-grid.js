// A uniform grid over one snapshot's food, so an eater's meal can be named (plant, meat, fungus or toxic cap, and its
// hue) by the nearest item in the snapshot before the meal. Rebuilt by a counting sort into preallocated arrays.

import { FOOD_STRIDE, readSections, createSections } from '../snapshot-view.js';

/** The grid's cell side, world units. */
export const FOOD_CELL = 128;
/** Food kinds `nearestFood` names. */
export const FOOD_KIND = Object.freeze({ PLANT: 0, MEAT: 1, FUNGUS: 2, TOXIC: 3 });
const FUNGUS_SPECIES = 4;
const TOXIC_SPECIES = 5;

/**
 * @typedef {object} FoodGrid
 * @property {number} cols
 * @property {number} rows
 * @property {Int32Array} cellStart `cols x rows + 1` offsets into `order`
 * @property {Int32Array} order item indices by cell
 * @property {Float32Array} x each item's position
 * @property {Float32Array} y
 * @property {Uint8Array} kind a `FOOD_KIND`
 * @property {Float32Array} hue the item's hue, -1 to 1
 * @property {Int32Array} cellOf each item's cell
 * @property {number} count items held
 * @property {number} tick the snapshot's tick, -1 when empty
 * @property {import('../snapshot-view.js').Sections} sections scratch
 */

/**
 * @param {{maxFood: number, worldWidth: number, worldHeight: number}} info `ready.info`
 * @returns {FoodGrid} an empty grid
 */
export function createFoodGrid({ maxFood, worldWidth, worldHeight }) {
    const cols = Math.max(1, Math.ceil(worldWidth / FOOD_CELL));
    const rows = Math.max(1, Math.ceil(worldHeight / FOOD_CELL));
    return {
        cols,
        rows,
        cellStart: new Int32Array(cols * rows + 1),
        order: new Int32Array(maxFood),
        x: new Float32Array(maxFood),
        y: new Float32Array(maxFood),
        kind: new Uint8Array(maxFood),
        hue: new Float32Array(maxFood),
        cellOf: new Int32Array(maxFood),
        count: 0,
        tick: -1,
        sections: createSections(),
    };
}

/**
 * @param {FoodGrid} g the grid
 * @param {number} x world x
 * @param {number} y world y
 * @returns {number} the cell holding the point, clamped to the grid
 */
function cellAt(g, x, y) {
    const cx = Math.min(g.cols - 1, Math.max(0, Math.floor(x / FOOD_CELL)));
    const cy = Math.min(g.rows - 1, Math.max(0, Math.floor(y / FOOD_CELL)));
    return cy * g.cols + cx;
}

/**
 * @param {number} radius the food record's radius (negative for meat)
 * @param {number} species its species
 * @returns {number} its `FOOD_KIND`
 */
function kindOf(radius, species) {
    if (radius < 0) {
        return FOOD_KIND.MEAT;
    }
    return species === FUNGUS_SPECIES
        ? FOOD_KIND.FUNGUS
        : species === TOXIC_SPECIES
          ? FOOD_KIND.TOXIC
          : FOOD_KIND.PLANT;
}

/**
 * Fills the grid from a snapshot's food section.
 * @param {FoodGrid} g the grid
 * @param {{tick: number, u32: Uint32Array, f32: Float32Array}} snapshot the snapshot
 * @returns {void}
 */
export function buildFoodGrid(g, snapshot) {
    const s = readSections(snapshot.u32, g.sections);
    const n = Math.min(s.foodCount, g.order.length);
    const f32 = snapshot.f32;
    g.cellStart.fill(0);
    for (let i = 0; i < n; i++) {
        const w = s.foodStart + i * FOOD_STRIDE;
        g.x[i] = f32[w];
        g.y[i] = f32[w + 1];
        g.kind[i] = kindOf(f32[w + 2], Math.round(f32[w + 4]));
        g.hue[i] = f32[w + 5];
        g.cellOf[i] = cellAt(g, g.x[i], g.y[i]);
        g.cellStart[g.cellOf[i]] += 1;
    }
    const cells = g.cellStart.length - 1;
    for (let c = 1; c < cells; c++) {
        g.cellStart[c] += g.cellStart[c - 1];
    }
    g.cellStart[cells] = n;
    for (let i = n - 1; i >= 0; i--) {
        const c = g.cellOf[i];
        g.cellStart[c] -= 1;
        g.order[g.cellStart[c]] = i;
    }
    g.count = n;
    g.tick = snapshot.tick;
}

/**
 * @param {FoodGrid} g the grid
 * @param {{x: number, y: number, best: number, bestD2: number}} q the query point and the best so far
 * @param {number} cell a cell index
 * @returns {void}
 */
function scanCell(g, q, cell) {
    for (let k = g.cellStart[cell]; k < g.cellStart[cell + 1]; k++) {
        const i = g.order[k];
        const d2 = (g.x[i] - q.x) ** 2 + (g.y[i] - q.y) ** 2;
        if (d2 < q.bestD2) {
            q.bestD2 = d2;
            q.best = i;
        }
    }
}

const QUERY = { x: 0, y: 0, best: -1, bestD2: 0 };

/**
 * @param {FoodGrid} g the grid
 * @param {number} x world x
 * @param {number} y world y
 * @param {number} maxDistance the farthest an item may be, world units
 * @returns {number} the nearest item's index within `maxDistance`, -1 when none
 */
export function nearestFood(g, x, y, maxDistance) {
    QUERY.x = x;
    QUERY.y = y;
    QUERY.best = -1;
    QUERY.bestD2 = maxDistance * maxDistance;
    const reach = Math.ceil(maxDistance / FOOD_CELL);
    const cx = Math.floor(x / FOOD_CELL);
    const cy = Math.floor(y / FOOD_CELL);
    for (let gy = Math.max(0, cy - reach); gy <= Math.min(g.rows - 1, cy + reach); gy++) {
        for (let gx = Math.max(0, cx - reach); gx <= Math.min(g.cols - 1, cx + reach); gx++) {
            scanCell(g, QUERY, gy * g.cols + gx);
        }
    }
    return QUERY.best;
}
