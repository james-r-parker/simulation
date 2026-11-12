// The eat-choice detectors in a scripted world (docs/designs/metric-trust.md, "Source tests"): the real `step` and
// `observe` run to the first checkpoint after burn-in, then agents are put on food items with BITE set and the observer
// reads that tick again, so the answer is known by construction. (Staging after the step matters: the step's own feed
// phase eats the food an agent can reach.)
//   forager A, B: store 0.4, in contact; A holds BITE, speed 3 (B does not hold it, speed 3)
//   forager C, C2: store 0.9, in contact, hold BITE, speed 1
//   forager D: store 0.85, in contact, no BITE, speed 1
//   forager F: store 0.99, in contact, holds BITE, speed 1 (above `satiationShare`: it cannot eat, so it is not counted)
//   forager G: store 0.9, holds BITE, no food within reach
//   predator H: store 0.9, in contact, holds BITE (a hunter is never read)

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { clearEvents } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { observe } from '../../js/evo/observer.js';
import { METRICS } from '../../js/evo/metric-registry/index.js';
import { namesOf } from './helpers/metric-registry.js';
import { plantFood } from './helpers/source-world.js';
import { FORAGER, PREDATOR, huntRun } from './helpers/hunt-scene.js';

const T = Math.ceil(BURN_IN_TICKS / 1000) * 1000;

/** @returns {{run: ReturnType<typeof huntRun>['run']}} the scripted run at its first checkpoint after burn-in */
function scriptedRun() {
    const { run, world, spawn } = huntRun({
        runTicks: T + 1000,
        over: { maxAgents: 32, maxFood: 8, digestTicks: 0, satiationShare: 0.95 },
    });
    run.jump(T - 1);
    const staged = [
        { spec: FORAGER, store: 0.4, bite: true, speed: 3, food: true },
        { spec: FORAGER, store: 0.4, bite: false, speed: 3, food: true },
        { spec: FORAGER, store: 0.9, bite: true, speed: 1, food: true },
        { spec: FORAGER, store: 0.9, bite: true, speed: 1, food: true },
        { spec: FORAGER, store: 0.85, bite: false, speed: 1, food: true },
        { spec: FORAGER, store: 0.99, bite: true, speed: 1, food: true },
        { spec: FORAGER, store: 0.9, bite: true, speed: 1, food: false },
        { spec: PREDATOR, store: 0.9, bite: true, speed: 1, food: true },
    ].map((a, i) => ({ ...a, slot: spawn(a.spec, undefined, { at: [100 + 100 * i, 500] }) }));
    run.tick();
    clearEvents(world.events);
    for (const a of staged) {
        world.energy[a.slot] = a.store * world.maxEnergyBySpec[a.spec];
        world.vx[a.slot] = a.speed;
        world.vy[a.slot] = 0;
        world.outputs[a.slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = a.bite ? 1 : -1;
        if (a.food) {
            plantFood(world, a.slot);
        }
    }
    observe(run.observer, world);
    return { run };
}

describe('the eat-choice detectors in a scripted world', () => {
    const { run } = scriptedRun();
    const m = run.metrics();

    it('stage the checkpoint they say', () => {
        expect(run.world.tick).toBe(T);
        const { eat } = run.observer.scenes;
        expect([eat.contact, eat.contactBite, eat.full, eat.fullBite]).toEqual([5, 3, 3, 2]);
    });

    it('read the bite share of the foragers that touch food they can eat: A, B, C, C2 and D, of whom A, C and C2 bite', () => {
        expect(m['eval.food_contact_bite_share']?.value).toBeCloseTo(3 / 5, 12);
    });

    it('read the share in the 0.8 band: C, C2 and D, of whom C and C2 bite', () => {
        expect(m['eval.full_contact_bite_share']?.value).toBeCloseTo(2 / 3, 12);
    });

    it('read the fat speed ratio: the foragers above the mean store move at 1 and those below it at 3', () => {
        expect(m['eval.fat_speed_ratio']?.value).toBeCloseTo(1 / 3, 12);
    });

    it('are registered with a source test that names them', () => {
        for (const name of namesOf('js/evo/scene-eat.js')) {
            expect(METRICS[/** @type {keyof typeof METRICS} */ (name)].tests.source).toBe(
                'test/evo/metric-source-eat.test.js',
            );
        }
    });
});

describe('the eat-choice detectors before any checkpoint', () => {
    it('are null with a reason in a run shorter than burn-in', () => {
        const { run, spawn } = huntRun({ runTicks: 10 });
        spawn(FORAGER);
        run.tick();
        expect(run.metrics()['eval.food_contact_bite_share']).toEqual({
            value: null,
            reason: 'no non-hunter in contact with edible food at a sample after burn-in',
        });
    });
});
