// Lets calm herd animals remove nearby plant items and assimilate a share into their world-held stores.

import { FOOD_KIND } from './carcass.js';
import { eatFromPatch } from './food-patches.js';
import { FOOD_GONE, removeFood } from './world.js';
import { loadHerdSeed } from './herd-dung.js';

/** @typedef {import('./world.js').World} World */

/** Per group, the ascending plant slots near it (`maxFood` slots a group), reused across ticks; grown on demand. */
let candidates = new Int32Array(0);
/** Per group, how many slots of its `candidates` row are filled. */
let counts = new Int32Array(0);
/** Per group, `[minX, minY, maxX, maxY]` of its animals ready to graze. */
let boxes = new Float64Array(0);

/** Cells per side of the coarse grid that says which groups a plant could be near. */
const GRID = 32;
/** Per grid cell, a bit per group (`herdCount` is at most 8) whose padded box of ready animals touches the cell. */
const cellGroups = new Uint8Array(GRID * GRID);

/** @param {World} world @returns {void} */
function sizeScratch(world) {
    const groups = world.config.herdCount;
    if (!(groups > 0)) {
        return;
    }
    if (candidates.length < groups * world.foodAlive.length || counts.length !== groups) {
        candidates = new Int32Array(groups * world.foodAlive.length);
        counts = new Int32Array(groups);
        boxes = new Float64Array(groups * 4);
    }
}

/** @param {number} value a coordinate over the cell size @returns {number} its clamped cell index */
function cellOf(value) {
    const cell = Math.floor(value);
    return cell < 0 ? 0 : cell > GRID - 1 ? GRID - 1 : cell;
}

/**
 * Sets a group's bit in every cell its box could reach, padded by twice the animal radius (the animal's reach plus a
 * plant radius up to it) and one cell more for rounding. A wider plant skips the grid (`collectPlants`).
 * @param {World} world the world
 * @param {number} group the group, with its box in `boxes`
 * @returns {void}
 */
function markCells(world, group) {
    const { worldWidth, worldHeight, herdRadius } = world.config;
    const pad = 2 * herdRadius;
    const b = group * 4;
    const x0 = cellOf(((boxes[b] - pad) * GRID) / worldWidth - 1);
    const x1 = cellOf(((boxes[b + 2] + pad) * GRID) / worldWidth + 1);
    const y0 = cellOf(((boxes[b + 1] - pad) * GRID) / worldHeight - 1);
    const y1 = cellOf(((boxes[b + 3] + pad) * GRID) / worldHeight + 1);
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            cellGroups[y * GRID + x] |= 1 << group;
        }
    }
}

/**
 * Finds each calm group's ready animals and box, and marks the grid.
 * @param {World} world the world
 * @returns {number} a bit per group with an animal ready to graze
 */
function markGroups(world) {
    let ready = 0;
    cellGroups.fill(0);
    for (let group = 0; group < world.config.herdCount; group++) {
        counts[group] = 0;
        if (world.groupAlarm[group] > 0 || readyBox(world, group) === 0) {
            continue;
        }
        boxes.set(boxScratch, group * 4);
        ready |= 1 << group;
        markCells(world, group);
    }
    return ready;
}

/**
 * Appends one live plant to the row of every group in `groups` whose ready animals it could overlap: the exact box
 * test the per-group scan made.
 * @param {World} world the world
 * @param {number} food the live plant slot
 * @param {number} groups a bit per group to test
 * @returns {void}
 */
function offerPlant(world, food, groups) {
    const stride = world.foodAlive.length;
    const slack = world.config.herdRadius + world.foodRadius[food];
    const x = world.foodX[food];
    const y = world.foodY[food];
    for (let group = 0, b = 0; group < counts.length; group++, b += 4) {
        if (
            (groups >> group) & 1 &&
            x >= boxes[b] - slack &&
            x <= boxes[b + 2] + slack &&
            y >= boxes[b + 1] - slack &&
            y <= boxes[b + 3] + slack
        ) {
            candidates[group * stride + counts[group]++] = food;
        }
    }
}

/**
 * Collects, in ascending slot order, the live plant items that could overlap an animal of each calm group. One pass
 * over the food slots serves every group, and the cell mask keeps a plant from being tested against a group far
 * from it. An item eaten by an earlier group stays listed and `nearestPlant` skips it.
 * @param {World} world the world
 * @returns {void}
 */
