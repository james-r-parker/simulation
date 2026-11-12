// Source tests, core family, trends, dominance and the archive (docs/designs/metric-trust.md, T12): meals eaten in real
// steps (an agent thrusting at an item, or an item that appears under it) across the 8 windows after burn-in, and
// checkpoints of a scripted world.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { CELLS, createArchive, offer } from '../../js/evo/archive.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { plantFood, sourceRun, starve } from './helpers/source-world.js';

const WINDOW = 400;
const RUN_TICKS = BURN_IN_TICKS + 8 * WINDOW;
/** Steps of full thrust at a 10-radius item 130 ahead: it is eaten in the 19th or just after, and the history flushes. */
const APPROACH = 19;
const FLUSH = 20;

/**
 * Deliberate meals and chance meals per window. A deliberate one: the eater faces an item 130 ahead and thrusts at it
 * for `APPROACH` steps. A chance one: an item appears under it. The last meal of the run is a chance meal in the
 * last tick; a body dies in the tick of the first chance meal of window 3.
 * @param {[number, number][]} meals `[deliberate, chance]` for each of the 8 windows
 * @returns {Record<string, any>} the metrics
 */
function runMeals(meals) {
    const r = sourceRun({ runTicks: RUN_TICKS, over: { rayCount: 16 } });
    const eater = r.spawn();
    const doomed = r.spawn();
    const { world } = r;
    r.jump(BURN_IN_TICKS);
    meals.forEach(([deliberate, chance], k) => {
        const start = BURN_IN_TICKS + k * WINDOW;
        r.jump(start);
        r.tick(); // the first step of the window takes its boundary snapshot
        const kinds = [...Array(deliberate).fill('deliberate'), ...Array(chance).fill('chance')];
        kinds.forEach((kind, i) => {
            const last = k === 7 && i === kinds.length - 1;
            r.jump(last ? RUN_TICKS - 1 : start + 50 + 90 * i);
            world.energy[eater] = 800;
            if (kind === 'chance') {
                r.tick((w) => {
                    plantFood(w, eater);
                    if (k === 3 && i === deliberate) {
                        starve(w, doomed, 50);
                    }
                });
                return;
            }
            world.x[eater] = 200;
            world.y[eater] = 500;
            world.angle[eater] = 0;
            world.vx[eater] = 0;
            world.vy[eater] = 0;
            const item = spawnFoodItem(world);
            world.foodX[item] = 330;
            world.foodY[item] = 500;
            world.foodValue[item] = world.config.foodEnergy;
            world.foodTox[item] = 0;
            world.foodRadius[item] = 10;
            r.want(eater, OUTPUT_INDEX.THRUST);
            r.want(eater, OUTPUT_INDEX.BITE); // a forager eats only while it bites (eat-choice G1)
            for (let step = 0; step < APPROACH; step++) {
                r.tick();
            }
            r.release(eater, OUTPUT_INDEX.THRUST);
            for (let idle = 0; idle < FLUSH; idle++) {
                r.tick(); // the closing history is 16 observed ticks long
            }
            r.release(eater, OUTPUT_INDEX.BITE);
        });
    });
    expect(r.observer.ticks).toBe(RUN_TICKS);
    return r.metrics();
}

