import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { detCos, detSin } from '../../js/sim/det-math.js';
import { createRng, fork, nextFloat } from '../../js/sim/rng.js';
import { REFUGE_ROCKS, REFUGE_ROCK_RADIUS, ringRadius, terrainProblem } from '../../js/sim/terrain.js';
import { smallWorld } from './helpers/small-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const WORLD = {
    worldWidth: 8000,
    worldHeight: 4000,
    wallGaps: 2,
    wallGapWidth: 200,
    refugeCount: 4,
    refugeSizeMax: 30,
    coldMarginWidth: 0,
};
const TWO_PI = 6.283185307179586;

/**
 * The refuges as placed before clusters existed: one ring per band, an x draw then a y draw per ring, alternating
 * between the basins. A naive copy to compare the cluster of 1 against, bit for bit.
 * @param {Record<string, any>} config the config
 * @returns {{x: number[], y: number[], next: number}} the rock positions and the next float of the stream
 */
function referenceRefuges(config) {
    const rng = fork(createRng(config.seed), 'obstacles');
    for (let g = 0; g < config.wallGaps; g++) {
        nextFloat(rng);
    }
    const ring = ringRadius(config);
    const m = ring + REFUGE_ROCK_RADIUS;
    const wallEdge = config.worldHeight / Math.ceil(config.worldHeight / 100);
    const band = config.worldHeight / Math.ceil(config.refugeCount / 2);
    const x = [];
    const y = [];
    for (let i = 0; i < config.refugeCount; i++) {
        const left = i % 2 === 0;
        const x0 = left ? m : config.worldWidth / 2 + wallEdge + m;
        const x1 = left ? config.worldWidth / 2 - wallEdge - m : config.worldWidth - m;
        const cx = x0 + nextFloat(rng) * (x1 - x0);
        const cy = Math.floor(i / 2) * band + m + nextFloat(rng) * (band - 2 * m);
        for (let r = 0; r < REFUGE_ROCKS; r++) {
            const angle = (r / REFUGE_ROCKS) * TWO_PI;
            x.push(cx + ring * detCos(angle));
            y.push(cy + ring * detSin(angle));
        }
    }
    return { x, y, next: nextFloat(rng) };
}

/**
 * @param {ReturnType<typeof smallWorld>} world the world
 * @param {number} count the number of refuge rings
 * @returns {{x: number, y: number}[]} the ring centres in placement order
 */
function centres(world, count) {
    const first = world.obsX.length - count * REFUGE_ROCKS;
    return Array.from({ length: count }, (_, r) => {
        const at = first + r * REFUGE_ROCKS;
        return {
            x: (world.obsX[at] + world.obsX[at + REFUGE_ROCKS / 2]) / 2,
            y: (world.obsY[at] + world.obsY[at + REFUGE_ROCKS / 2]) / 2,
        };
    });
}

describe('refugeCluster', () => {
    it('defaults to 2 with 8 refuges and a 200 px gap, and the default world fits', () => {
        const c = createConfig();
        expect([c.refugeCluster, c.refugeCount, c.wallGapWidth]).toEqual([2, 8, 200]);
        expect(terrainProblem(c)).toBeNull();
    });

    it('is an integer from 1 to 4', () => {
        for (const bad of [0, 5, 1.5]) {
            expect(() => createConfig({ ...SIMPLE_WORLD, ...WORLD, refugeCluster: bad })).toThrow(/refugeCluster/);
        }
    });

    it('at 1 places every rock where the one-ring-per-band placement did, and draws the same floats', () => {
        const world = smallWorld({ ...WORLD, refugeCluster: 1 });
        const ref = referenceRefuges(world.config);
        const first = world.obsX.length - world.config.refugeCount * REFUGE_ROCKS;
        for (let i = 0; i < ref.x.length; i++) {
            expect(world.obsX[first + i]).toBe(Math.fround(ref.x[i]));
            expect(world.obsY[first + i]).toBe(Math.fround(ref.y[i]));
        }
        expect(nextFloat(world.rng.obstacles)).toBe(ref.next);
    });

    it('at 2 puts the two rings of a group in one basin at one height, 2 ring extents plus 100 px apart', () => {
        const world = smallWorld({ ...WORLD, refugeCluster: 2 });
        const [a, b, c, d] = centres(world, 4);
        const spacing = 2 * (ringRadius(world.config) + REFUGE_ROCK_RADIUS) + 100;
        // groups alternate basins: the first group is in the left basin, the second in the right
        expect(a.y).toBeCloseTo(b.y, 3);
        expect(b.x - a.x).toBeCloseTo(spacing, 3);
        expect(c.y).toBeCloseTo(d.y, 3);
        expect(d.x - c.x).toBeCloseTo(spacing, 3);
        expect(b.x).toBeLessThan(4000);
        expect(c.x).toBeGreaterThan(4000);
    });

    it('at 2 gives each group of a basin its own height band', () => {
        const world = smallWorld({ ...WORLD, refugeCount: 8, refugeCluster: 2 });
        const rings = centres(world, 8);
        const m = ringRadius(world.config) + REFUGE_ROCK_RADIUS;
        // placement order is group 0 (left), 1 (right), 2 (left), 3 (right), two rings each
        const firstLeft = rings[0];
        const secondLeft = rings[4];
        expect(firstLeft.y).toBeLessThan(2000);
        expect(secondLeft.y).toBeGreaterThan(2000);
        for (const ring of rings) {
            expect(ring.y).toBeGreaterThanOrEqual(m - 1e-3);
            expect(ring.y).toBeLessThanOrEqual(4000 - m + 1e-3);
        }
    });

    it('splits an odd count into groups with the last one smaller, and still writes every ring', () => {
        const world = smallWorld({ ...WORLD, refugeCount: 5, refugeCluster: 2 });
        expect(world.obsX.length - 5 * REFUGE_ROCKS).toBeGreaterThan(0);
        const rings = centres(world, 5);
        expect(rings.slice(0, 2).every((r) => r.x < 4000)).toBe(true); // left group of 2
        expect(rings.slice(2, 4).every((r) => r.x > 4000)).toBe(true); // right group of 2
        expect(rings[4].x).toBeLessThan(4000); // the left basin's last, single ring
    });

    it('refuses a cluster that does not fit the basin, naming refugeCluster', () => {
        const config = { ...createConfig({ ...SIMPLE_WORLD }), ...WORLD, worldWidth: 2000, refugeCount: 8 };
        expect(terrainProblem({ ...config, refugeCluster: 1 })).toBeNull();
        expect(terrainProblem({ ...config, refugeCluster: 4 })).toMatch(/refugeCluster/);
        expect(() =>
            createConfig({ ...SIMPLE_WORLD, ...WORLD, worldWidth: 2000, refugeCount: 8, refugeCluster: 4 }),
        ).toThrow(/refugeCluster/);
    });

    it('refuses a count of groups that does not fit the basin height', () => {
        const config = { ...createConfig({ ...SIMPLE_WORLD }), ...WORLD, worldHeight: 1000, refugeCount: 2 };
        expect(terrainProblem({ ...config, refugeCluster: 1 })).toBeNull();
        expect(terrainProblem({ ...config, refugeCount: 8, refugeCluster: 1 })).toMatch(/refuges/);
    });
});
