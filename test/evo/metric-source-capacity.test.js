// Source answers for the capacity detectors (carrying-capacity.md T2): a scripted world of real steps, observer reads and
// computeMetrics, whose cap share, food standing share and density slopes are known by construction.
//
// Seven checkpoints from burn-in hold 8, 16, 24, 32, 40, 48 and 64 agents. Five agents (the eaters) eat one 10-energy meal in
// every window and never die; in the window that starts at population x, x * x / 64 of the others starve, so the starvation
// per agent is x / 64 (slope 1/64) and the food taken per agent is 50 / x. Three food items stand all run, out of reach:
// two edible and one toxic, of a maxFood of 12.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { plantFood, sourceRun, starve } from './helpers/source-world.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;
const POPS = [8, 16, 24, 32, 40, 48, 64];
const EATERS = 5;
const MEAL = 10;

/** @param {number[]} x the regressor @param {number[]} y the response @returns {number} the least-squares slope */
function cramer(x, y) {
    const n = x.length;
    const sum = (/** @type {number[]} */ a) => a.reduce((s, v) => s + v, 0);
    const sxy = sum(x.map((v, i) => v * y[i]));
    return (n * sxy - sum(x) * sum(y)) / (n * sum(x.map((v) => v * v)) - sum(x) ** 2);
}

/** @returns {ReturnType<typeof sourceRun>} the scripted run after its last checkpoint */
function scriptedRun() {
    const run = sourceRun({ runTicks: T + 7000, over: { maxAgents: 110, maxFood: 12 } });
    const { world } = run;
    const eaters = Array.from({ length: EATERS }, () => run.spawn());
    const others = Array.from({ length: POPS[0] - EATERS }, () => run.spawn());
    for (let i = 0; i < 3; i++) {
        plantFood(world, eaters[0]);
        const item = world.foodAlive.findLastIndex((/** @type {number} */ alive) => alive === 1);
        world.foodX[item] = 5 + i;
        world.foodY[item] = 5;
        world.foodTox[item] = i === 2 ? 1 : 0;
    }
    run.jump(T - 1);
    run.tick();
    for (let j = 1; j < POPS.length; j++) {
        const x = POPS[j - 1];
        const starving = (x * x) / 64;
        // Jump first: a spawn observes the world again, and must not do it on a checkpoint tick.
        run.jump(T + 1000 * j - 1);
        for (let i = 0; i < POPS[j] - x + starving; i++) {
            others.push(run.spawn());
        }
        const victims = others.splice(0, starving);
        run.tick((w) => {
            eaters.forEach((slot) => plantFood(w, slot, MEAL));
            victims.forEach((slot) => starve(w, slot, 100));
        });
    }
    return run;
}

describe('the capacity detectors in a scripted world', () => {
    const run = scriptedRun();
    const m = run.metrics();

    it('script the populations they say', () => {
        expect(run.observer.scenes.capacity.log.pop.subarray(0, 7)).toEqual(Float64Array.from(POPS));
        expect(run.observer.deathsByCause[0]).toBe(1 + 4 + 9 + 16 + 25 + 36);
    });

    it('eval.cap_share counts the one checkpoint at maxAgents less splitCapMargin (60) or more', () => {
        expect(m['eval.cap_share']).toEqual({ value: 1 / 7 });
    });

    it('eval.food_standing_share counts the two edible items, not the toxic one, over maxFood', () => {
        expect(m['eval.food_standing_share']?.value).toBeCloseTo(2 / 12, 12);
    });

    it('eval.density_starve_slope reads 1/64: the starvation per agent rises with the population', () => {
        expect(m['eval.density_starve_slope']?.value).toBeCloseTo(1 / 64, 12);
    });

    it('eval.density_intake_slope reads the slope of 50 / x: the food taken per agent falls with the population', () => {
        const xs = POPS.slice(0, 6);
        expect(m['eval.density_intake_slope']?.value).toBeCloseTo(
            cramer(
                xs,
                xs.map((x) => (EATERS * MEAL) / x),
            ),
            12,
        );
        expect(m['eval.density_intake_slope']?.value).toBeLessThan(0);
    });

    it('are registered with a source test that names them', () => {
        for (const name of ['cap_share', 'food_standing_share', 'density_starve_slope', 'density_intake_slope']) {
            expect(METRICS[/** @type {keyof typeof METRICS} */ (`eval.${name}`)].tests.source).toBe(
                'test/evo/metric-source-capacity.test.js',
            );
        }
    });
});

describe('the capacity detectors before any checkpoint', () => {
    it('are null with a reason in a run shorter than burn-in', () => {
        const run = sourceRun({ runTicks: 10 });
        run.spawn();
        run.tick();
        expect(run.metrics()['eval.cap_share']).toEqual({
            value: null,
            reason: 'no 1000-tick checkpoint after burn-in',
        });
    });
});
