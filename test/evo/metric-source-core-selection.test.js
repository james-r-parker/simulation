// Source tests, core family, lineages and selection (docs/designs/metric-trust.md, T12): real splits, deaths, alarm calls
// and checkpoints on a scripted world, each value known by construction. Each run plants one event in the last tick and
// one in a tick a body dies, and the value is only right if both are counted.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { sourceRun, starve } from './helpers/source-world.js';

const RUN_TICKS = BURN_IN_TICKS + 500;
const LAST = RUN_TICKS - 1;

/** Makes the agent ready to split (mature, rich, off cooldown), so the step's split phase gives birth. */
function readyToSplit(/** @type {any} */ world, /** @type {number} */ slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
    world.cooldown[slot] = 0;
}

/** The alive child of `parent` (the newest one when it has several). */
function childOf(/** @type {any} */ world, /** @type {number} */ parent) {
    for (let slot = world.alive.length - 1; slot >= 0; slot--) {
        if (world.alive[slot] === 1 && world.parentA[slot] === world.genomeId[parent] && slot !== parent) {
            return slot;
        }
    }
    throw new Error(`no child of ${parent}`);
}

/** Moves to `tick` and runs one step there, so events carry that tick. */
function at(/** @type {any} */ run, /** @type {number} */ tick, /** @type {(world: any) => void} */ before) {
    run.jump(tick);
    run.tick(before);
}

/**
 * A run of 500 ticks after burn-in with four founders. Children: c1 (S1, tick +1) dies at age 5 in tick +10, when X
 * also dies; c4 (S4, +2) lives; c2 (S2, tick 480, the last tick that leaves time to mature) dies at age 19 in the last
 * tick; c3 (S3, tick 481) is too late to count and dies in the last tick too.
 */
function runChildren() {
    const r = sourceRun({ runTicks: RUN_TICKS });
    r.jump(BURN_IN_TICKS);
    const [s1, s2, s3, s4, x] = Array.from({ length: 5 }, () => r.spawn());
    at(r, BURN_IN_TICKS + 1, (w) => readyToSplit(w, s1));
    at(r, BURN_IN_TICKS + 2, (w) => readyToSplit(w, s4));
    const c1 = childOf(r.world, s1);
    at(r, BURN_IN_TICKS + 10, (w) => {
        starve(w, c1, 5);
        starve(w, x, 50);
    });
    at(r, BURN_IN_TICKS + 480, (w) => readyToSplit(w, s2));
    at(r, BURN_IN_TICKS + 481, (w) => readyToSplit(w, s3));
    const [c2, c3] = [childOf(r.world, s2), childOf(r.world, s3)];
    at(r, LAST, (w) => {
        starve(w, c2, 19);
        starve(w, c3, 18);
    });
    return r;
}

describe('child_survival', () => {
    it('is the eligible children that reached maturity: c4 of c1, c4, c2', () => {
        const r = runChildren();
        expect(r.observer.births[BORN_CAUSE.SPLIT]).toBe(4);
        expect(r.metrics()['eval.child_survival'].value).toBeCloseTo(1 / 3, 12);
    });

    it('is null until the run has reached its length', () => {
        const r = sourceRun({ runTicks: RUN_TICKS });
        r.spawn();
        r.tick();
        expect(r.metrics()['eval.child_survival']).toEqual({
            value: null,
            reason: 'the run has not reached its length',
        });
    });
});

describe('lineage_lifespan_p50', () => {
    it('is the median over lineages founded after burn-in: 10, 200, 499 (dies in the last tick), 500, 500', () => {
        const r = sourceRun({ runTicks: RUN_TICKS });
        r.spawn(); // founded at tick 0: not counted
        r.jump(BURN_IN_TICKS);
        const [x, y, z] = Array.from({ length: 5 }, () => r.spawn());
        at(r, BURN_IN_TICKS + 10, (w) => starve(w, x, 10));
        at(r, BURN_IN_TICKS + 200, (w) => starve(w, y, 200));
        at(r, LAST, (w) => starve(w, z, 499));
        expect(r.metrics()['eval.lineage_lifespan_p50']).toEqual({ value: 499 });
    });
});

/**
 * Founders P1 to P4 and R after burn-in, and Q before it. Q splits at tick 5 and dies at 100 (not counted). P1 splits
 * three times (c_a, c_b, c_c), P2 once; c_a splits once (g, generation 2). At +20 (R also splits) g, c_a, P2 and P3 die;
 * P1 (3 children) and P4 (none) die in the last tick. Deaths: children [0, 1, 1, 0, 3, 0], generation [2, 1, 0, 0, 0, 0].
 */
function runSelection() {
    const r = sourceRun({ runTicks: RUN_TICKS, over: { maxAgents: 32 } });
    const q = r.spawn();
    at(r, 5, (w) => readyToSplit(w, q));
    at(r, 100, (w) => starve(w, q, 100));
    r.jump(BURN_IN_TICKS);
    const [p1, p2, p3, p4, rich] = Array.from({ length: 5 }, () => r.spawn());
    for (const tick of [1, 101, 201]) {
        at(r, BURN_IN_TICKS + tick, (w) => readyToSplit(w, p1));
    }
    at(r, BURN_IN_TICKS + 2, (w) => readyToSplit(w, p2));
    const ca = childOf(r.world, p1);
    at(r, BURN_IN_TICKS + 301, (w) => readyToSplit(w, ca));
    const g = childOf(r.world, ca);
    at(r, BURN_IN_TICKS + 400, (w) => {
        readyToSplit(w, rich);
        starve(w, g, 10);
        starve(w, ca, 100);
        starve(w, p2, 100);
        starve(w, p3, 100);
    });
    at(r, LAST, (w) => {
        starve(w, p1, 100);
        starve(w, p4, 100);
    });
    return r.metrics();
}

