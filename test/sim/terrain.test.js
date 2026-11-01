import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { stepTemperature } from '../../js/sim/temperature.js';
import {
    REFUGE_ROCKS,
    REFUGE_ROCK_RADIUS,
    coldFactor,
    terrainProblem,
    terrainRockCount,
} from '../../js/sim/terrain.js';
import { smallWorld } from './helpers/small-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const BASINS = {
    worldWidth: 6000,
    worldHeight: 4000,
    wallGaps: 3,
    wallGapWidth: 300,
    refugeCount: 4,
    refugeCluster: 1,
    refugeSizeMax: 30,
    coldMarginWidth: 600,
};

describe('basins', () => {
    const world = smallWorld(BASINS);
    const { obsX, obsY, obsRadius } = world;
    const refugeFirst = obsX.length - 4 * REFUGE_ROCKS;

    it('allocates a static rock for every slot and places them all inside the world', () => {
        expect(obsX.length).toBe(terrainRockCount(world.config));
        for (let i = 0; i < obsX.length; i++) {
            expect(obsRadius[i]).toBeGreaterThan(0);
            expect(obsX[i]).toBeGreaterThan(0);
            expect(obsX[i]).toBeLessThan(6000);
            expect(obsY[i]).toBeGreaterThan(0);
            expect(obsY[i]).toBeLessThan(4000);
        }
    });

    it('builds a wall down the middle with exactly wallGaps gaps at least wallGapWidth wide', () => {
        /** @type {number[][]} */
        const wall = [];
        for (let i = 0; i < refugeFirst; i++) {
            expect(obsX[i]).toBe(3000);
            wall.push([obsY[i] - obsRadius[i], obsY[i] + obsRadius[i]]);
        }
        const edges = [0, ...wall.flat(), 4000];
        const gaps = [];
        for (let i = 0; i < edges.length; i += 2) {
            if (edges[i + 1] - edges[i] > 0.001) {
                gaps.push(edges[i + 1] - edges[i]);
            }
        }
        expect(gaps).toHaveLength(3);
        for (const gap of gaps) {
            expect(gap).toBeGreaterThanOrEqual(300 - 0.001);
        }
        const centres = [];
        for (let i = 0; i < edges.length; i += 2) {
            if (edges[i + 1] - edges[i] > 0.001) {
                centres.push((edges[i] + edges[i + 1]) / 2);
            }
        }
        expect(Array.from(world.wallGapY).sort((a, b) => a - b)).toEqual(centres);
    });

    it('rings each refuge so a neighbour gap just fits refugeSizeMax and clear of the wall', () => {
        for (let r = 0; r < 4; r++) {
            const at = refugeFirst + r * REFUGE_ROCKS;
            const dx = obsX[at + 1] - obsX[at];
            const dy = obsY[at + 1] - obsY[at];
            const gap = Math.sqrt(dx * dx + dy * dy) - 2 * REFUGE_ROCK_RADIUS;
            expect(gap).toBeCloseTo(60, 3);
            const cx = (obsX[at] + obsX[at + REFUGE_ROCKS / 2]) / 2;
            expect(Math.abs(cx - 3000)).toBeGreaterThan(100);
        }
    });

    it('is the same for the same seed and differs for another', () => {
        const hash = hashWorld(smallWorld(BASINS));
        expect(hashWorld(smallWorld(BASINS))).toBe(hash);
        expect(hashWorld(smallWorld({ ...BASINS, seed: 9 }))).not.toBe(hash);
    });

    it('builds a solid wall with no gaps, and one refuge in the left basin', () => {
        const solid = smallWorld({ ...BASINS, wallGaps: 0, refugeCount: 1 });
        expect(solid.obsX.length).toBe(40 + REFUGE_ROCKS);
        expect(solid.obsX[0]).toBe(3000);
        expect(solid.obsX[40 + 1]).toBeLessThan(3000);
        expect(terrainProblem({ ...createConfig({ ...SIMPLE_WORLD }), ...BASINS, wallGaps: 0 })).toBeNull();
    });

    it('places food patches whole inside a basin, alternating sides', () => {
        const w = smallWorld({ ...BASINS, foodPatchCount: 6, foodPatchRadius: 200 });
        for (let i = 0; i < 6; i++) {
            const x = w.patchX[i];
            if (i % 2 === 0) {
                expect(x + 200).toBeLessThan(3000 - 100);
            } else {
                expect(x - 200).toBeGreaterThan(3000 + 100);
            }
        }
    });

    it('draws the same number of patch floats as the open layout', () => {
        const open = smallWorld({
            foodPatchCount: 3,
            foodPatchRadius: 200,
            worldWidth: 6000,
            worldHeight: 4000,
        });
        const basins = smallWorld({ ...BASINS, foodPatchCount: 3, foodPatchRadius: 200 });
        expect(Array.from(basins.patchY)).toEqual(Array.from(open.patchY));
    });

    it('doubles passive temperature loss north and south of the margin only', () => {
        const c = world.config;
        expect(coldFactor(c, 100)).toBe(2);
        expect(coldFactor(c, 3900)).toBe(2);
        expect(coldFactor(c, 2000)).toBe(1);
        /**
         * @param {number} y the agent's y
         * @returns {number} the temperature lost in one still tick
         */
        const lossAt = (y) => {
            world.y[0] = y;
            world.vx[0] = 0;
            world.vy[0] = 0;
            world.temperature[0] = 50;
            stepTemperature(world, 0);
            return 50 - world.temperature[0];
        };
        expect(lossAt(100)).toBeCloseTo(2 * lossAt(2000), 10);
    });
});

describe('terrainProblem', () => {
    /**
     * @param {Record<string, any>} over keys to change
     * @returns {Record<string, any>} a config shaped object
     */
    const cfg = (over) => ({ ...createConfig({ ...SIMPLE_WORLD }), ...BASINS, ...over });

    it('rejects a crowded wall, refuges that do not fit and no room between margins', () => {
        expect(terrainProblem(cfg({}))).toBeNull();
        expect(terrainProblem(cfg({ wallGaps: 8, wallGapWidth: 2000 }))).toMatch(/wallGaps/);
        expect(terrainProblem(cfg({ worldWidth: 1000 }))).toMatch(/refuges/);
        expect(terrainProblem(cfg({ coldMarginWidth: 2000 }))).toMatch(/coldMargin/);
        expect(terrainProblem(cfg({ foodPatchCount: 1, foodPatchRadius: 2000, refugeCount: 0 }))).toMatch(/basin/);
    });

    it('is enforced by createConfig', () => {
        expect(() => createConfig({ ...SIMPLE_WORLD, ...BASINS, wallGaps: 9 })).toThrow(/wallGaps/);
    });
});
