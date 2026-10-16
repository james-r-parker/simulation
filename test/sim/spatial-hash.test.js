import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { buildHash, cellOf, cellRange, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocateWorld } from '../../js/sim/world.js';

const SMALL = {
    maxAgents: 64,
    initialAgents: 0,
    minAgents: 0,
    rayCount: 4,
    brainHidden: 3,
    maxFood: 64,
    initialFood: 0,
    obstacleCount: 2,
    fertileZoneMax: 3,
    worldWidth: 1000,
    worldHeight: 1000,
};
const MAX_SIZE = 125;
const CELL = 128;

/** @returns {{ config: any, world: any, hash: any }} */
function setup() {
    const config = createConfig(SMALL);
    const world = allocateWorld(config);
    return { config, world, hash: createSpatialHash(config) };
}

/**
 * Fills a world with seeded circles, some pinned to the edges.
 * @param {any} world
 * @param {number} seed
 * @returns {{ id: number, x: number, y: number, r: number }[]} the circles by id
 */
function populate(world, seed) {
    const rng = createRng(seed);
    const { maxAgents } = world.config;
    const circles = [];
    const place = (/** @type {number} */ extent) => {
        const edge = nextFloat(rng);
        if (edge < 0.1) {
            return 0;
        }
        if (edge < 0.2) {
            return extent;
        }
        return nextFloat(rng) * extent;
    };
    const agents = Math.floor(nextFloat(rng) * 61);
    for (let i = 0; i < agents; i++) {
        world.alive[i] = 1;
        world.x[i] = place(world.config.worldWidth);
        world.y[i] = place(world.config.worldHeight);
        world.size[i] = 1 + nextFloat(rng) * (MAX_SIZE - 1);
        circles.push({ id: i, x: world.x[i], y: world.y[i], r: world.size[i] });
    }
    const food = Math.floor(nextFloat(rng) * 61);
    for (let i = 0; i < food; i++) {
        world.foodAlive[i] = 1;
        world.foodX[i] = place(world.config.worldWidth);
        world.foodY[i] = place(world.config.worldHeight);
        world.foodRadius[i] = nextFloat(rng) < 0.5 ? 20 : 30;
        circles.push({ id: maxAgents + i, x: world.foodX[i], y: world.foodY[i], r: world.foodRadius[i] });
    }
    return circles;
}

/**
 * @param {any} hash
 * @returns {Map<number, number[]>} entry ids per cell, in stored order
 */
function cellContents(hash) {
    const cells = new Map();
    for (let c = 0; c < hash.cols * hash.rows; c++) {
        cells.set(c, Array.from(hash.entries.subarray(hash.cellStart[c], hash.cellStart[c + 1])));
    }
    return cells;
}

/**
 * @param {any} hash
 * @param {{ x: number, y: number, r: number }} circle
 * @returns {number[]} cells in the circle's range
 */
function cellsOf(hash, circle) {
    const [c0, r0, c1, r1] = cellRange(hash, circle.x, circle.y, circle.r);
    const cells = [];
    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
            cells.push(row * hash.cols + col);
        }
    }
    return cells;
}

/**
 * @param {{ x: number, y: number, r: number }} a
 * @param {{ x: number, y: number, r: number }} b
 * @returns {boolean} whether the bounding boxes overlap
 */
function boxesOverlap(a, b) {
    return Math.abs(a.x - b.x) <= a.r + b.r && Math.abs(a.y - b.y) <= a.r + b.r;
}

describe('createSpatialHash', () => {
    it('sizes the grid and buffers from the config', () => {
        const { hash } = setup();
        expect(hash.cols).toBe(Math.ceil(1000 / CELL));
        expect(hash.rows).toBe(Math.ceil(1000 / CELL));
        expect(hash.cellStart.length).toBe(hash.cols * hash.rows + 1);
        expect(hash.entries.length).toBe(9 * 128);
        expect(hash.boxX.length).toBe(hash.entries.length);
        expect(hash.range.length).toBe(4);
    });
});