describe('deliberate_food_trend and skill_trend', () => {
    it('is the late windows (1/2, 3/4) minus the early ones (1/2, 1/4): 0.25, and the skill trend is the same', () => {
        const m = runMeals([
            [1, 1],
            [1, 3],
            [2, 2],
            [2, 2],
            [2, 2],
            [2, 2],
            [1, 1],
            [3, 1],
        ]);
        expect(m['eval.deliberate_food_trend'].value).toBeCloseTo(0.25, 12);
        expect(m['eval.pursuit_trend'].value).toBeNull();
        expect(m['eval.evasion_trend'].value).toBeNull();
        expect(m['eval.skill_trend'].value).toBeCloseTo(0.25, 12);
    });

    it('reads 0 when every window has the same share, and null when a compared window has no meal', () => {
        const same = Array.from({ length: 8 }, () => /** @type {[number, number]} */ ([1, 1]));
        expect(runMeals(same)['eval.deliberate_food_trend'].value).toBeCloseTo(0, 12);
        same[1] = [0, 0];
        expect(runMeals(same)['eval.deliberate_food_trend']).toEqual({
            value: null,
            reason: 'a compared span has no food',
        });
    });

    it('is null on a run that was not told its length', () => {
        const r = sourceRun();
        r.spawn();
        r.tick();
        expect(r.metrics()['eval.deliberate_food_trend'].value).toBeNull();
    });
});

/** Entropy-based effective number of a pooled count table. */
const effective = (/** @type {number[]} */ counts) => {
    const total = counts.reduce((a, b) => a + b);
    return Math.exp(-counts.reduce((h, n) => h + (n / total) * Math.log(n / total), 0));
};

describe('dominance metrics', () => {
    /**
     * Agents A (spec 0, lineage 1), B (0, 2), C (1, 2), D (2, 3). Checkpoint before burn-in (not pooled), at 10000 (all
     * four), after D dies (A, B, C) and, with C dead in the last tick, A and B.
     */
    function run() {
        const r = sourceRun();
        const { world } = r;
        const [a, b, c, d] = Array.from({ length: 4 }, () => r.spawn());
        [a, b, c, d].forEach((slot, i) => {
            world.spec[slot] = [0, 0, 1, 2][i];
            world.lineageId[slot] = [1, 2, 2, 3][i];
        });
        r.jump(BURN_IN_TICKS - 1);
        r.check();
        r.jump(BURN_IN_TICKS);
        r.check();
        r.tick((w) => starve(w, d, 50));
        r.check();
        r.tick((w) => starve(w, c, 50));
        r.check();
        return r.metrics();
    }

    it('spec_dominance and spec_effective pool the specs of the three checkpoints: 6, 2, 1', () => {
        const m = run();
        expect(m['eval.spec_dominance'].value).toBeCloseTo(6 / 9, 12);
        expect(m['eval.spec_effective'].value).toBeCloseTo(effective([6, 2, 1]), 9);
    });

    it('lineage_dominance and lineage_effective pool the lineages: 3, 5, 1', () => {
        const m = run();
        expect(m['eval.lineage_dominance'].value).toBeCloseTo(5 / 9, 12);
        expect(m['eval.lineage_effective'].value).toBeCloseTo(effective([3, 5, 1]), 9);
    });

    it('are null with no checkpoint after burn-in', () => {
        const r = sourceRun();
        r.spawn();
        r.check();
        expect(r.metrics()['eval.spec_dominance'].value).toBeNull();
    });
});

describe('archive metrics', () => {
    const layout = brainLayout({ rayCount: 2, brainHidden: 4 });
    const row = new Float32Array(layout.weightCount);

    it('coverage and qd_score count the occupied cells and the mean fitness of their elites over all 500 cells', () => {
        const archive = createArchive(layout);
        const place = (
            /** @type {number} */ id,
            /** @type {number} */ spec,
            /** @type {number} */ cell,
            /** @type {number} */ fitness,
        ) => offer(archive, { id, spec, cell, fitness, sigma: 0.1, row });
        place(1, 0, 1, 50);
        place(2, 3, 2, 150);
        const r = sourceRun();
        r.spawn();
        r.tick();
        const m = r.metrics({ archive });
        expect(m['eval.coverage']).toEqual({ value: 2 / (5 * CELLS) });
        expect(m['eval.qd_score']).toEqual({ value: 200 / (5 * CELLS) });
    });

    it('are null without an archive', () => {
        const m = sourceRun().metrics();
        expect(m['eval.coverage'].value).toBeNull();
        expect(m['eval.qd_score'].value).toBeNull();
    });
});
