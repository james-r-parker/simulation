// Source tests, core family, series and grids (docs/designs/metric-trust.md, T12): `checkpoint` on a scripted world after
// real steps. A checkpoint reads the world, so the two planted events are a checkpoint in the last tick and one in a tick
// a body dies (the dead body is not counted, the rest are).

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { plantFood, sourceRun, starve } from './helpers/source-world.js';

const PREDATOR = 1;

/**
 * Five agents A to E, three checkpoints. Lineages [1, 1, 2, 3, 4], specs [predator, 0, 2, 3, 0], weight rows constant
 * [0, 0, 1, 2, 0]. Checkpoint 1 at tick 9000 (before burn-in): all five. D dies in tick 10001 and E joins lineage 1:
 * checkpoint 2 holds A, B, C, E. C dies in the last tick, 10002: checkpoint 3 holds A, B, E.
 */
function runCheckpoints() {
    const r = sourceRun();
    const { world } = r;
    const [a, b, c, d, e] = Array.from({ length: 5 }, () => r.spawn());
    const n = world.layout.weightCount;
    [a, b, c, d, e].forEach((slot, i) => {
        world.lineageId[slot] = [1, 1, 2, 3, 4][i];
        world.spec[slot] = [PREDATOR, 0, 2, 3, 0][i];
        world.weights.fill([0, 0, 1, 2, 0][i], slot * n, (slot + 1) * n);
    });
    r.jump(BURN_IN_TICKS - 1000);
    r.check();
    r.jump(BURN_IN_TICKS);
    r.tick((w) => starve(w, d, 50));
    world.lineageId[e] = 1;
    r.check();
    r.tick((w) => starve(w, c, 50));
    r.check();
    return r.metrics();
}

describe('checkpoint series', () => {
    const m = runCheckpoints();

    it('population_mean averages every checkpoint, burn-in included: (5 + 4 + 3) / 3', () => {
        expect(m['eval.population_mean']).toEqual({ value: 4 });
    });

    it('diversity averages the mean pairwise row distance: 1, 0.5 and 0 over three checkpoints', () => {
        expect(m['eval.diversity'].value).toBeCloseTo(0.5, 12);
    });

    it('lineages_alive averages the checkpoints after burn-in only: (2 + 1) / 2', () => {
        expect(m['eval.lineages_alive']).toEqual({ value: 1.5 });
    });

    it('lineage_turnover counts the new dominant lineage (1 over a tie before) per 100000 ticks: 1 in 2', () => {
        expect(m['eval.lineage_turnover']).toEqual({ value: 50000 });
    });

    it('spec_turnover counts the spec bits that change between checkpoints (D gone, C gone): 2 in 2', () => {
        expect(m['eval.spec_turnover']).toEqual({ value: 100000 });
    });

    it('predator_share_cv is the standard deviation over the mean of 1/5, 1/4, 1/3', () => {
        const shares = [1 / 5, 1 / 4, 1 / 3];
        const mean = shares.reduce((x, y) => x + y) / 3;
        const sd = Math.sqrt(shares.reduce((x, s) => x + (s - mean) ** 2, 0) / 3);
        expect(m['eval.predator_share_cv'].value).toBeCloseTo(sd / mean, 12);
    });
});

describe('with no checkpoint', () => {
    it('every series metric is null', () => {
        const m = sourceRun().metrics();
        for (const name of ['population_mean', 'diversity', 'lineages_alive', 'predator_share_cv']) {
            expect(m[`eval.${name}`].value).toBeNull();
        }
    });
});

/**
 * Four agents sampled at tick 100, then three die with a motion sample behind them: X (age 1000, nothing eaten, no
 * child) in tick 3, in which Y also splits (one child; one item eaten); W (an item and 100 of bite energy) and V
 * (moving at top speed) in the last tick. Y dies in the last tick too.
 */
function runGrids() {
    const r = sourceRun({ over: { maturityTicks: 20 } });
    const [x, y, wSlot, v] = Array.from({ length: 4 }, () => r.spawn());
    r.jump(BURN_IN_TICKS + 98);
    r.tick((w) => {
        plantFood(w, y);
        plantFood(w, wSlot);
        w.biteEnergy[wSlot] = 100;
        w.vx[v] = w.config.maxVelocity;
    });
    r.tick();
    r.tick((w) => {
        starve(w, x, 1000);
        w.ageTicks[y] = 100;
        w.energy[y] = 1500;
    });
    r.tick((w) => {
        starve(w, y, 1000);
        starve(w, wSlot, 1000);
        starve(w, v, 1000);
    });
    return r.metrics();
}

describe('behaviour and motion grids', () => {
    const m = runGrids();

    it('behaviour_coverage fills the cells (bite share, children) of X (0, 0), Y (0, 9), W (5, 0), V (0, 0): 3 of 100', () => {
        expect(m['eval.behaviour_coverage']).toEqual({ value: 0.03 });
    });

    it('motion_coverage fills the cell of the still agents (0, 0) and the one of V: 2 of 100', () => {
        expect(m['eval.motion_coverage']).toEqual({ value: 0.02 });
    });
});
