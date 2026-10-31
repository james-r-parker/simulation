// The skill group of `fitnessV6` (fitness-and-selection.md "Fitness v6"): intake, the gate, survival, the role term,
// the two credits (escape and converged kill) and the waste charge. It carries the terms, constants and tests of `fitnessV2` (draft PR 120).
// `fitness-v6.js` composes it with the lineage and diversity groups. Pure: it reads the observer's per-slot
// intent counters and the life counters, and allocates nothing per call.

import { FITNESS_V1, specTerm } from './fitness.js';

/** The skill and waste constants of the doc's constants table, named so a change is one visible edit. */
export const FITNESS_V6_SKILL = Object.freeze({
    GATE: 500,
    SURVIVAL_RATE: 0.5,
    SURVIVAL_CAP: 30000,
    SURVIVAL_PER_DELIBERATE: 1,
    CREDIT_CAP: 0.25,
    ESCAPE: 60,
    CONVERGED_KILL: 50,
    IDLE_SIGNAL: 20,
    UNDEFENDED: 40,
    WASTE_CAP: 0.5,
});

/**
 * The role term before its cap: forager `deliberateFood`, predator `deliberateKills`, and the `fitnessV1` term for the
 * rest (reproducer `children`, scout `cells300`, defender `kinBitesAbsorbed`; 0 for any other specialisation).
 * @param {Record<string, any>} observer the eval observer
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot
 * @param {Record<string, any>} config the sim config
 * @returns {number}
 */
function roleTerm(observer, counters, slot, config) {
    const specs = config.specialisations;
    const spec = observer.spec[slot];
    if (spec === specs.forager.index) {
        return FITNESS_V1.FORAGER * observer.intent.deliberateFood[slot];
    }
    if (spec === specs.predator.index) {
        return FITNESS_V1.PREDATOR * observer.intent.deliberateKills[slot];
    }
    return specTerm(observer, counters, slot, config);
}

/**
 * @typedef {object} SkillTerms the gated terms of the skill group, before the gate
 * @property {number} survival the survival term
 * @property {number} role the role term, capped at the intake
 * @property {number} escape the escape credit, capped at the credit share of the intake
 * @property {number} kill the converged-kill credit, capped the same way
 */

/**
 * Deliberate food plus deliberate bite energy.
 * @param {Record<string, any>} intent the intent counters
 * @param {number} slot the slot
 * @returns {number}
 */
export function deliberateIntake(intent, slot) {
    return intent.deliberateFood[slot] + intent.deliberateBite[slot];
}

/**
 * Chance food plus chance bite energy.
 * @param {Record<string, any>} intent the intent counters
 * @param {number} slot the slot
 * @returns {number}
 */
export function chanceIntake(intent, slot) {
    return intent.chanceFood[slot] + intent.chanceBite[slot];
}

/**
 * Binds the life counters and the weights to the skill group's functions. `weights` is `FITNESS_V6_SKILL` merged with
 * any overrides (a screen arm varies a weight). `fitnessV6` computes `skill`, subtracts `waste` through `net` and
 * adds the other groups, which are gated by `gate`.
 * @param {Record<string, any>} counters the life counters
 * @param {Record<string, number>} [overrides] weights replacing `FITNESS_V6_SKILL` entries
 * @returns {{
 *   weights: Record<string, number>,
 *   intake: (observer: any, slot: number) => number,
 *   gate: (observer: any, slot: number) => number,
 *   gated: (observer: any, slot: number, config: any) => number,
 *   terms: (observer: any, slot: number, config: any, out: SkillTerms) => SkillTerms,
 *   skill: (observer: any, slot: number, config: any) => number,
 *   waste: (observer: any, slot: number) => number,
 *   net: (positive: number, waste: number) => number,
 * }}
 */
export function createSkillGroup(counters, overrides) {
    const w = { ...FITNESS_V6_SKILL, ...overrides };
    /** @type {(observer: any, slot: number) => number} */
    const intake = (observer, slot) => deliberateIntake(observer.intent, slot);
    /** @type {(observer: any, slot: number) => number} */
    const gate = (observer, slot) => Math.min(1, deliberateIntake(observer.intent, slot) / w.GATE);
    /** @type {(observer: any, slot: number, config: any, out: SkillTerms) => SkillTerms} */
    const terms = (observer, slot, config, out) => {
        const { intent } = observer;
        const deliberate = deliberateIntake(intent, slot);
        const total = intake(observer, slot);
        out.survival =
            w.SURVIVAL_RATE * Math.min(observer.ageTicks[slot], w.SURVIVAL_CAP, w.SURVIVAL_PER_DELIBERATE * deliberate);
        out.role = Math.min(roleTerm(observer, counters, slot, config), total);
        const cap = w.CREDIT_CAP * total;
        out.escape = Math.min(cap, w.ESCAPE * intent.respondedEscape[slot]);
        out.kill = Math.min(cap, w.CONVERGED_KILL * intent.convergedKills[slot]);
        return out;
    };
    const scratch = { survival: 0, role: 0, escape: 0, kill: 0 };
    /** @type {(observer: any, slot: number, config: any) => number} */
    const gated = (observer, slot, config) => {
        const t = terms(observer, slot, config, scratch);
        return t.survival + t.role + (t.escape + t.kill);
    };
    return {
        weights: w,
        intake,
        gate,
        gated,
        terms,
        skill: (observer, slot, config) =>
            intake(observer, slot) + gate(observer, slot) * gated(observer, slot, config),
        waste: (observer, slot) =>
            w.IDLE_SIGNAL * observer.intent.idleSignal[slot] + w.UNDEFENDED * observer.intent.undefendedBite[slot],
        net: (positive, waste) => Math.max(0, positive - Math.min(waste, w.WASTE_CAP * positive)),
    };
}
