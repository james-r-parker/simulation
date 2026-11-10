// Source answers for the social scene family (metric-trust T19): real steps, observer reads and computeMetrics.
import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { sourceRun, starve } from './helpers/source-world.js';
import expected from './helpers/metric-source-scenes-social-baseline.js';

const SOURCE_METRICS = [
    'eval.basin_families.east',
    'eval.basin_families.west',
    'eval.basin_family_effective.east',
    'eval.basin_family_effective.west',
    'eval.basin_families',
    'eval.basin_family_effective',
    'eval.basin_spec_divergence',
    'eval.basin_cluster_divergence',
    'eval.basin_divergence',
    'eval.juvenile_parent_distance',
    'eval.juvenile_sibling_distance',
    'eval.juvenile_parent_pull',
    'eval.skill_heritability',
    'eval.social_return',
    'eval.mate_rank_gap',
    'eval.mate_hunter_lean',
    'eval.niche_replacement',
    'eval.style_separation',
    'eval.condition_gait_shift',
    'eval.mother_wait_by_condition',
    'eval.childshare_by_condition',
];

function socialSourceRun() {
    const run = sourceRun({ runTicks: BURN_IN_TICKS + 2 });
    const [firstDeath, finalDeath] = [run.spawn(), run.spawn()];
    run.jump(BURN_IN_TICKS);
    run.tick((world) => starve(world, firstDeath, 20));
    run.tick((world) => starve(world, finalDeath, 20));
    return run;
}

/** @param {'none' | 'middle' | 'full'} pattern */
function basinSourceRun(pattern) {
    const run = sourceRun({ runTicks: 20_000, over: { maxAgents: 64 } });
    const { world } = run;
    const west = Array.from({ length: 23 }, () => run.spawn());
    const east = Array.from({ length: 23 }, () => run.spawn());
    const rowSize = world.layout.weightCount;
    west.forEach((slot) => {
        world.x[slot] = 250;
        world.spec[slot] = 0;
        world.weights.fill(0, slot * rowSize, (slot + 1) * rowSize);
    });
    east.forEach((slot, index) => {
        const mixed = pattern === 'middle' && index >= 12;
        const specialised = pattern === 'full' || mixed;
        world.x[slot] = 750;
        world.spec[slot] = Number(specialised);
        world.weights.fill(Number(specialised), slot * rowSize, (slot + 1) * rowSize);
    });
    run.jump(17_999);
    run.tick((w) => starve(w, east[0], 50));
    run.jump(19_999);
    run.tick((w) => starve(w, west[0], 50));
    return run;
}

function kinSourceRun() {
    const run = sourceRun({ runTicks: 20_000, over: { maxAgents: 16 } });
    const { world } = run;
    const [parent, firstJuvenile, secondJuvenile, firstDeath, finalDeath] = Array.from({ length: 5 }, () =>
        run.spawn(),
    );
    world.x[parent] = 250;
    world.y[parent] = 500;
    world.vx.fill(0);
    world.vy.fill(0);
    [firstJuvenile, secondJuvenile].forEach((slot) => {
        world.spec[slot] = 1;
        world.parentA[slot] = world.genomeId[parent];
        world.parentB[slot] = 0;
        world.y[slot] = 500;
    });
    world.x[firstJuvenile] = 100;
    world.x[secondJuvenile] = 400;
    run.jump(17_999);
    run.tick((w) => starve(w, firstDeath, 50));
    run.jump(19_999);
    run.tick((w) => starve(w, finalDeath, 50));
    return run;
}

describe('social metrics from a scripted source run', () => {
    it('reads every social metric at its no-activity end and observes deaths in the earlier and final ticks', () => {
        const run = socialSourceRun();
        const actual = run.metrics();
        const names = SOURCE_METRICS;
        const registryNames = Object.entries(METRICS)
            .filter(([, entry]) => entry.family === 'scenes-social')
            .map(([name]) => name);
        expect(names).toHaveLength(21);
        expect(names).toEqual(registryNames);
        expect(Object.fromEntries(names.map((name) => [name, actual[name]]))).toEqual(expected);
        expect(run.observer.deathCount).toBe(2);
    });

    it('reads no basin divergence, a midpoint and complete separation', () => {
        const cases = /** @type {Array<['none' | 'middle' | 'full', number]>} */ ([
            ['none', 0],
            ['middle', 0.5],
            ['full', 1],
        ]);
        for (const [pattern, expectedDivergence] of cases) {
            const run = basinSourceRun(pattern);
            const metrics = run.metrics();
            expect(metrics['eval.basin_spec_divergence']).toEqual({ value: expectedDivergence });
            expect(metrics['eval.basin_cluster_divergence']).toEqual({ value: expectedDivergence });
            expect(metrics['eval.basin_divergence']).toEqual({ value: expectedDivergence });
            expect(run.observer.deathCount).toBe(2);
        }
    });

    it('counts one genetic family in the thinner basin and its evenness as one', () => {
        const metrics = basinSourceRun('full').metrics();
        expect(metrics['eval.basin_families']).toEqual({ value: 1 });
        expect(metrics['eval.basin_family_effective']).toEqual({ value: 1 });
        expect(metrics['eval.basin_families.west']).toEqual({ value: 1 });
        expect(metrics['eval.basin_families.east']).toEqual({ value: 1 });
    });

    it('measures living juvenile hunters at their parent and sibling distances', () => {
        const run = kinSourceRun();
        const metrics = run.metrics();
        expect(metrics['eval.juvenile_parent_distance']).toEqual({ value: 150 });
        expect(metrics['eval.juvenile_sibling_distance']).toEqual({ value: 300 });
        expect(metrics['eval.juvenile_parent_pull']).toEqual({ value: 2 });
        expect(run.observer.deathCount).toBe(2);
    });
});
