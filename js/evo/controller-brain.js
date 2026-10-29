// A `brain` phase driven by scripted controllers chosen by name: one for every agent, or one for the agents with
// `canHunt` and one for the rest. The arm `random` is no controller: its agents keep the outputs their own brain
// computes, so with the random brain (`js/evo/policies/random-brain.js`) it is the untrained baseline.

import { forwardAll } from '../sim/brain.js';
import { OUTPUT_COUNT } from '../sim/brain-layout.js';
import { hunterTable } from './hunter-table.js';
import { SCRIPTED_CONTROLLERS } from './scripted.js';

/** The arm name that leaves an agent to its own brain. */
export const RANDOM_ARM = 'random';

/**
 * @param {string} name a key of `SCRIPTED_CONTROLLERS`, or `RANDOM_ARM`
 * @returns {void}
 * @throws {Error} when the name is neither, listing the known controllers
 */
export function assertArm(name) {
    if (name !== RANDOM_ARM && !Object.hasOwn(SCRIPTED_CONTROLLERS, name)) {
        throw new Error(
            `Unknown controller "${name}"; known: ${[RANDOM_ARM, ...Object.keys(SCRIPTED_CONTROLLERS)].join(', ')}`,
        );
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {import('../sim/rng.js').Rng} rng the `scripted` stream, the only source of randomness the controllers use
 * @param {string | {canHunt: string, rest: string}} arms one arm for every agent, or an arm for the agents with
 *   `canHunt` and one for the rest
 * @returns {(world: any) => void} the phase body: it computes the outputs of every alive agent
 */
export function createControllerBrain(world, rng, arms) {
    const { canHunt, rest } = typeof arms === 'string' ? { canHunt: arms, rest: arms } : arms;
    assertArm(canHunt);
    assertArm(rest);
    const build = (/** @type {string} */ name) =>
        name === RANDOM_ARM
            ? null
            : SCRIPTED_CONTROLLERS[/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name)]({ world, rng });
    const huntPhase = build(canHunt);
    const restPhase = build(rest);
    const table = hunterTable(world.config);
    const own = new Float32Array(world.outputs.length);
    const merged = new Float32Array(world.outputs.length);

    /**
     * Copies the rows of the alive agents of one group from `source` into `merged`.
     * @param {Float32Array} source the outputs to copy from
     * @param {number} hunters 1 for the agents with `canHunt`, 0 for the rest
     */
    function take(source, hunters) {
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1 && table[world.spec[slot]] === hunters) {
                const o = slot * OUTPUT_COUNT;
                merged.set(source.subarray(o, o + OUTPUT_COUNT), o);
            }
        }
    }

    /**
     * Runs one group's arm (or reads its own brain's outputs for `random`) and keeps the group's rows.
     * @param {((world: any) => void) | null} phase the arm's controller, null for `random`
     * @param {number} hunters 1 for the agents with `canHunt`, 0 for the rest
     * @param {any} w the world
     */
    function runGroup(phase, hunters, w) {
        if (phase === null) {
            take(own, hunters);
        } else {
            phase(w);
            take(w.outputs, hunters);
        }
    }

    return (w) => {
        if (huntPhase === null || restPhase === null) {
            forwardAll(w);
            own.set(w.outputs);
        }
        runGroup(huntPhase, 1, w);
        runGroup(restPhase, 0, w);
        for (let slot = 0; slot < w.alive.length; slot++) {
            if (w.alive[slot] === 1) {
                const o = slot * OUTPUT_COUNT;
                w.outputs.set(merged.subarray(o, o + OUTPUT_COUNT), o);
            }
        }
    };
}
