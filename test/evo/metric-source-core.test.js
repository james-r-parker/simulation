// Source tests, core family, event counters (docs/designs/metric-trust.md, T12): the real `step`, `observe` and
// `computeMetrics` on a scripted world (test/evo/helpers/source-world.js), each value known by construction. Every test
// plants one event in the final tick and one in a tick a body dies, and asserts both are counted. Series metrics are in
// metric-source-core-series.test.js, lineage and selection in metric-source-core-selection.test.js, trends and
// dominance in metric-source-core-trend.test.js.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { eaten, plantFood, sourceRun, starve } from './helpers/source-world.js';

const { IMMIGRANT, MATE, SPLIT } = BORN_CAUSE;

/** Makes the agent ready to split (mature, rich), so the step's split phase gives birth. */
function readyToSplit(/** @type {any} */ world, /** @type {number} */ slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
}

/**
 * Seven agents, three ticks. Tick 1: A and C eat one item. Tick 2 (three bodies die): B (age 10, no food), A (age 60,
 * fed), F (age 30, no food), and D splits. Tick 3, the last (two bodies die): C (age 80, fed), E (eaten, age 5); G
 * splits and D eats one item. Population after each step: 7, 5, 4 = 16 agent-ticks.
 */
function runLedger() {
    const r = sourceRun();
    const [a, b, c, d, e, f, g] = Array.from({ length: 7 }, () => r.spawn());
    r.tick((w) => {
        plantFood(w, a);
        plantFood(w, c);
    });
    r.tick((w) => {
        starve(w, b, 10);
        starve(w, a, 60);
        starve(w, f, 30);
        readyToSplit(w, d);
    });
    r.tick((w) => {
        starve(w, c, 80);
        w.ageTicks[e] = 4;
        eaten(w, e, d);
        readyToSplit(w, g);
        plantFood(w, d);
    });
    return r.metrics();
}

describe('rates and lifespans from a scripted run', () => {
    const m = runLedger();

    it('food_energy_per_1k counts the dead (A 100, C 100) and the living (D 100) over 16 agent-ticks', () => {
        expect(m['eval.food_energy_per_1k']).toEqual({ value: (300 / 16) * 1000 });
    });

    it('median_lifespan takes the mature deaths (ages 30, 60, 80) and not the immature ones', () => {
        expect(m['eval.median_lifespan']).toEqual({ value: 60 });
    });

    it('fed_median_lifespan takes the mature deaths that ate an item (ages 60, 80)', () => {
        expect(m['eval.fed_median_lifespan']).toEqual({ value: 70 });
    });

    it('births_per_1k counts the split in the tick three bodies die and the split in the last tick', () => {
        expect(m['eval.births_per_1k']).toEqual({ value: (2 / 16) * 1000 });
    });

    it('predation_per_1k counts the eaten death in the last tick', () => {
        expect(m['eval.predation_per_1k']).toEqual({ value: (1 / 16) * 1000 });
    });
});

describe('floor_episodes', () => {
    it('counts runs of floor ticks after burn-in: ticks +0 and +1 are one, +7 and the last (+15) one each', () => {
        const r = sourceRun({ over: { minAgents: 3, floorTrigger: 3 } });
        for (let i = 0; i < 3; i++) {
            r.spawn();
        }
        r.jump(BURN_IN_TICKS);
        const emptyTheWorld = (/** @type {any} */ w) => {
            for (let slot = 0; slot < w.alive.length; slot++) {
                if (w.alive[slot] === 1) {
                    w.energy[slot] = 0.0001;
                }
            }
        };
        for (let i = 0; i <= 15; i++) {
            r.tick([0, 1, 7, 15].includes(i) ? emptyTheWorld : undefined);
        }
        expect(r.metrics()['eval.floor_episodes']).toEqual({ value: 3 });
    });

    it('does not count a floor tick before burn-in', () => {
        const r = sourceRun({ over: { minAgents: 3, floorTrigger: 3 } });
        r.tick();
        expect(r.observer.births[BORN_CAUSE.FLOOR]).toBe(3);
        expect(r.metrics()['eval.floor_episodes']).toEqual({ value: 0 });
    });
});

/**
 * After burn-in: three immigrants (a mating pair and a splitter), a mating that gives birth in a tick a body dies, and
 * a split in the last tick (another body dies). Entries after burn-in: 3 immigrants + 1 mate birth + 2 splits.
 */
function runBirths() {
    const r = sourceRun({ over: { pregnancyTicks: 3, reproductionCooldown: 1000 } });
    r.jump(BURN_IN_TICKS);
    const [mother, father, splitter, doomed, doomedToo] = [IMMIGRANT, IMMIGRANT, IMMIGRANT, IMMIGRANT, IMMIGRANT].map(
        (cause) => r.spawn(cause),
    );
    const { world } = r;
    world.sex[mother] = 0;
    world.sex[father] = 1;
    world.ageTicks[mother] = 100;
    world.ageTicks[father] = 100;
    world.energy[mother] = 800;
    world.energy[father] = 800;
    world.x[father] = world.x[mother] + 20;
    world.y[father] = world.y[mother];
    r.want(mother, OUTPUT_INDEX.MATE);
    r.want(father, OUTPUT_INDEX.MATE);
    let birthTick = -1;
    for (let guard = 0; guard < 40 && birthTick < 0; guard++) {
        const due = world.pregnancy[mother] === 1;
        r.tick((w) => {
            if (due) {
                starve(w, doomed, 50);
            }
        });
        birthTick = due ? world.tick : -1;
    }
    r.release(mother, OUTPUT_INDEX.MATE);
    r.release(father, OUTPUT_INDEX.MATE);
    r.tick((w) => {
        readyToSplit(w, splitter);
        starve(w, doomedToo, 50);
    });
    return r;
}

describe('born_share and mating_share', () => {
    it('born_share is the mate and split births over every entry after burn-in: 2 of 7', () => {
        const r = runBirths();
        expect(r.observer.births[MATE]).toBe(1);
        expect(r.observer.births[SPLIT]).toBe(1);
        expect(r.metrics()['eval.born_share']).toEqual({ value: 2 / 7 });
    });

    it('mating_share is the mate births over the mate and split births: 1 of 2', () => {
        expect(runBirths().metrics()['eval.mating_share']).toEqual({ value: 1 / 2 });
    });
});