describe('selection metrics from the death log', () => {
    const m = runSelection();
    const children = [0, 1, 1, 0, 3, 0];

    it('offspring_per_life is the mean children over lives that ended after burn-in: 5 / 6', () => {
        expect(m['eval.offspring_per_life'].value).toBeCloseTo(5 / 6, 12);
    });

    it('generation_depth_p90 interpolates 90% of the way through [0, 0, 0, 0, 1, 2]: 1.5', () => {
        expect(m['eval.generation_depth_p90'].value).toBeCloseTo(1.5, 12);
    });

    it('opportunity_for_selection is the variance of children over the squared mean', () => {
        const mean = 5 / 6;
        const variance = children.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 6;
        expect(m['eval.opportunity_for_selection'].value).toBeCloseTo(variance / mean ** 2, 12);
    });
});

/**
 * @param {number[]} values values
 * @returns {number[]} their ranks, ties sharing the mean rank
 */
function ranks(values) {
    return values.map((v) => {
        const below = values.filter((u) => u < v).length;
        const equal = values.filter((u) => u === v).length;
        return below + (equal + 1) / 2;
    });
}

/**
 * @param {number[]} a values
 * @param {number[]} b values
 * @returns {number} the Spearman correlation: Pearson on ranks
 */
function spearmanOf(a, b) {
    const [ra, rb] = [ranks(a), ranks(b)];
    const mean = (/** @type {number[]} */ v) => v.reduce((x, y) => x + y) / v.length;
    const [ma, mb] = [mean(ra), mean(rb)];
    let cov = 0;
    let va = 0;
    let vb = 0;
    ra.forEach((x, i) => {
        cov += (x - ma) * (rb[i] - mb);
        va += (x - ma) ** 2;
        vb += (rb[i] - mb) ** 2;
    });
    return cov / Math.sqrt(va * vb);
}

/**
 * Thirty mature agents i = 0..29 after burn-in with fitness = age at death (100 + i) and floor(i / 10) children (tick +1
 * and +2); i < 29 die at +100, i = 29 in the last tick. The correlation needs 30 deaths, so it needs the last one.
 */
function runCorrelation() {
    const r = sourceRun({
        runTicks: RUN_TICKS,
        over: { maxAgents: 128 },
        fitness: (/** @type {any} */ o, /** @type {number} */ slot) => o.ageTicks[slot],
    });
    r.jump(BURN_IN_TICKS);
    const agents = Array.from({ length: 30 }, () => r.spawn());
    at(r, BURN_IN_TICKS + 1, (w) => agents.slice(10).forEach((slot) => readyToSplit(w, slot)));
    at(r, BURN_IN_TICKS + 2, (w) => agents.slice(20).forEach((slot) => readyToSplit(w, slot)));
    at(r, BURN_IN_TICKS + 100, (w) => agents.slice(0, 29).forEach((slot, i) => starve(w, slot, 100 + i)));
    return { r, agents };
}

describe('fitness_lrs_corr', () => {
    it('is the Spearman correlation of fitness and children over 30 mature deaths, the 30th in the last tick', () => {
        const { r, agents } = runCorrelation();
        at(r, LAST, (w) => starve(w, agents[29], 129));
        const expected = spearmanOf(
            Array.from({ length: 30 }, (_, i) => 100 + i),
            Array.from({ length: 30 }, (_, i) => Math.floor(i / 10)),
        );
        expect(expected).toBeGreaterThan(0.8);
        expect(r.metrics()['eval.fitness_lrs_corr'].value).toBeCloseTo(expected, 12);
    });

    it('is null with 29 deaths', () => {
        const { r } = runCorrelation();
        expect(r.metrics()['eval.fitness_lrs_corr'].value).toBeNull();
    });
});

describe('archive_lineage_share', () => {
    it('is archive agents over agents at checkpoints after burn-in: (2 + 2 + 1) / (4 + 3 + 1)', () => {
        const r = sourceRun();
        r.observer.archiveDraw = (/** @type {number} */ slot) => slot < 2;
        const [a, , c, d] = Array.from({ length: 4 }, () => r.spawn());
        r.jump(BURN_IN_TICKS - 1000);
        r.check();
        r.jump(BURN_IN_TICKS);
        r.check();
        r.tick((w) => starve(w, d, 50));
        r.check();
        r.tick((w) => {
            starve(w, a, 50);
            starve(w, c, 50);
        });
        r.check();
        expect(r.metrics()['eval.archive_lineage_share'].value).toBeCloseTo((2 + 2 + 1) / (4 + 3 + 1), 12);
    });

    it('is null without an archive', () => {
        expect(sourceRun().metrics()['eval.archive_lineage_share'].value).toBeNull();
    });
});

describe('kin_within_call_radius', () => {
    it('is the kin near each caller over the calls: 2 kin at the first call, 0 at the call in the last tick', () => {
        const r = sourceRun();
        const [k1, k2, k3, loner, doomed] = Array.from({ length: 5 }, () => r.spawn());
        const { world } = r;
        [k1, k2, k3].forEach((slot, i) => {
            world.lineageId[slot] = 7;
            world.x[slot] = 400 + 50 * i;
            world.y[slot] = 400;
        });
        world.lineageId[loner] = 9;
        world.x[loner] = 900;
        world.y[loner] = 900;
        r.want(k1, OUTPUT_INDEX.ALARM);
        r.tick((w) => starve(w, doomed, 50));
        r.release(k1, OUTPUT_INDEX.ALARM);
        r.want(loner, OUTPUT_INDEX.ALARM);
        r.tick();
        expect(r.observer.intent.run.alarms).toBe(2);
        expect(r.metrics()['eval.kin_within_call_radius']).toEqual({ value: 1 });
    });
});
