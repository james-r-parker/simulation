import { describe, expect, it } from 'vitest';
import { depositPheromone, samplePheromone, updatePheromones } from '../../js/sim/pheromones.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { smallWorld } from './helpers/small-world.js';

const CELL = 100;
const COLS = 10;

/** @returns {ReturnType<typeof smallWorld>} */
function build() {
    return smallWorld({ pheromoneCellSize: CELL, pheromoneDecay: 0.1, pheromoneDiffusion: 0.4 });
}

/**
 * @param {Float32Array} grid
 * @returns {number}
 */
function total(grid) {
    return grid.reduce((a, b) => a + b, 0);
}

describe('depositPheromone', () => {
    it('adds the deposit to the cell under the point', () => {
        const w = build();
        depositPheromone(w, w.danger, 250, 340);
        expect(w.danger[3 * COLS + 2]).toBe(1);
        expect(total(w.attack)).toBe(0);
    });

    it('caps at pheromoneMax', () => {
        const w = build();
        for (let i = 0; i < 20; i++) {
            depositPheromone(w, w.attack, 5, 5);
        }
        expect(w.attack[0]).toBe(5);
    });

    it('deposits on the hunt grid like the others', () => {
        const w = build();
        depositPheromone(w, w.hunt, 250, 340);
        expect(w.hunt[3 * COLS + 2]).toBe(1);
        expect(total(w.danger) + total(w.attack)).toBe(0);
    });

    it('clamps points outside the world to the edge cells', () => {
        const w = build();
        depositPheromone(w, w.danger, -50, -50);
        depositPheromone(w, w.danger, 1000, 1500);
        expect(w.danger[0]).toBe(1);
        expect(w.danger[w.danger.length - COLS + COLS - 1]).toBe(1);
    });
});

describe('updatePheromones', () => {
    it('decays an isolated value before spreading it', () => {
        const w = build();
        w.danger[55] = 1;
        updatePheromones(w);
        const decayed = 1 * (1 - 0.1);
        expect(w.danger[55]).toBeCloseTo(decayed * (1 - 0.4), 6);
        expect(w.danger[54]).toBeCloseTo(decayed * 0.1, 6);
        expect(w.danger[45]).toBeCloseTo(decayed * 0.1, 6);
    });

    it('conserves the total through diffusion, including edges and corners', () => {
        const w = build();
        for (const c of [0, 9, 90, 99, 5, 40, 55]) {
            w.attack[c] = 3;
        }
        w.pheromoneScratch.fill(0);
        const decayed = total(w.attack) * (1 - 0.1);
        updatePheromones(w);
        expect(Math.abs(total(w.attack) - decayed) / decayed).toBeLessThan(1e-6);
    });

    it('decays and diffuses the hunt grid like the others', () => {
        const w = build();
        w.hunt[55] = 1;
        updatePheromones(w);
        expect(w.hunt[55]).toBeCloseTo(0.9 * (1 - 0.4), 6);
        expect(w.hunt[54]).toBeCloseTo(0.9 * 0.1, 6);
        expect(total(w.danger) + total(w.attack)).toBe(0);
    });

    it('conserves the hunt total apart from decay', () => {
        const w = build();
        for (const c of [0, 9, 90, 99, 5, 40, 55]) {
            w.hunt[c] = 3;
        }
        const decayed = total(w.hunt) * (1 - 0.1);
        updatePheromones(w);
        expect(Math.abs(total(w.hunt) - decayed) / decayed).toBeLessThan(1e-6);
    });

    it('diffuses a corner cell to its two neighbours only', () => {
        const w = build();
        w.danger[0] = 1;
        updatePheromones(w);
        const decayed = 0.9;
        expect(w.danger[0]).toBeCloseTo(decayed * (1 - 0.2), 6);
        expect(w.danger[1]).toBeCloseTo(decayed * 0.1, 6);
        expect(w.danger[COLS]).toBeCloseTo(decayed * 0.1, 6);
    });
});

describe('samplePheromone', () => {
    it('returns the cell value clamped to 0..1', () => {
        const w = build();
        w.danger[0] = 0.4;
        w.danger[1] = 3;
        w.danger[2] = -2;
        expect(samplePheromone(w, w.danger, 10, 10)).toBeCloseTo(0.4, 6);
        expect(samplePheromone(w, w.danger, 150, 10)).toBe(1);
        expect(samplePheromone(w, w.danger, 250, 10)).toBe(0);
    });
});

describe('updatePheromones against a naive reference', () => {
    /**
     * @param {Float32Array} before the grid before the update
     * @param {{cols: number, rows: number}} size the grid size
     * @param {{pheromoneDecay: number, pheromoneDiffusion: number}} rates the config rates
     * @returns {Float32Array} the grid after decay then diffusion, cell by cell
     */
    function reference(before, { cols, rows }, { pheromoneDecay, pheromoneDiffusion }) {
        const s = Float32Array.from(before, (v) => v * (1 - pheromoneDecay));
        const k = pheromoneDiffusion / 4;
        const out = new Float32Array(s.length);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const c = row * cols + col;
                let sum = 0;
                let count = 0;
                for (const [dc, dr] of [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                ]) {
                    if (col + dc >= 0 && col + dc < cols && row + dr >= 0 && row + dr < rows) {
                        sum += s[c + dr * cols + dc];
                        count += 1;
                    }
                }
                out[c] = s[c] - k * count * s[c] + k * sum;
            }
        }
        return out;
    }

    it.each([100, 250, 334, 500, 1000])('matches bit for bit with %i-unit cells on a 1000 x 1000 world', (cellSize) => {
        const w = smallWorld({
            pheromoneCellSize: cellSize,
            pheromoneDecay: 0.00167,
            pheromoneDiffusion: 0.05,
        });
        const rng = createRng(5);
        for (const grid of [w.danger, w.attack, w.hunt]) {
            for (let i = 0; i < grid.length; i++) {
                grid[i] = nextFloat(rng) * 5;
            }
        }
        const expected = [w.danger, w.attack, w.hunt].map((g) => reference(g, w.pheromoneGrid, w.config));
        updatePheromones(w);
        [w.danger, w.attack, w.hunt].forEach((g, n) => expect(Array.from(g)).toEqual(Array.from(expected[n])));
    });
});
