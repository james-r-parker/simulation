// The watch metrics (fitness-and-selection.md T10): hand-built worlds fed through the real `observe` and `checkpoint`,
// read with `computeMetrics`. Patches: 3 discs of radius 100 at (100,100), (500,500) and (900,900) in a 1000 x 1000
// world; patch visits are sampled when the tick divides by 100.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { pearson } from '../../js/evo/metrics-watch.js';
import { checkpoint, observe } from '../../js/evo/observer.js';
import { drainObserverLogs } from '../../js/worker/observer-drain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

const PATCHES = { floraPatchMax: 3, foodPatchCount: 3, foodPatchRadius: 100, maturityTicks: 50 };
const CENTRES = [
    [100, 100],
    [500, 500],
    [900, 900],
];

/**
 * @param {Record<string, any>} [over] config overrides
 * @param {{runTicks?: number}} [options] the observer's options
 * @returns {{world: any, observer: any}} a world with the three patches placed, and its observer
 */
function withPatches(over = {}, options = {}) {
    const r = observed({ ...PATCHES, ...over }, options);
    CENTRES.forEach(([x, y], p) => {
        r.world.patchX[p] = x;
        r.world.patchY[p] = y;
    });
    return r;
}

/**
 * Moves an agent and lets the observer see the tick.
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the tick to observe
 * @param {number} slot the agent
 * @param {number[]} at x and y
 * @returns {void}
 */
function visit({ world, observer }, tick, slot, at) {
    nextTick(world, tick);
    [world.x[slot], world.y[slot]] = at;
    observe(observer, world);
}

/**
 * Kills the agent in `slot` in the tick that ends at `tick`.
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the world tick after the step
 * @param {number} slot the slot
 * @param {number} ageTicks the age at death
 * @returns {void}
 */
function die({ world, observer }, tick, slot, ageTicks) {
    nextTick(world, tick);
    pushDied(world, { slot, genomeId: world.genomeId[slot], ageTicks });
    world.alive[slot] = 0;
    observe(observer, world);
}

const index = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.migration_index'];

describe('eval.migration_index', () => {
    it('is the mean over mature deaths of distinct patches visited over foodPatchCount', () => {
        const r = withPatches();
        const a = addBorn(r.world, { x: 500, y: 500 });
        const b = addBorn(r.world, { x: 300, y: 300 }); // outside every disc
        observe(r.observer, r.world); // tick 0
        visit(r, 100, a, [500, 500]); // patch 1
        visit(r, 200, a, [100, 100]); // patch 0
        visit(r, 300, a, [101, 100]); // patch 0 again: still 2
        visit(r, 400, b, [900, 900]); // patch 2 for b
        die(r, 10001, a, 400);
        expect(index(r)).toEqual({ value: 2 / 3 });
        die(r, 10002, b, 400);
        expect(index(r)).toEqual({ value: (2 + 1) / 2 / 3 });
    });

    it('samples only on ticks that divide by 100, and the disc edge is exclusive', () => {
        const r = withPatches();
        const a = addBorn(r.world, { x: 300, y: 300 });
        observe(r.observer, r.world);
        visit(r, 150, a, [500, 500]); // not a sample tick
        visit(r, 200, a, [600, 500]); // exactly on the edge of patch 1: outside
        visit(r, 300, a, [599.9, 500]); // just inside
        die(r, 10001, a, 400);
        expect(index(r)).toEqual({ value: 1 / 3 });
    });

    it('marks every patch whose disc holds the agent when discs overlap', () => {
        const r = withPatches();
        r.world.patchX[0] = 540; // patch 0 now overlaps patch 1 around (520, 500)
        r.world.patchY[0] = 500;
        const a = addBorn(r.world, { x: 520, y: 500 });
        observe(r.observer, r.world);
        visit(r, 100, a, [520, 500]);
        die(r, 10001, a, 400);
        expect(index(r)).toEqual({ value: 2 / 3 });
    });

    it('counts a death only at or after tick 10000 and at or past maturityTicks', () => {
        const r = withPatches();
        const [a, b, c] = [0, 1, 2].map(() => addBorn(r.world, { x: 500, y: 500 }));
        observe(r.observer, r.world);
        visit(r, 100, a, [500, 500]);
        die(r, 10000, a, 400); // record tick 9999: burn-in
        expect(index(r)).toEqual({ value: null, reason: 'no mature death after burn-in' });
        die(r, 10001, b, 49); // one tick short of mature
        expect(index(r).value).toBeNull();
        die(r, 10002, c, 50); // mature; slot c sat in patch 1 when sampled
        expect(index(r)).toEqual({ value: 1 / 3 });
    });

    it('is null when no live patch has ever been observed, despite reserved pool slots', () => {
        const r = observed({ foodPatchCount: 0, maturityTicks: 50 });
        const a = addBorn(r.world, { x: 500, y: 500 });
        observe(r.observer, r.world);
        visit(r, 100, a, [500, 500]);
        die(r, 10001, a, 400);
        expect(index(r)).toEqual({ value: null, reason: 'no live patch observed' });
        expect(r.observer.watch.bits).toHaveLength(r.world.config.maxAgents);
    });

    it('forgets a slot on reuse: a newborn in a freed slot starts at 0 visits', () => {
        const r = withPatches();
        const a = addBorn(r.world, { x: 500, y: 500 });
        observe(r.observer, r.world);
        visit(r, 100, a, [500, 500]);
        visit(r, 200, a, [100, 100]); // 2 patches
        die(r, 10001, a, 400);
        nextTick(r.world, 10100);
        const slot = addBlob(r.world, { x: 900, y: 900 });
        expect(slot).toBe(a);
        pushBorn(r.world, { slot, genomeId: r.world.genomeId[slot] });
        observe(r.observer, r.world); // the newborn is sampled at once on tick 10100: patch 2
        die(r, 10101, slot, 400);
        expect(index(r)).toEqual({ value: (2 + 1) / 2 / 3 });
    });

    it('is not changed by emptying the checkpoint series and death log, as the worker does', () => {
        const r = withPatches();
        const a = addBorn(r.world, { x: 500, y: 500 });
        observe(r.observer, r.world);
        visit(r, 100, a, [500, 500]);
        die(r, 10001, a, 400);
        const before = index(r);
        drainObserverLogs(r.observer);
        expect(index(r)).toEqual(before);
    });
});

