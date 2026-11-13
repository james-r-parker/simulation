// A food cell index for the observer's contact scans (eat-choice.md, Phase 5, T20). Once per sample `buildFoodCellIndex`
// sorts the alive food into a uniform grid by counting sort; `touchesPlant` then reads only the cells a body's circle
// can reach, so a scan over the agents is near O(agents) instead of O(agents x food). The arrays are made once with the
// scene (`config.worldWidth`, `worldHeight`, `maxFood`); building and querying allocate nothing. The index reads the
// world and writes only itself, so no hash can move. Positions outside the grid clamp to its edge cells on both sides of
// a query, so the answer equals the naive scan whatever the positions.

import { FOOD_KIND } from '../sim/carcass.js';

/** Cell edge length in world units: a few agent sizes, so a body's circle reaches about four cells. */
const CELL_SIZE = 120;

/**
 * @param {Readonly<Record<string, any>>} config the world's config (`worldWidth`, `worldHeight`, `maxFood`)
 * @returns {Record<string, any>} an empty index: the cell offsets, the food ids grouped by cell, and the build's food
 *   count and largest food radius
 */
export function createFoodCellIndex(config) {
    const cols = Math.max(1, Math.ceil(config.worldWidth / CELL_SIZE));
    const rows = Math.max(1, Math.ceil(config.worldHeight / CELL_SIZE));
    return {
        cols,
        rows,
        cellStart: new Int32Array(cols * rows + 1),
        cursor: new Int32Array(cols * rows),
        entries: new Int32Array(config.maxFood),
        count: 0,
        maxRadius: 0,
    };
}

/**
 * @param {Record<string, any>} index the index
 * @param {number} x a world x
 * @param {number} y a world y
 * @returns {number} the cell it falls in, clamped to the grid
 */
function cellAt(index, x, y) {
    const col = Math.min(index.cols - 1, Math.max(0, Math.floor(x / CELL_SIZE)));
    const row = Math.min(index.rows - 1, Math.max(0, Math.floor(y / CELL_SIZE)));
    return row * index.cols + col;
}

/**
 * Rebuilds the index from the world's alive food (two passes: count per cell, then place).
 * @param {Record<string, any>} index the index
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function buildFoodCellIndex(index, world) {
    const { cellStart, cursor, entries } = index;
    const cells = index.cols * index.rows;
    cellStart.fill(0);
    index.maxRadius = 0;
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (world.foodAlive[food] === 1) {
            cellStart[cellAt(index, world.foodX[food], world.foodY[food]) + 1] += 1;
            index.maxRadius = Math.max(index.maxRadius, world.foodRadius[food]);
        }
    }
    for (let cell = 0; cell < cells; cell++) {
        cellStart[cell + 1] += cellStart[cell];
    }
    index.count = cellStart[cells];
    cursor.set(cellStart.subarray(0, cells));
    for (let food = 0; food < world.foodAlive.length; food++) {
        if (world.foodAlive[food] === 1) {
            entries[cursor[cellAt(index, world.foodX[food], world.foodY[food])]++] = food;
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @param {number} food an alive food item
 * @returns {boolean} whether the item is plant food and its circle overlaps the agent's (the test of `tryEat`)
 */
function touchesPlantItem(world, slot, food) {
    if (world.foodKind[food] === FOOD_KIND.MEAT) {
        return false;
    }
    const dx = world.foodX[food] - world.x[slot];
    const dy = world.foodY[food] - world.y[slot];
    return Math.sqrt(dx * dx + dy * dy) < world.size[slot] + world.foodRadius[food];
}

/**
 * @param {Record<string, any>} index the index
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @param {number} cell one cell
 * @returns {boolean} whether the agent touches a plant item of the cell
 */
function touchesInCell(index, world, slot, cell) {
    for (let e = index.cellStart[cell]; e < index.cellStart[cell + 1]; e++) {
        if (touchesPlantItem(world, slot, index.entries[e])) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Record<string, any>} index an index built from this world's food this tick
 * @param {Record<string, any>} world the world
 * @param {number} slot an alive agent
 * @returns {boolean} whether the agent's circle overlaps an alive plant food item, whatever its specialisation takes
 */
export function touchesPlant(index, world, slot) {
    const reach = world.size[slot] + index.maxRadius;
    const x = world.x[slot];
    const y = world.y[slot];
    const first = cellAt(index, x - reach, y - reach);
    const last = cellAt(index, x + reach, y + reach);
    const row1 = Math.floor(last / index.cols);
    for (let row = Math.floor(first / index.cols); row <= row1; row++) {
        for (let col = first % index.cols; col <= last % index.cols; col++) {
            if (touchesInCell(index, world, slot, row * index.cols + col)) {
                return true;
            }
        }
    }
    return false;
}
