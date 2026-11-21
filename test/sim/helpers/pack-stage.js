// Hand-built packs for the tests of the pack effects (docs/designs/status-effects.md, "The social effects"): a caller and a
// kin hunter in call range, a chase with a prey two bites kill, and the signal phase run a tick at a time.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { signalAll } from '../../../js/sim/calls.js';
import { ENERGY_SOURCE, addEnergy } from '../../../js/sim/energy.js';
import { HEARD_FROM_STRIDE } from '../../../js/sim/agent-arrays.js';
import { FORAGER, PREDATOR, feedPairs, stage } from './bite-stage.js';
import { addAgent, rebuild, senseWorld } from './sense-world.js';

export const OVER = {
    callRadius: 300,
    callTicks: 10,
    alarmCost: 4,
    huntCallCost: 6,
    rallyThrust: 0.1,
    hoarseCost: 0.5,
};

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} a world with a caller (slot 0, a hunter at x 500) and a kin hunter 100 away (slot 1), the child of the caller
 */
export function pack(over = {}) {
    const w = senseWorld({ ...OVER, ...over });
    for (const [slot, x] of [
        [addAgent(w, 500, 500, 20), 500],
        [addAgent(w, 600, 500, 20), 600],
    ]) {
        w.x[slot] = x;
        w.spec[slot] = PREDATOR;
        addEnergy(w, slot, 100, ENERGY_SOURCE.INITIAL);
    }
    w.parentA[1] = w.genomeId[0];
    return w;
}

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {number} output an `OUTPUT_INDEX` value
 * @returns {void}
 */
export function hold(w, slot, output) {
    w.outputs[slot * OUTPUT_COUNT + output] = 1;
}

/**
 * Runs the signal phase once and counts the tick.
 * @param {any} w the world
 * @returns {void}
 */
export function tick(w) {
    signalAll(w, rebuild(w));
    w.tick += 1;
}

/**
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {string} name an effect's name
 * @returns {number} its stacks
 */
export const stacks = (w, slot, name) => w[`effect.${name}.stacks`][slot];

/**
 * Three hunters in a row and a prey that two bites kill: the caller (slot 0) rallied the killer (slot 1).
 * @param {Record<string, any>} [over] config overrides
 * @returns {{w: any, caller: number, killer: number, prey: number}} the staged world
 */
export function chase(over = {}) {
    const { w, slots } = stage({ rallyThrust: 0.1, answeredBite: 0.5, ...over }, [
        { x: 100, spec: PREDATOR, energy: 2000, bite: false },
        { x: 100, spec: PREDATOR, energy: 2000, y: 130 },
        { x: 110, spec: FORAGER, energy: 8 },
    ]);
    const [caller, killer, prey] = slots;
    w['effect.rallied.stacks'][killer] = 1;
    w['effect.hoarse.stacks'][caller] = 2;
    w.heardFrom.set([caller, w.genomeId[caller], 0], killer * HEARD_FROM_STRIDE + 3);
    return { w, caller, killer, prey };
}

/**
 * The caller bites the prey, then the killer takes it.
 * @param {any} w the world
 * @param {{caller: number, killer: number, prey: number}} bodies the slots
 * @param {number} [gap] the ticks between the two bites
 * @returns {void}
 */
export function shareKill(w, bodies, gap = 1) {
    w.outputs[bodies.caller * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    feedPairs(w, [bodies.caller, bodies.prey]);
    w.outputs[bodies.caller * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 0;
    w.tick += gap;
    feedPairs(w, [bodies.killer, bodies.prey]);
}