/**
 * Checkpoints with agents of the given specs alive and every other slot dead.
 * @param {{world: any, observer: any}} r the run
 * @param {number} tick the checkpoint tick
 * @param {number[]} specs one spec index per alive agent
 * @returns {void}
 */
function checkpointSpecs({ world, observer }, tick, specs) {
    for (let slot = 0; slot < world.alive.length; slot++) {
        world.alive[slot] = 0;
    }
    for (const spec of specs) {
        addBlob(world, { spec });
    }
    world.tick = tick;
    checkpoint(observer, world);
}

describe('eval.predator_presence', () => {
    const { predator, forager } = observed().world.config.specialisations;
    const presence = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.predator_presence'];

    it('is the share of checkpoints from tick 10000 with an alive agent whose spec has canHunt', () => {
        const r = observed();
        checkpointSpecs(r, 9999, [predator.index]); // burn-in: not counted
        expect(presence(r)).toEqual({ value: null, reason: 'no checkpoint after burn-in' });
        checkpointSpecs(r, 10000, [forager.index, predator.index]);
        expect(presence(r)).toEqual({ value: 1 });
        checkpointSpecs(r, 11000, [forager.index, forager.index]);
        checkpointSpecs(r, 12000, []); // an empty world counts as no predator
        checkpointSpecs(r, 13000, [predator.index]);
        expect(presence(r)).toEqual({ value: 2 / 4 });
    });

    it('ignores a dead predator whose stale spec is still in the slot', () => {
        const r = observed();
        checkpointSpecs(r, 10000, [predator.index]);
        r.world.alive[0] = 0;
        r.world.tick = 11000;
        checkpoint(r.observer, r.world);
        expect(presence(r)).toEqual({ value: 1 / 2 });
    });

    it('is not changed by observing ticks or by draining', () => {
        const r = observed();
        checkpointSpecs(r, 10000, [predator.index]);
        checkpointSpecs(r, 11000, [forager.index]);
        const before = presence(r);
        for (let t = 11001; t <= 11010; t++) {
            nextTick(r.world, t);
            observe(r.observer, r.world);
        }
        drainObserverLogs(r.observer);
        expect(presence(r)).toEqual(before);
    });
});

/**
 * Feeds a 10080-tick run through `observe`, with cumulative counters set to each window's running totals at its
 * boundary tick (10000, 10010, ... 10080).
 * @param {{world: any, observer: any}} r the run
 * @param {{kills: number[], hunterTicks: number[], responded: number[], escaped: number[]}} w per window deltas
 * @returns {void}
 */
function feedWindows({ world, observer }, w) {
    const total = { kills: 0, hunterTicks: 0, responded: 0, escaped: 0 };
    for (let b = 0; b <= 8; b++) {
        if (b > 0) {
            total.kills += w.kills[b - 1];
            total.hunterTicks += w.hunterTicks[b - 1];
            total.responded += w.responded[b - 1];
            total.escaped += w.escaped[b - 1];
        }
        observer.combat.huntKills = total.kills;
        observer.combat.hunterAgentTicks = total.hunterTicks;
        observer.intent.run.escapedResponded = total.responded;
        observer.combat.escapedEpisodes = total.escaped;
        nextTick(world, 10000 + 10 * b);
        observe(observer, world);
    }
}

