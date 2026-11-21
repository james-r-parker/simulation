// The hunter choice metrics in a real world (docs/designs/metric-trust.md, "Source tests"; body-genes.md, T22): the real
// `step` and `observe` run planted scenes. A hunter faces two prey in view and bites one of them each trial, with BITE
// released for `GAP` ticks between trials so every bite is a new start. A hunter that picks the smaller or the slower
// body reads the choice; one that picks by a rule that ignores the body reads about none.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { MIN_STARTS } from '../../js/evo/scene-hunter-choice.js';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { SPEC } from '../../js/sim/specs.js';
import { FORAGER, PREDATOR, huntRun } from './helpers/hunt-scene.js';

const OVER = { maturityTicks: 100000, predatorRestTicks: 0 };
const GAP = 4;
const TRIALS = 2 * MIN_STARTS;
/** A pick pattern that ignores the bodies: 1 for the second prey, balanced over eight trials. */
const BLIND = [0, 1, 1, 0, 1, 0, 0, 1];

/**
 * @typedef {object} Prey one planted prey: its energy (which sets its size) and the speed it holds
 * @property {number} energy
 * @property {number} speed
 */

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {{x: number, y: number, energy: number, speed?: number}} pose where, how much energy and how fast
 * @returns {void}
 */
function pose(world, slot, { x, y, energy, speed = 0 }) {
    world.x[slot] = x;
    world.y[slot] = y;
    world.vx[slot] = speed;
    world.vy[slot] = 0;
    world.angle[slot] = 0;
    world.energy[slot] = energy;
    world.size[slot] = world.config.baseSize + energy / world.config.energyToSize;
}

/**
 * Runs the trials: each places the hunter, the chosen prey in its jaws and the other prey 150 px away in view, idles
 * `GAP` ticks, then bites one step.
 * @param {{prey: [Prey, Prey], pick: (trial: number) => 0 | 1, spec?: [number, number], trials?: number}} plan the two
 *   prey, which one the hunter bites in a trial, their specialisations and the number of trials
 * @returns {Record<string, any>} the metrics after the run
 */
function planted({ prey, pick, spec = [FORAGER, FORAGER], trials = TRIALS }) {
    const { run, world, spawn } = huntRun({ over: OVER });
    const hunter = spawn(PREDATOR);
    const slots = [spawn(spec[0]), spawn(spec[1])];
    run.jump(BURN_IN_TICKS);
    for (let trial = 0; trial < trials; trial++) {
        const chosen = pick(trial);
        for (let t = 0; t <= GAP; t++) {
            pose(world, hunter, { x: 200, y: 500, energy: 800 });
            slots.forEach((slot, k) => {
                const near = k === chosen;
                pose(world, slot, { x: near ? 230 : 200, y: near ? 500 : 650, ...prey[k] });
            });
            if (t === GAP) {
                run.want(hunter, OUTPUT_INDEX.BITE);
            }
            run.tick();
        }
        run.release(hunter, OUTPUT_INDEX.BITE);
    }
    return run.metrics();
}

const SIZES = /** @type {[Prey, Prey]} */ ([
    { energy: 200, speed: 0 },
    { energy: 600, speed: 0 },
]);
const SPEEDS = /** @type {[Prey, Prey]} */ ([
    { energy: 300, speed: 0 },
    { energy: 300, speed: 4 },
]);

describe('eval.hunter_size_choice and eval.hunter_slow_choice in a planted scene', () => {
    it('reads below 0 for a hunter that always bites the smaller body, and about 0 for one that ignores size', () => {
        const small = planted({ prey: SIZES, pick: () => 0 });
        const blind = planted({ prey: SIZES, pick: (trial) => /** @type {0 | 1} */ (BLIND[trial % 8]) });
        const gap = /** @type {number} */ (small['eval.hunter_size_choice']?.value);
        expect(gap).toBeLessThan(-1);
        expect(Math.abs(/** @type {number} */ (blind['eval.hunter_size_choice']?.value))).toBeLessThan(0.1 * -gap);
    });

    it('reads below 0 for a hunter that always bites the slower body, and about 0 for one that ignores speed', () => {
        const slow = planted({ prey: SPEEDS, pick: () => 0 });
        const blind = planted({ prey: SPEEDS, pick: (trial) => /** @type {0 | 1} */ (BLIND[trial % 8]) });
        const gap = /** @type {number} */ (slow['eval.hunter_slow_choice']?.value);
        expect(gap).toBeLessThan(-1);
        expect(Math.abs(/** @type {number} */ (blind['eval.hunter_slow_choice']?.value))).toBeLessThan(0.1 * -gap);
    });

    it('reads above 0 for a hunter that picks the larger body', () => {
        const large = planted({ prey: SIZES, pick: () => 1 });
        expect(large['eval.hunter_size_choice']?.value).toBeGreaterThan(1);
    });

    it('reads null under the least starts', () => {
        const few = planted({ prey: SIZES, pick: () => 0, trials: MIN_STARTS - 1 });
        expect(few['eval.hunter_size_choice']?.value).toBeNull();
        expect(few['eval.hunter_slow_choice']?.value).toBeNull();
    });
});

describe('eval.hunter_defender_bite_ratio in a planted scene', () => {
    const BODIES = /** @type {[Prey, Prey]} */ ([
        { energy: 300, speed: 0 },
        { energy: 300, speed: 0 },
    ]);
    const SPECS = /** @type {[number, number]} */ ([SPEC.DEFENDER, FORAGER]);

    it('reads 0 for a hunter that never bites the defender in view, and about 1 for one that ignores the spec', () => {
        const avoid = planted({ prey: BODIES, spec: SPECS, pick: () => 1 });
        expect(avoid['eval.hunter_defender_bite_ratio']).toEqual({ value: 0 });
        const blind = planted({
            prey: BODIES,
            spec: SPECS,
            pick: (trial) => /** @type {0 | 1} */ (BLIND[trial % 8]),
        });
        const ratio = /** @type {number} */ (blind['eval.hunter_defender_bite_ratio']?.value);
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.3);
    });

    it('is null with no defender in view', () => {
        const none = planted({ prey: BODIES, pick: () => 1 });
        expect(none['eval.hunter_defender_bite_ratio']?.value).toBeNull();
    });
});
