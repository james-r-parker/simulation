// Stages a tiny hand-built world for the pooled-ray discrimination scenes: a few agents, food and rocks, nothing else.

import { createConfig } from '../sim/config.js';
import { stageArena } from './chase-arena.js';

/** Food slots of a staged world: far above what any scene places, so a carcass always finds a slot. */
export const STAGE_MAX_FOOD = 48;

/**
 * The knobs that keep a staged world to the scene: no regrowth, no hazards, no reproduction pressure, one wall gap and
 * no refuges, and no eat-choice costs (grazing, fat, strike), so a scene scores the rule it is about; its rocks are
 * rewritten by `stageWorld`.
 */
const STAGE_CONFIG = Object.freeze({
    // The scenes place at most a handful of foods; the rest is headroom for carcasses. The default 3600 slots would be
    // walked by every hash build, every tick, in a world that holds one or two items.
    maxFood: STAGE_MAX_FOOD,
    worldWidth: 3000,
    worldHeight: 4000,
    maxAgents: 8,
    herdCount: 0,
    initialAgents: 0,
    minAgents: 0,
    initialFood: 0,
    foodRegrowPerArea: 0,
    fertileZoneMax: 0,
    foodPatchCount: 0,
    refugeCount: 0,
    coldMarginWidth: 0,
    wallGaps: 1,
    alarmThreshold: 0,
    huntCallThreshold: 0,
    capBirthsEnabled: false,
    digestTicks: 0,
    handlingTicks: 0,
    satiationShare: 0,
    grazeThrust: 1,
    fatSlowShare: 0,
    strikeMissCost: 0,
    hebbianRate: 0,
    specMutationRate: 0,
    checkInvariants: false,
});

/**
 * @typedef {object} StagedAgent
 * @property {number} x centre x
 * @property {number} y centre y
 * @property {number} angle heading in radians
 * @property {number} spec the specialisation index (0 forager, 1 predator)
 * @property {number} energy starting energy, at least the config's `initialEnergy` (energy is only added)
 * @property {number} [baseSize] the agent's base size (default: the config's `baseSize`); size is this plus energy / `energyToSize`
 * @property {Float32Array} [weights] the brain row the agent is born with (default: all zero)
 * @property {[number, number]} [parents] the agent's `parentA` and `parentB` ids (default `[0, 0]`; a shared nonzero
 *   id makes two agents kin)
 * @property {number} [vx] the agent's starting velocity x (default 0); what a ray's speed and closing lanes read
 * @property {number} [vy] the agent's starting velocity y (default 0)
 */

/**
 * @typedef {object} Stage
 * @property {{x: number, y: number, hue?: number, toxicity?: number}[]} foods food centres, optional hue and optional
 *   toxicity in [0, 1] (default 0)
 * @property {{x: number, y: number, r: number}[]} rocks rock centres and radii
 * @property {StagedAgent[]} agents agents by slot; slot 0 is the one the scene scores
 * @property {number} seed the world seed
 * @property {Record<string, any>} [config] config keys applied over the staging knobs (the probes restore the rules a
 *   genome's behaviour depends on)
 */

/**
 * Builds the world: the rocks, the food items and the agents in slot order, through the one stager (`stageArena`).
 * @param {Stage} stage what to place
 * @returns {{world: any, policy: any}} the world and the policy to step it with
 * @throws {Error} when the world has too few rock slots for the stage
 */
export function stageWorld({ foods, rocks, agents, seed, config = {} }) {
    return stageArena(createConfig({ ...STAGE_CONFIG, ...config, seed }), agents, { foods, rocks, atRest: false });
}
