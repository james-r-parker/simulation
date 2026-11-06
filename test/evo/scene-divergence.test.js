import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createDivergenceScene, divergenceMetrics, sampleDivergence } from '../../js/evo/scene-divergence.js';

const CONFIG = createConfig({ worldWidth: 4000, maxAgents: 120 });
const LAYOUT = brainLayout(CONFIG);

/**
 * A hand-built world: one alive agent per entry, west (x 1000) or east (x 3000), whose whole weight row is its
 * family's value plus a tiny per-agent offset, so relatives sit close and families far apart.
 * @param {{basin: number, family: number, spec: number}[]} agents the alive agents
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
        spec: new Uint8Array(n),
        weights: new Float32Array(n * w),
    };
    agents.forEach((a, slot) => {
        world.alive[slot] = 1;
        world.x[slot] = a.basin === 0 ? 1000 : 3000;
        world.spec[slot] = a.spec;
        world.weights.fill(a.family * 2 + slot * 1e-4, slot * w, (slot + 1) * w);
    });
    return world;
}

/**
 * @param {number} basin 0 or 1
 * @param {number[][]} cells `[family, spec, count]` triples
 * @returns {{basin: number, family: number, spec: number}[]} the agents
 */
function group(basin, cells) {
    return cells.flatMap(([family, spec, count]) => Array.from({ length: count }, () => ({ basin, family, spec })));
}

/**
 * The naive reference: total variation distance of two label lists, from Maps.
 * @param {number[]} a the first basin's labels
 * @param {number[]} b the second basin's labels
 * @returns {number} half the sum of absolute share differences
 */
function naiveTv(a, b) {
    const labels = new Set([...a, ...b]);
    let sum = 0;
    for (const label of labels) {
        sum += Math.abs(
            a.filter((x) => x === label).length / a.length - b.filter((x) => x === label).length / b.length,
        );
    }
    return sum / 2;
}

describe('basin divergence', () => {
    it('is 0 for identical basins and 1 for disjoint ones', () => {
        const same = createDivergenceScene(CONFIG);
        sampleDivergence(same, handWorld([...group(0, [[0, 0, 30]]), ...group(1, [[0, 0, 30]])], 1000));
        const m = divergenceMetrics(same, { tick: 1000 });
        expect(m['eval.basin_spec_divergence'].value).toBe(0);
        expect(m['eval.basin_cluster_divergence'].value).toBe(0);
        const apart = createDivergenceScene(CONFIG);
        sampleDivergence(apart, handWorld([...group(0, [[0, 0, 30]]), ...group(1, [[1, 1, 30]])], 1000));
        const d = divergenceMetrics(apart, { tick: 1000 });
        expect(d['eval.basin_spec_divergence'].value).toBe(1);
        expect(d['eval.basin_cluster_divergence'].value).toBe(1);
        expect(d['eval.basin_divergence'].value).toBe(1);
    });

    it('matches a naive reference on mixed basins, averaged over the last quarter only', () => {
        const west = group(0, [
            [0, 0, 20],
            [1, 1, 10],
            [2, 2, 10],
        ]);
        const east = group(1, [
            [0, 0, 10],
            [1, 1, 20],
            [3, 3, 10],
        ]);
        const scene = createDivergenceScene(CONFIG);
        // An early disjoint checkpoint that must not count, then two identical late ones.
        sampleDivergence(scene, handWorld([...group(0, [[0, 0, 30]]), ...group(1, [[1, 1, 30]])], 1000));
        sampleDivergence(scene, handWorld([...west, ...east], 3000));
        sampleDivergence(scene, handWorld([...west, ...east], 4000));
        const m = divergenceMetrics(scene, { tick: 4000 });
        const spec = naiveTv(
            west.map((a) => a.spec),
            east.map((a) => a.spec),
        );
        const cluster = naiveTv(
            west.map((a) => a.family),
            east.map((a) => a.family),
        );
        expect(spec).toBeCloseTo(0.5, 12);
        expect(m['eval.basin_spec_divergence'].value).toBeCloseTo(spec, 12);
        expect(m['eval.basin_cluster_divergence'].value).toBeCloseTo(cluster, 12);
        expect(m['eval.basin_divergence'].value).toBeCloseTo((spec + cluster) / 2, 12);
    });

    it('splits one basin across clusters even when specialisations match', () => {
        const scene = createDivergenceScene(CONFIG);
        sampleDivergence(scene, handWorld([...group(0, [[0, 0, 25]]), ...group(1, [[1, 0, 25]])], 1000));
        const m = divergenceMetrics(scene, { tick: 1000 });
        expect(m['eval.basin_spec_divergence'].value).toBe(0);
        expect(m['eval.basin_cluster_divergence'].value).toBe(1);
        expect(m['eval.basin_divergence'].value).toBe(0.5);
    });

    it('is null with a reason when a basin holds under 20 agents, or none sampled', () => {
        const thin = createDivergenceScene(CONFIG);
        sampleDivergence(thin, handWorld([...group(0, [[0, 0, 30]]), ...group(1, [[1, 1, 5]])], 1000));
        for (const name of Object.keys(divergenceMetrics(thin, { tick: 1000 }))) {
            const result = divergenceMetrics(thin, { tick: 1000 })[name];
            expect(result.value).toBeNull();
            expect(result.reason).toContain('basin 1 held 5 agents');
        }
        const none = createDivergenceScene(CONFIG);
        expect(divergenceMetrics(none, { tick: 1000 })['eval.basin_divergence'].value).toBeNull();
    });

    it('is null with the no-checkpoint reason when each basin is thick on average but never both at once', () => {
        const scene = createDivergenceScene(CONFIG);
        sampleDivergence(scene, handWorld(group(0, [[0, 0, 40]]), 1900));
        sampleDivergence(scene, handWorld(group(1, [[1, 1, 40]]), 2000));
        const result = divergenceMetrics(scene, { tick: 2000 })['eval.basin_divergence'];
        expect(result.value).toBeNull();
        expect(result.reason).toContain('no checkpoint in the last quarter had both basins');
    });
});
