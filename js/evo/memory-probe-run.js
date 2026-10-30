// Runs one probe trial: stages the arena, drives the subject (a genome's brain or a reference controller) under a
// control, scripts the other agents, and returns whether the trial scored.

import { forwardAll } from '../sim/brain.js';
import { OUTPUT_COUNT, TRAIT_INDEX, brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { step } from '../sim/step.js';
import { traitValue } from '../sim/traits.js';
import { applyControl, createControl } from './memory-probe-controls.js';
import { stageWorld } from './pool-discrimination-stage.js';
import { COMBAT_CONTROLLERS } from './scripted-combat.js';

/** The rules a genome's behaviour depends on: the arena restores them from the config over its staging knobs. */
const RULE_KEYS = Object.freeze([
    'hebbianRate',
    'alarmThreshold',
    'huntCallThreshold',
    'digestTicks',
    'handlingTicks',
    'satiationShare',
]);

/**
 * @typedef {object} Subject the agent under test
 * @property {string} name a label for the log and the report
 * @property {number} id the genome id the log names (0 for a reference)
 * @property {number | null} spec the specialisation index; null for a reference, which takes the scenario's
 * @property {Float32Array | null} weights the genome's brain row; null for a reference controller
 * @property {((world: Record<string, any>) => void) | null} act a reference controller's `brain` phase body, writing
 *   the outputs of every alive agent; null for a genome, which runs its own brain
 */

/**
 * @typedef {object} Plan one staged trial
 * @property {{foods: {x: number, y: number}[], rocks: {x: number, y: number, r: number}[], agents: Record<string, any>[]}} stage
 *   the food, rocks and agents; each agent has a `role` (`subject`, `hunter` or `prey`)
 * @property {import('./memory-probe-controls.js').Timing | null} timing the blindfold window's clock, if any
 * @property {boolean} scent whether the window also zeroes the scent block
 * @property {number} maxTicks the longest the trial runs
 * @property {(world: Record<string, any>, control: import('./memory-probe-controls.js').Control) => boolean} done
 *   whether the trial is over, read after each step
 * @property {(world: Record<string, any>) => boolean} won whether the trial scored
 */

/**
 * @param {Record<string, any>} overrides the probe's config overrides
 * @returns {Record<string, any>} the overrides with the rules a genome's behaviour depends on restored over the arena
 */
export function arenaConfig(overrides) {
    const base = createConfig(overrides);
    return { ...overrides, ...Object.fromEntries(RULE_KEYS.map((key) => [key, base[key]])) };
}

/**
 * @param {{spec: number, weights: Float32Array | null}} subject the subject's specialisation and genome
 * @param {Readonly<Record<string, any>>} config the config
 * @returns {number} the subject's ray length: its specialisation's `visionRange` times its vision trait
 */
export function viewOf(subject, config) {
    const range = Object.values(config.specialisations).find((s) => /** @type {any} */ (s).index === subject.spec);
    const gene = subject.weights === null ? 0 : subject.weights[brainLayout(config).traitStart + TRAIT_INDEX.VISION];
    return /** @type {any} */ (range).visionRange * traitValue(gene);
}

/**
 * @param {Record<string, any>} world the world
 * @param {readonly number[]} slots the slots a controller drives
 * @param {(world: Record<string, any>) => void} act a controller that writes every alive agent's outputs
 * @param {Float32Array} saved scratch the size of `world.outputs`
 * @returns {void}
 */
function driveSlots(world, slots, act, saved) {
    saved.set(world.outputs);
    act(world);
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1 && !slots.includes(slot)) {
            const o = slot * OUTPUT_COUNT;
            world.outputs.set(saved.subarray(o, o + OUTPUT_COUNT), o);
        }
    }
}

/**
 * @param {Record<string, any>} world the world
 * @param {import('../sim/rng.js').Rng} rng the `scripted` stream
 * @param {{subject: Subject, control: import('./memory-probe-controls.js').Control, slots: Record<string, number[]>}} run
 *   the subject, its control and the slots by role
 * @returns {(world: Record<string, any>) => void} the `brain` phase body
 */
function createBrain(world, rng, { subject, control, slots }) {
    const saved = new Float32Array(world.outputs.length);
    const scripted = [
        { slots: slots.hunter ?? [], act: COMBAT_CONTROLLERS.hunter({ world, rng }) },
        { slots: slots.prey ?? [], act: COMBAT_CONTROLLERS.fleer({ world, rng }) },
    ].filter((group) => group.slots.length > 0);
    return (w) => {
        for (const slot of slots.subject) {
            if (w.alive[slot] === 1) {
                applyControl(w, slot, control);
            }
        }
        forwardAll(w);
        if (subject.act !== null) {
            driveSlots(w, slots.subject, subject.act, saved);
        }
        for (const group of scripted) {
            driveSlots(w, group.slots, group.act, saved);
        }
    };
}

/**
 * @param {Plan['stage']} stage the staged agents
 * @param {Subject} subject the subject
 * @returns {Record<string, number[]>} the slots of each role
 */
function slotsByRole(stage, subject) {
    /** @type {Record<string, number[]>} */
    const slots = { subject: [] };
    stage.agents.forEach((/** @type {any} */ agent, /** @type {number} */ slot) => {
        (slots[agent.role] ??= []).push(slot);
        if (agent.role === 'subject') {
            agent.spec = subject.spec ?? agent.spec;
            agent.weights = subject.weights ?? undefined;
        }
    });
    return slots;
}

/**
 * Runs one trial of a plan.
 * @param {{plan: Plan, subject: Subject, controlSpec: {name: string, blind?: boolean, amnesia?: boolean, kinBlind?: boolean}, seed: number,
 *   config: Record<string, any>}} trial the plan, the subject, the control (`createControl`'s spec, its timing taken
 *   from the plan), the world seed and the probe's config overrides
 * @returns {boolean} whether the trial scored
 */
export function playTrial({ plan, subject, controlSpec, seed, config }) {
    const slots = slotsByRole(plan.stage, subject);
    const arena = arenaConfig(config);
    const { world, policy } = stageWorld({
        ...plan.stage,
        agents: /** @type {any} */ (plan.stage.agents),
        seed,
        config: arena,
    });
    const control = createControl(world.config, { timing: plan.timing, scent: plan.scent, ...controlSpec });
    const brain = createBrain(world, fork(createRng(seed), 'scripted'), { subject, control, slots });
    for (let t = 0; t < plan.maxTicks; t++) {
        step(world, policy, { brain });
        if (plan.done(world, control)) {
            break;
        }
    }
    return plan.won(world);
}
