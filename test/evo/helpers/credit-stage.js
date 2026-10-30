import { createFitnessV6 } from '../../../js/evo/fitness-v6.js';
import { createControllerBrain } from '../../../js/evo/controller-brain.js';
import { createLifeCounters, updateLifeCounters } from '../../../js/evo/life-counters.js';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { stageWorld } from '../../../js/evo/pool-discrimination-stage.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { step } from '../../../js/sim/step.js';

/** Staged-world specialisation indices: the forager and the predator (the one that can hunt). */
export const FORAGER = 0;
export const PREDATOR = 1;

/** The staged world's centre, for scenes laid out round it. */
export const CENTRE = Object.freeze({ x: 1500, y: 2000 });

/** Config that keeps a staged scene to its own agents: nobody splits or mates, so only the staged agents count. */
const NO_BIRTHS = Object.freeze({ splitMinEnergy: 1e9, mateRange: 0 });

/**
 * @typedef {object} Credits what the intent classifier and `fitnessV6` paid one agent, by term
 * @property {number} deliberateFood food energy eaten while closing on it on purpose
 * @property {number} chanceFood food energy eaten otherwise
 * @property {number} deliberateBite bite energy landed on prey the agent was pursuing
 * @property {number} chanceBite bite energy landed otherwise
 * @property {number} kills kills the world counted for the agent
 * @property {number} deliberateKills kills that ended a deliberate pursuit
 * @property {number} convergedKills kills by a pack that converged on the prey
 * @property {number} escapes bite episodes the agent survived after responding
 * @property {number} ageTicks the agent's age at the end
 * @property {number} skill `fitnessV6`'s skill group, before waste
 * @property {number} waste the waste charge before its cap
 * @property {number} lineage the lineage group as paid
 * @property {number} fitness the whole `fitnessV6`
 */

/**
 * Reads what `fitnessV6` paid one agent.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the agent's slot
 * @param {(slot: number) => {parts: Record<string, number>, fitness: number}} score the fitness scorer
 * @returns {Credits}
 */
function creditsOf(observer, slot, score) {
    const { intent } = observer;
    const { parts, fitness } = score(slot);
    return {
        deliberateFood: intent.deliberateFood[slot],
        chanceFood: intent.chanceFood[slot],
        deliberateBite: intent.deliberateBite[slot],
        chanceBite: intent.chanceBite[slot],
        kills: observer.kills[slot],
        deliberateKills: intent.deliberateKills[slot],
        convergedKills: intent.convergedKills[slot],
        escapes: intent.respondedEscape[slot],
        ageTicks: observer.ageTicks[slot],
        skill: parts.skill,
        waste: parts.waste,
        lineage: parts.lineage,
        fitness,
    };
}

/**
 * Plays one staged scene under scripted controllers with the eval observer attached, and reads what the intent
 * classifier and `fitnessV6` paid the agents. Slot 0 is the subject by convention, but every slot can be read.
 * @param {{stage: Omit<import('../../../js/evo/pool-discrimination-stage.js').Stage, 'seed'>, arms: string | {canHunt:
 *   string, rest: string}, ticks: number, seed?: number, config?: Record<string, any>,
 *   onTick?: (world: Record<string, any>) => void}} scene the staging, the arm of
 *   the predators and of the rest (a name of `SCRIPTED_CONTROLLERS`), the ticks to run, the seed (default 1) and
 *   config overrides over the staging knobs, and a hook called after every tick
 * @returns {{world: Record<string, any>, observer: Record<string, any>, credits: (slot: number) => Credits}}
 */
export function playCredit({ stage, arms, ticks, seed = 1, config = {}, onTick = () => {} }) {
    const { world } = stageWorld({ ...stage, seed, config: { ...NO_BIRTHS, ...stage.config, ...config } });
    const observer = createObserver(world.config, fork(createRng(seed), 'eval'));
    const counters = createLifeCounters(world.config);
    const fitness = createFitnessV6(counters);
    const parts = { skill: 0, waste: 0, lineage: 0 };
    const brain = createControllerBrain(world, fork(createRng(seed), 'scripted'), arms);
    const phases = { ...observerPhases(observer), brain };
    observe(observer, world, fitness);
    updateLifeCounters(counters, world);
    for (let t = 0; t < ticks; t++) {
        step(world, { brain }, phases);
        observe(observer, world, fitness);
        updateLifeCounters(counters, world);
        onTick(world);
    }
    const score = (/** @type {number} */ slot) => ({
        parts: fitness.parts(observer, slot, world.config, /** @type {any} */ (parts)),
        fitness: fitness(observer, slot, world.config),
    });
    return { world, observer, credits: (slot) => creditsOf(observer, slot, score) };
}
