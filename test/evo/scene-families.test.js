import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { geneticDistance } from '../../js/sim/genetics.js';
import { createFamilyScene, familyMetrics, sampleFamilies } from '../../js/evo/scene-families.js';

const CONFIG = createConfig({ worldWidth: 4000, maxAgents: 120 });
const LAYOUT = brainLayout(CONFIG);

/**
 * A hand-built world: one alive agent per entry, west (x 1000) or east (x 3000), whose whole weight row is its
 * family's value plus a tiny per-agent offset, so relatives sit close and families far apart.
 * @param {{basin: number, family: number}[]} agents the alive agents
 * @param {number} tick the world's tick
 * @returns {Record<string, any>} the world
 */
function handWorld(agents, tick) {
    const n = CONFIG.maxAgents;
    const w = LAYOUT.weightCount;
    const world = {
        config: CONFIG,
        layout: LAYOUT,
        tick,
        alive: new Uint8Array(n),
        x: new Float32Array(n),
        weights: new Float32Array(n * w),
    };
    agents.forEach((a, slot) => {
        world.alive[slot] = 1;
        world.x[slot] = a.basin === 0 ? 1000 : 3000;
        world.weights.fill(a.family * 2 + slot * 1e-4, slot * w, (slot + 1) * w);
    });
    return world;
}

/**
 * @param {number} basin 0 or 1
 * @param {number[]} sizes agents per family
 * @returns {{basin: number, family: number}[]} the agents
 */
function basinOf(basin, sizes) {
    return sizes.flatMap((size, family) => Array.from({ length: size }, () => ({ basin, family })));
}

describe('families per basin', () => {
    it('clusters relatives together and unrelated genomes apart', () => {
        const world = handWorld(basinOf(0, [2, 1]), 1000);
        expect(geneticDistance(world, 0, 1)).toBeLessThan(0.01);
        expect(geneticDistance(world, 0, 2)).toBeGreaterThan(1);
    });

    it('counts families and the effective number, the smaller basin over the last quarter', () => {
        const scene = createFamilyScene(CONFIG);
        // Early: one family per basin; the last quarter (ticks 3000 and 4000): three even families west, two east.
        sampleFamilies(scene, handWorld([...basinOf(0, [30]), ...basinOf(1, [30])], 1000));
        sampleFamilies(scene, handWorld([...basinOf(0, [10, 10, 10]), ...basinOf(1, [15, 15])], 3000));
        sampleFamilies(scene, handWorld([...basinOf(0, [10, 10, 10]), ...basinOf(1, [15, 15])], 4000));
        const m = familyMetrics(scene, { tick: 4000 });
        expect(m['eval.basin_families'].value).toBe(2);
        expect(m['eval.basin_family_effective'].value).toBeCloseTo(2, 9);
    });

    it('reads a dominant family as near 1 effective, and null with no basin of 20', () => {
        const scene = createFamilyScene(CONFIG);
        sampleFamilies(scene, handWorld([...basinOf(0, [27, 1, 1, 1]), ...basinOf(1, [5])], 1000));
        const m = familyMetrics(scene, { tick: 1000 });
        expect(m['eval.basin_families'].value).toBe(4);
        expect(m['eval.basin_family_effective'].value).toBeCloseTo(900 / 732, 9);
        const empty = createFamilyScene(CONFIG);
        sampleFamilies(empty, handWorld(basinOf(0, [5]), 1000));
        expect(familyMetrics(empty, { tick: 1000 })['eval.basin_families'].value).toBeNull();
    });
});