describe('eval.pred_prey_lag_corr', () => {
    const lag = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.pred_prey_lag_corr'];
    // Catch rate in window k is kills_k per 1000 hunter-ticks; evasion in window k is responded_k / 10.
    const fill = (/** @type {number} */ v) => Array(8).fill(v);

    it('is the Pearson correlation of catch rate in window k with evasion skill in window k + 1', () => {
        const r = observed({}, { runTicks: 10080 });
        // Catch windows 0-4 are 1..5; evasion windows 1-5 are 0.2, 0.1, 0.4, 0.3, 0.5 (y = 2,1,4,3,5 over 10).
        // Windows 5-6 have no hunters, so those pairs are unusable. Window 0's evasion (0.9) and 6-7's (0.0)
        // must not enter: a same-window pairing would give a different r.
        feedWindows(r, {
            kills: [1, 2, 3, 4, 5, 0, 0, 0],
            hunterTicks: [1000, 1000, 1000, 1000, 1000, 0, 0, 0],
            responded: [9, 2, 1, 4, 3, 5, 0, 0],
            escaped: fill(10),
        });
        // mean x 3, mean y 0.3; sum dx dy = 0.8, sum dx^2 = 10, sum dy^2 = 0.1 -> r = 0.8 / sqrt(10 x 0.1) = 0.8
        expect(lag(r).value).toBeCloseTo(0.8, 12);
    });

    it('is null below 5 usable pairs, with a reason', () => {
        const r = observed({}, { runTicks: 10080 });
        feedWindows(r, {
            kills: [1, 2, 3, 4, 0, 0, 0, 0],
            hunterTicks: [1000, 1000, 1000, 1000, 0, 0, 0, 0],
            responded: [0, 2, 1, 4, 3, 5, 0, 0],
            escaped: fill(10),
        });
        expect(lag(r).value).toBeNull();
        expect(lag(r).reason).toBe('fewer than 5 usable pairs of a catch rate and the next evasion skill');
    });

    it('drops a pair whose later window has no escaped bite episode', () => {
        const r = observed({}, { runTicks: 10080 });
        feedWindows(r, {
            kills: [1, 2, 3, 4, 5, 6, 7, 8],
            hunterTicks: fill(1000),
            responded: [0, 1, 2, 3, 4, 5, 6, 0],
            escaped: [10, 10, 10, 10, 10, 10, 10, 0], // window 7 has none: the pair (6, 7) is dropped
        });
        expect(lag(r).value).toBeCloseTo(1, 12); // 6 pairs, evasion 0.1..0.6 against catch 1..6
    });

    it('is null when a series does not vary', () => {
        const r = observed({}, { runTicks: 10080 });
        feedWindows(r, {
            kills: fill(3),
            hunterTicks: fill(1000),
            responded: [0, 1, 2, 3, 4, 5, 6, 7],
            escaped: fill(10),
        });
        expect(lag(r)).toEqual({
            value: null,
            reason: 'catch rate or evasion skill does not vary across the windows',
        });
    });

    it('is null without a run length, in a run within burn-in, and before the final boundary', () => {
        const unknown = observed();
        expect(lag(unknown).reason).toBe('run length unknown or within burn-in');
        expect(lag(observed({}, { runTicks: 10000 })).value).toBeNull();
        const short = observed({}, { runTicks: 10080 });
        nextTick(short.world, 10070); // the last boundary (10080) is not reached
        observe(short.observer, short.world);
        expect(lag(short)).toEqual({ value: null, reason: 'run ended early' });
    });

    it('is not changed by draining', () => {
        const r = observed({}, { runTicks: 10080 });
        feedWindows(r, {
            kills: [1, 2, 3, 4, 5, 6, 7, 8],
            hunterTicks: fill(1000),
            responded: [0, 2, 1, 4, 3, 6, 5, 8],
            escaped: fill(10),
        });
        const before = lag(r);
        expect(before.value).not.toBeNull();
        drainObserverLogs(r.observer);
        expect(lag(r)).toEqual(before);
    });
});

describe('pearson', () => {
    it('is 1 and -1 for exact linear relations and uses only the first n pairs', () => {
        expect(pearson([1, 2, 3], [2, 4, 6], 3)).toBeCloseTo(1, 12);
        expect(pearson([1, 2, 3, 99], [6, 4, 2, -50], 3)).toBeCloseTo(-1, 12);
    });

    it('is null when either series is constant', () => {
        expect(pearson([1, 2, 3], [5, 5, 5], 3)).toBeNull();
    });
});
