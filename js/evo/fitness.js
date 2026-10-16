// `fitnessV1`: energy gathered, offspring, survival and a capped specialisation term, from the observer and the
// life counters (evolution-rework.md "Fitness").

/** The v1 weights, named so a change is one visible edit. */
export const FITNESS_V1 = Object.freeze({
    OFFSPRING: 300,
    SURVIVAL_RATE: 0.02,
    SURVIVAL_CAP: 30000,
    SPEC_THRESHOLD: 500,
    FORAGER: 0.2,
    PREDATOR: 150,
    REPRODUCER: 150,
    SCOUT: 2,
    DEFENDER: 0.5,
});

/**
 * The spec term before the cap, by specialisation.
 * @param {Record<string, any>} observer the eval observer
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot
 * @param {Record<string, any>} config the sim config
 * @returns {number}
 */
function specTerm(observer, counters, slot, config) {
    const specs = config.specialisations;
    const spec = observer.spec[slot];
    if (spec === specs.forager.index) {
        return FITNESS_V1.FORAGER * observer.foodEnergy[slot];
    }
    if (spec === specs.predator.index) {
        return FITNESS_V1.PREDATOR * observer.kills[slot];
    }
    if (spec === specs.reproducer.index) {
        return FITNESS_V1.REPRODUCER * observer.children[slot];
    }
    if (spec === specs.scout.index) {
        return FITNESS_V1.SCOUT * counters.cells300[slot];
    }
    if (spec === specs.defender.index) {
        return FITNESS_V1.DEFENDER * counters.kinBitesAbsorbed[slot];
    }
    return 0;
}

/**
 * @param {Record<string, any>} observer the eval observer; only per-slot state is read
 * @param {Record<string, any>} counters the life counters, updated by `updateLifeCounters`
 * @param {number} slot the slot (valid after the slot's agent died, until it is reused)
 * @param {Record<string, any>} config the validated sim config
 * @returns {number} the v1 fitness
 */
export function fitnessV1(observer, counters, slot, config) {
    const food = observer.foodEnergy[slot];
    let score = food + observer.biteEnergy[slot];
    score += FITNESS_V1.OFFSPRING * observer.children[slot];
    score += FITNESS_V1.SURVIVAL_RATE * Math.min(observer.ageTicks[slot], FITNESS_V1.SURVIVAL_CAP);
    if (food >= FITNESS_V1.SPEC_THRESHOLD) {
        score += Math.min(specTerm(observer, counters, slot, config), food);
    }
    return score;
}

/**
 * Binds the life counters so v1 fits the evals `fitness(observer, slot, config)` signature.
 * @param {Record<string, any>} counters the life counters
 * @returns {(observer: any, slot: number, config: any) => number}
 */
export function createFitnessV1(counters) {
    return (observer, slot, config) => fitnessV1(observer, counters, slot, config);
}
