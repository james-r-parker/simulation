// The contagion's config and constraints (docs/designs/disease.md, Config), kept separate from the shared validator.

import { int, num, positive, UNIT } from './config-rules.js';

/** The strain slots: one bit each in an agent's `immuneMask`. */
export const DISEASE_MAX_STRAINS = 8;

export const DISEASE_DEFAULTS = {
    diseaseSeedRate: 0.001,
    diseaseMinHosts: 30,
    diseaseRadius: 60,
    diseaseTransmission: 0.05,
    diseaseSpecificity: 0.8,
    diseaseDrain: 0.3,
    diseaseTicks: 600,
};

/** Rules for the contagion's config values; every key is a world rule. */
export const DISEASE_RULES = {
    diseaseSeedRate: UNIT,
    diseaseMinHosts: int(0),
    diseaseRadius: positive(),
    diseaseTransmission: UNIT,
    diseaseSpecificity: positive(),
    diseaseDrain: num(0),
    diseaseTicks: int(1),
};

/**
 * The events the contagion can push in one tick at most: one infection per agent, and an emergence and an extinction
 * per strain slot.
 * @param {Record<string, any>} config the merged simulation config
 * @returns {number} the extra event-ring records the contagion needs
 */
export function diseaseEventDemand(config) {
    return config.diseaseSeedRate > 0 ? config.maxAgents + 2 * DISEASE_MAX_STRAINS : 0;
}
