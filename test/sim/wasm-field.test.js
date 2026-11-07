// The WASM pheromone update against the recorded reference of the JS grid loops it replaced (docs/designs/wasm-kernels.md,
// Phase 4): seeded stepped worlds digest for digest after every tick, and seeded fuzz grids of every shape from 1 x 1
// after every update. `test/sim/golden.json` keeps guarding `worldHash`.
import { describe, expect, it } from 'vitest';
import { updatePheromones } from '../../js/sim/pheromones.js';
import { FIELD_FIELDS } from '../../js/sim/wasm-field.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { FIELD_CASES, readFieldReference, runFieldCase, runFieldFuzz } from './helpers/field-reference.js';
import { smallWorld } from './helpers/small-world.js';

const TIMEOUT_MS = scaleTimeout(60_000);

describe('the WASM pheromone update against the recorded JS reference', () => {
    const reference = readFieldReference();
    for (const c of FIELD_CASES) {
        it(
            `reproduces the grids' digest after every tick (${c.name}, ${c.ticks} ticks)`,
            () => {
                expect(runFieldCase(c)).toEqual(reference.stepped[c.name]);
            },
            TIMEOUT_MS,
        );
    }

    it('reproduces every fuzz grid after every update', () => {
        expect(runFieldFuzz(updatePheromones)).toEqual(reference.fuzz);
    });
});

/**
 * The two whole-grid loops the kernel replaced, written plainly: decay every cell into the grid and the scratch, then
 * diffuse each cell from the scratch, edge cells summing from 0 in left, right, up, down order.
 * @param {Float32Array} grid the grid
 * @param {Float32Array} s the scratch
 * @param {{cols: number, rows: number, decay: number, diffusion: number}} shape the grid shape and rates
 * @returns {void}
 */
function naiveUpdate(grid, s, { cols, rows, decay, diffusion }) {
    const keep = 1 - decay;
    const k = diffusion / 4;
    for (let c = 0; c < cols * rows; c++) {
        grid[c] = Math.fround(grid[c] * keep);
        s[c] = grid[c];
    }
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const c = row * cols + col;
            const v = s[c];
            const interior = row > 0 && row < rows - 1 && col > 0 && col < cols - 1 && cols >= 3;
            if (interior) {
                grid[c] = Math.fround(v - k * 4 * v + k * (s[c - 1] + s[c + 1] + s[c - cols] + s[c + cols]));
                continue;
            }
            let sum = 0;
            sum += col > 0 ? s[c - 1] : 0;
            sum += col < cols - 1 ? s[c + 1] : 0;
            sum += row > 0 ? s[c - cols] : 0;
            sum += row < rows - 1 ? s[c + cols] : 0;
            const n = Number(col > 0) + Number(col < cols - 1) + Number(row > 0) + Number(row < rows - 1);
            grid[c] = Math.fround(v - k * n * v + k * sum);
        }
    }
}

describe('the row-skipping pheromone update against the two-loop model', () => {
    /** Row patterns: which rows hold values, the rest +0 (or -0 where marked). */
    const PATTERNS = [
        { name: 'all zero', rows: () => 0 },
        { name: 'one middle row', rows: (/** @type {number} */ r) => (r === 9 ? 1 : 0) },
        {
            name: 'first and last rows',
            rows: (/** @type {number} */ r, /** @type {number} */ n) => (r === 0 || r === n - 1 ? 1 : 0),
        },
        { name: 'bands of three', rows: (/** @type {number} */ r) => (Math.floor(r / 3) % 2 === 0 ? 1 : 0) },
        { name: 'one cell', rows: (/** @type {number} */ r) => (r === 5 ? 2 : 0) },
        { name: 'negative zero rows', rows: (/** @type {number} */ r) => (r % 4 === 1 ? -1 : r === 12 ? 1 : 0) },
        { name: 'subnormal row', rows: (/** @type {number} */ r) => (r === 7 ? 3 : 0) },
    ];
    /**
     * @param {number} kind 0 for +0, 1 for values, 2 for one value, -1 for -0, 3 for subnormals
     * @param {number} col the column
     * @returns {number} the cell value
     */
    const cell = (kind, col) => [0, 0.5 + col / 7, col === 3 ? 4 : 0, -0, 1e-44][kind < 0 ? 3 : kind] ?? 0;

    for (const p of PATTERNS) {
        it(`matches the grids and the scratch (${p.name})`, () => {
            const world = smallWorld({
                pheromoneDecay: 0.03,
                pheromoneDiffusion: 0.2,
                worldWidth: 1300,
                worldHeight: 2000,
            });
            const { cols, rows } = world.pheromoneGrid;
            expect([cols, rows]).toEqual([13, 20]);
            const want = FIELD_FIELDS.slice(0, 3).map((name, g) => {
                const grid = world[name];
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        grid[r * cols + c] = g === 1 && p.name !== 'negative zero rows' ? 0 : cell(p.rows(r, rows), c);
                    }
                }
                return Float32Array.from(grid);
            });
            const scratch = new Float32Array(cols * rows);
            for (let u = 0; u < 3; u++) {
                updatePheromones(world);
                for (const g of want) {
                    naiveUpdate(g, scratch, { cols, rows, decay: 0.03, diffusion: 0.2 });
                }
                FIELD_FIELDS.slice(0, 3).forEach((name, g) => {
                    expect(new Uint32Array(world[name].slice().buffer)).toEqual(new Uint32Array(want[g].buffer));
                });
                expect(new Uint32Array(world.pheromoneScratch.slice().buffer)).toEqual(new Uint32Array(scratch.buffer));
            }
        });
    }
});

describe('the field arena', () => {
    it('holds the grids and the scratch, so a deposit in JS is what the kernel decays', () => {
        const world = smallWorld({ pheromoneDecay: 0.5, pheromoneDiffusion: 0 });
        for (const name of FIELD_FIELDS) {
            expect(world[name].buffer).toBe(world.wasm.memory.buffer);
        }
        world.danger[3] = 2;
        updatePheromones(world);
        expect(world.danger[3]).toBe(1);
    });
});
