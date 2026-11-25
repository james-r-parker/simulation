import { createConfig } from '../../js/sim/config.js';
import { arenaConfig } from '../../js/evo/chase-arena.js';

/**
 * The keys the step 5 adoption moved (body-genes T18, status-effects T18), at their values before it. A test whose
 * numbers were measured on the earlier defaults (a role budget anchor, a golden duel, a status-effect threshold) spreads
 * these under its own overrides, so its assertions keep their meaning; the new defaults are read by the tests of the
 * sim, the golden file and `role:budget --check`.
 */
export const PRE_STEP5 = Object.freeze({
    sprintStoreEnabled: false,
    entrantEnergy: 200,
    herdRunSpeed: 6.5,
    coldStackRate: 0,
    rallyThrust: 0,
    rallyBurn: 0,
    staggerThrust: 0,
    defenderRepelEnergy: 0,
    defenderRepelImpulse: 0,
    speedHeat: 0,
    sprintHeat: 0,
    sprintStoreHeat: 0,
    hearingCost: 0,
    noseCost: 0,
    smokeSightRange: 0,
    specialisations: Object.freeze({ predator: Object.freeze({ sprintDrainMultiplier: 1 }) }),
});

/**
 * @param {Record<string, any>} [overrides] config keys to change, which win over the pre-step 5 values
 * @returns {Record<string, any>} the overrides on top of `PRE_STEP5` (specialisations merge a spec at a time)
 */
export function preStep5(overrides = {}) {
    const spec = overrides.specialisations ?? {};
    const predator = { ...PRE_STEP5.specialisations.predator, ...spec.predator };
    return { ...PRE_STEP5, ...overrides, specialisations: { ...spec, predator } };
}

/**
 * @param {Record<string, any>} [overrides] config keys to change
 * @returns {Readonly<Record<string, any>>} a config as it was before the step 5 adoption, plus the overrides
 */
export function createPreStep5Config(overrides = {}) {
    return createConfig(preStep5(overrides));
}

/**
 * @param {Record<string, any>} [overrides] config keys to change
 * @returns {Readonly<Record<string, any>>} the chase arena's config as it was before the step 5 adoption, plus the overrides
 */
export function preStep5Arena(overrides = {}) {
    return arenaConfig(preStep5(overrides));
}