function collectPlants(world) {
    const { foodAlive, foodKind, foodX, foodY, foodRadius } = world;
    const { herdRadius, worldWidth, worldHeight } = world.config;
    const ready = markGroups(world);
    const perX = GRID / worldWidth;
    const perY = GRID / worldHeight;
    for (let food = 0; ready !== 0 && food < foodAlive.length; food++) {
        if (foodAlive[food] !== 1 || foodKind[food] !== FOOD_KIND.PLANT) {
            continue;
        }
        // Truncation and the clamp only pick the cell; `markCells` pads a cell each way, and `offerPlant` is exact.
        const cx = Math.min(GRID - 1, (foodX[food] * perX) | 0);
        const cy = Math.min(GRID - 1, (foodY[food] * perY) | 0);
        const wide = foodRadius[food] > herdRadius || cx < 0 || cy < 0;
        const near = wide ? ready : cellGroups[cy * GRID + cx];
        if (near !== 0) {
            offerPlant(world, food, near);
        }
    }
}

/** @param {World} world @param {number} animal @param {number} row the group's first slot in `candidates` @param {number} count its filled slots @returns {number} nearest overlapping plant slot, or -1 */
function nearestPlant(world, animal, row, count) {
    let best = -1;
    let bestDistance = Infinity;
    const reach = world.config.herdRadius;
    for (let i = row; i < row + count; i++) {
        const food = candidates[i];
        if (world.foodAlive[food] !== 1) {
            continue;
        }
        const dx = world.foodX[food] - world.herdX[animal];
        const dy = world.foodY[food] - world.herdY[animal];
        const sumRadius = reach + world.foodRadius[food];
        const distance = dx * dx + dy * dy;
        if (distance <= sumRadius * sumRadius && distance < bestDistance) {
            best = food;
            bestDistance = distance;
        }
    }
    return best;
}

/** @param {World} world @param {number} animal @param {number} food @returns {void} */
function eatPlant(world, animal, food) {
    const { foodValue } = world;
    const value = foodValue[food];
    loadHerdSeed(world, animal, food);
    eatFromPatch(world, food);
    removeFood(world, food, FOOD_GONE.EATEN, value);
    world.herdStore[animal] = Math.min(
        world.config.herdStoreMax,
        world.herdStore[animal] + world.config.herdAssimilation * value,
    );
    world.herdGraze[animal] = world.config.herdGrazeTicks;
    world.herdTotals[0] += value;
}

const boxScratch = new Float64Array(4);

/**
 * Counts the animals ready to graze, and writes their bounding box to
 * `boxScratch`.
 * @param {World} world the world
 * @param {number} group the group
 * @returns {number} the ready count
 */
function readyBox(world, group) {
    const { herdSize } = world.config;
    let ready = 0;
    boxScratch[0] = boxScratch[1] = Infinity;
    boxScratch[2] = boxScratch[3] = -Infinity;
    for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
        if (world.herdAlive[animal] !== 1 || world.herdGraze[animal] > 0) {
            continue;
        }
        ready++;
        boxScratch[0] = Math.min(boxScratch[0], world.herdX[animal]);
        boxScratch[1] = Math.min(boxScratch[1], world.herdY[animal]);
        boxScratch[2] = Math.max(boxScratch[2], world.herdX[animal]);
        boxScratch[3] = Math.max(boxScratch[3], world.herdY[animal]);
    }
    return ready;
}

/** Grazes one tick for each eligible animal. @param {World} world @returns {void} */
export function grazeHerds(world) {
    const { herdSize } = world.config;
    sizeScratch(world);
    collectPlants(world);
    for (let group = 0; group < world.config.herdCount; group++) {
        if (world.groupAlarm[group] > 0) {
            world.groupAlarm[group]--;
            continue;
        }
        const row = group * world.foodAlive.length;
        const count = counts[group];
        for (let animal = group * herdSize; animal < (group + 1) * herdSize; animal++) {
            if (world.herdAlive[animal] !== 1) {
                continue;
            }
            if (world.herdGraze[animal] > 0) {
                world.herdGraze[animal]--;
                continue;
            }
            const food = nearestPlant(world, animal, row, count);
            if (food >= 0) {
                eatPlant(world, animal, food);
            }
        }
    }
}