describe('cellRange', () => {
    it('clamps a circle past every edge to the grid', () => {
        const { hash } = setup();
        expect(Array.from(cellRange(hash, 0, 0, 50))).toEqual([0, 0, 0, 0]);
        const far = cellRange(hash, 1000, 1000, 50);
        expect(Array.from(far)).toEqual([hash.cols - 1, hash.rows - 1, hash.cols - 1, hash.rows - 1]);
        expect(Array.from(cellRange(hash, -500, 5000, 10))).toEqual([0, hash.rows - 1, 0, hash.rows - 1]);
    });

    it('returns the shared range array', () => {
        const { hash } = setup();
        expect(cellRange(hash, 300, 300, 10)).toBe(hash.range);
    });

    it('spans at most 3x3 cells for the largest radius', () => {
        const { hash } = setup();
        const rng = createRng(7);
        for (let n = 0; n < 500; n++) {
            const r = cellRange(hash, nextFloat(rng) * 1000, nextFloat(rng) * 1000, MAX_SIZE);
            expect(r[2] - r[0]).toBeLessThanOrEqual(2);
            expect(r[3] - r[1]).toBeLessThanOrEqual(2);
        }
    });
});

describe('buildHash', () => {
    it('matches a brute-force reference on 200 seeded worlds', () => {
        const { world, hash } = setup();
        for (let seed = 1; seed <= 200; seed++) {
            world.alive.fill(0);
            world.foodAlive.fill(0);
            const circles = populate(world, seed);
            buildHash(hash, world);
            const cells = cellContents(hash);
            const total = circles.reduce((n, c) => n + cellsOf(hash, c).length, 0);
            expect(hash.entryCount).toBe(total);
            for (const circle of circles) {
                const own = cellsOf(hash, circle);
                const holding = [...cells].filter(([, ids]) => ids.includes(circle.id)).map(([c]) => c);
                expect(holding).toEqual(own);
                const seen = new Set();
                for (const cell of own) {
                    for (const id of cells.get(cell) ?? []) {
                        seen.add(id);
                    }
                }
                for (const other of circles) {
                    if (boxesOverlap(circle, other)) {
                        expect(seen.has(other.id)).toBe(true);
                    }
                }
            }
        }
    });

    it('orders entries agents first then food, ascending, in every cell', () => {
        const { world, hash } = setup();
        for (let seed = 1; seed <= 20; seed++) {
            world.alive.fill(0);
            world.foodAlive.fill(0);
            populate(world, seed);
            buildHash(hash, world);
            for (const ids of cellContents(hash).values()) {
                expect(ids).toEqual([...ids].sort((a, b) => a - b));
            }
        }
    });

    it('stores each entry box minimum at build time', () => {
        const { world, hash } = setup();
        const circles = populate(world, 3);
        buildHash(hash, world);
        for (const circle of circles) {
            for (const cell of cellsOf(hash, circle)) {
                const at = hash.cellStart[cell] + (cellContents(hash).get(cell) ?? []).indexOf(circle.id);
                expect(hash.boxX[at]).toBe(Math.fround(circle.x) - Math.fround(circle.r));
                expect(hash.boxY[at]).toBe(Math.fround(circle.y) - Math.fround(circle.r));
            }
        }
    });

    it('skips dead slots and clears the previous build', () => {
        const { world, hash } = setup();
        populate(world, 5);
        buildHash(hash, world);
        world.alive.fill(0);
        world.foodAlive.fill(0);
        buildHash(hash, world);
        expect(hash.entryCount).toBe(0);
        expect(hash.cellStart[hash.cols * hash.rows]).toBe(0);
    });

    it('throws when the entries would overflow', () => {
        const { world, hash } = setup();
        populate(world, 9);
        world.size[0] = 5000;
        world.alive[0] = 1;
        world.x[0] = 500;
        world.y[0] = 450;
        hash.entries = new Int32Array(4);
        expect(() => buildHash(hash, world)).toThrow(/entries/);
    });

    it('accepts exactly as many entries as the capacity holds', () => {
        const { world, hash } = setup();
        world.alive[0] = 1;
        world.x[0] = 500;
        world.y[0] = 450;
        world.size[0] = 10;
        hash.entries = new Int32Array(1);
        buildHash(hash, world);
        expect(hash.entryCount).toBe(1);
        hash.entries = new Int32Array(0);
        expect(() => buildHash(hash, world)).toThrow('spatial hash needs 1 entries but holds 0');
    });
});

describe('cellOf', () => {
    it('floors a coordinate into a cell and clamps it to the grid', () => {
        expect(cellOf(0, CELL, 7)).toBe(0);
        expect(cellOf(CELL, CELL, 7)).toBe(1);
        expect(cellOf(-5, CELL, 7)).toBe(0);
        expect(cellOf(99999, CELL, 7)).toBe(7);
    });
});
