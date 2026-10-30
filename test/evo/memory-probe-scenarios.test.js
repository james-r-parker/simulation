import { describe, expect, it } from 'vitest';
import { createRng, fork } from '../../js/sim/rng.js';
import {
    BLIND_TICKS,
    FOOD_VIEW_SHARE,
    LONG_BLIND_TICKS,
    REACH_TICKS,
    SCENARIOS,
    SIGHT_TICKS,
    around,
    heading,
} from '../../js/evo/memory-probe-scenarios.js';

const byName = (/** @type {string} */ name) => {
    const scenario = SCENARIOS.find((s) => s.name === name);
    if (scenario === undefined) {
        throw new Error(`no scenario ${name}`);
    }
    return scenario;
};
const stream = (/** @type {string} */ name, seed = 1) => fork(fork(createRng(seed), 'probe'), name);

describe('SCENARIOS', () => {
    it('lists the three scenarios and the long blindfold with their metrics', () => {
        expect(SCENARIOS.map((s) => [s.name, s.metric])).toEqual([
            ['food-then-blind', 'probe.food_reach'],
            ['predator-out-of-view', 'probe.flee_survival'],
            ['scent-after-sight-loss', 'probe.scent_follow'],
            ['food-then-blind@600', 'probe.food_reach@600'],
        ]);
    });

    it('stages the same trial from the same stream, and a different one from another seed', () => {
        for (const scenario of SCENARIOS) {
            const a = scenario.plan(stream(scenario.name), 300).stage;
            const b = scenario.plan(stream(scenario.name), 300).stage;
            const c = scenario.plan(stream(scenario.name, 2), 300).stage;
            expect(b).toEqual(a);
            expect(c).not.toEqual(a);
        }
    });

    it('puts the food in view and times the blindfold as the doc says', () => {
        /** @type {[string, number][]} */
        const cases = [
            ['food-then-blind', BLIND_TICKS],
            ['food-then-blind@600', LONG_BLIND_TICKS],
        ];
        for (const [name, blind] of cases) {
            const plan = byName(name).plan(stream(name), 300);
            const [food] = plan.stage.foods;
            const [subject] = plan.stage.agents;
            expect(Math.hypot(food.x - subject.x, food.y - subject.y)).toBeCloseTo(FOOD_VIEW_SHARE * 300, 6);
            expect(plan.timing).toMatchObject({ delay: SIGHT_TICKS, length: blind });
            expect(plan.maxTicks).toBe(SIGHT_TICKS + blind + REACH_TICKS);
            expect(plan.scent).toBe(false);
        }
    });

    it('zeroes the scent block too in predator-out-of-view, which starts 500 px away', () => {
        const plan = byName('predator-out-of-view').plan(stream('predator-out-of-view'), 300);
        const [subject, hunter] = plan.stage.agents;
        expect(plan.scent).toBe(true);
        expect(Math.hypot(hunter.x - subject.x, hunter.y - subject.y)).toBeCloseTo(500, 6);
    });

    it('needs a hunter only for scent-after-sight-loss, whose scent inputs stay on', () => {
        expect(SCENARIOS.filter((s) => s.needsHunter).map((s) => s.name)).toEqual(['scent-after-sight-loss']);
        expect(byName('scent-after-sight-loss').windowed).toBe(false);
    });
});

describe('heading and around', () => {
    it('draws headings in (-PI, PI) and places a point at a distance from the centre', () => {
        const rng = createRng(3);
        for (let i = 0; i < 50; i++) {
            expect(Math.abs(heading(rng))).toBeLessThanOrEqual(Math.PI);
        }
        const p = around(0.7, 100);
        expect(Math.hypot(p.x - 1500, p.y - 2000)).toBeCloseTo(100, 9);
    });
});
