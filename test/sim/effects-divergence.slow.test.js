// The re-pin of status-effects T2 is rounding only: for a few hundred ticks of real worlds, the thrust, turn and per-tick
// cost the effect path computes equal what the old rules (test/sim/helpers/legacy-motor.js) compute on the same body, to
// float rounding. Both read the same state, so any difference is the order of the multiplications, not a trajectory.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createPreStep5Config } from '../helpers/pre-step5.js';
import { LANE_ID, liveOf } from '../../js/sim/effects.js';
import { tickCost } from '../../js/sim/energy.js';
import { thrustOf } from '../../js/sim/physics.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';
import { golden } from './golden-run.js';
import { oldCost, oldThrust, oldTurn } from './helpers/legacy-motor.js';

/** The bound on |new - old| over the larger of the two: a few multiplications' rounding is about 1e-16. */
const BOUND = 1e-12; // measured: about 5e-16
const TICKS = 300;

/**
 * @param {number} a one value
 * @param {number} b the other
 * @returns {number} their relative difference, 0 when both are 0
 */
function relative(a, b) {
    const larger = Math.max(Math.abs(a), Math.abs(b));
    return larger === 0 ? 0 : Math.abs(a - b) / larger;
}

/**
 * Steps a world and, every tick, sets the effect path beside the old rules on every live body.
 * @param {Record<string, any>} overrides config overrides
 * @returns {{worst: {thrust: number, turn: number, cost: number}, compared: number, active: {fat: number, resting: number}}}
 *   the largest relative difference of each, the comparisons made and how many bodies had fat and a rest on
 */
function compareRun(overrides) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createPreStep5Config({ ...overrides, checkInvariants: false }), policy);
    const worst = { thrust: 0, turn: 0, cost: 0 };
    const active = { fat: 0, resting: 0 };
    let compared = 0;
    for (let t = 0; t < TICKS; t++) {
        step(world, policy);
        for (let i = 0; i < world.alive.length; i++) {
            if (world.alive[i] !== 1) {
                continue;
            }
            const rest = world.restTimer === undefined ? 0 : world.restTimer[i];
            const expected = oldThrust(world, i);
            const thrust = thrustOf(world, i);
            if (world.restTimer !== undefined) {
                world.restTimer[i] = rest; // thrustOf counts the timer down; the next tick should see it as it was
            }
            worst.thrust = Math.max(worst.thrust, relative(thrust, expected));
            worst.turn = Math.max(
                worst.turn,
                relative(
                    world.outputs[i * OUTPUT_COUNT + OUTPUT_INDEX.TURN] * liveOf(world, i, LANE_ID.maxTurn),
                    oldTurn(world, i),
                ),
            );
            worst.cost = Math.max(worst.cost, relative(tickCost(world, i), oldCost(world, i)));
            active.fat += world.energy[i] > 0 && world.lanes.fatSlowShare[i] > 0 ? 1 : 0;
            active.resting += rest > 0 ? 1 : 0;
            compared += 1;
        }
    }
    return { worst, compared, active };
}

describe('the effect path against the old rules', () => {
    const busy = golden.shortCases.find((/** @type {{name: string}} */ c) => c.name === 'busy').overrides;

    it.each([
        ['the busy world', busy],
        [
            'a world with a sprint store, sickness and disease',
            { ...busy, sprintStoreEnabled: true, diseaseSeedRate: 0.01 },
        ],
    ])(
        'agrees on thrust, turn and cost to float rounding in %s',
        (_, overrides) => {
            const { worst, compared, active } = compareRun(overrides);
            expect(compared).toBeGreaterThan(5000);
            expect(active.fat).toBeGreaterThan(0);
            expect(worst.thrust).toBeLessThan(BOUND);
            expect(worst.turn).toBeLessThan(BOUND);
            expect(worst.cost).toBeLessThan(BOUND);
        },
        scaleTimeout(60_000),
    );
});
