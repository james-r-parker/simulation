// `fitnessV1`: energy gathered, offspring, survival and a capped specialisation term, from the observer and the
// life counters (evolution-rework.md "Fitness").

/** The v1 weights, named so a change is one visible edit. */
export const FITNESS_V1 = Object.freeze({
    OFFSPRING: 300,
    SURVIVAL_RATE: 0.5,
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
    // Survival is paid only once the agent has eaten SPEC_THRESHOLD, so living long without eating does not score.
    if (food >= FITNESS_V1.SPEC_THRESHOLD) {
        score += FITNESS_V1.SURVIVAL_RATE * Math.min(observer.ageTicks[slot], FITNESS_V1.SURVIVAL_CAP);
    }
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

/** The v2 weights (predator-prey.md "Fitness v2"), named so a change is one visible edit. */
export const FITNESS_V2 = Object.freeze({
    CHANCE_WEIGHT: 0.25,
    OFFSPRING: 300,
    GATE: 500,
    SURVIVAL_RATE: 0.5,
    SURVIVAL_CAP: 30000,
    SURVIVAL_PER_DELIBERATE: 10,
    CREDIT_CAP: 0.25,
    WASTE_CAP: 0.5,
    ESCAPE: 60,
    CONVERGED_KILL: 50,
    ALARM: 40,
    HUNT_CALL: 40,
    IDLE_SIGNAL: 20,
    UNDEFENDED: 40,
});

/**
 * The v1 spec term, except that the forager's reads deliberate food and the predator's deliberate kills.
 * @param {Record<string, any>} observer the eval observer
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot
 * @param {Record<string, any>} config the sim config
 * @returns {number}
 */
function specTermV2(observer, counters, slot, config) {
    const specs = config.specialisations;
    const spec = observer.spec[slot];
    const { intent } = observer;
    if (spec === specs.forager.index) {
        return FITNESS_V1.FORAGER * intent.deliberateFood[slot];
    }
    if (spec === specs.predator.index) {
        return FITNESS_V1.PREDATOR * intent.deliberateKills[slot];
    }
    return specTerm(observer, counters, slot, config);
}

/**
 * The four credits, each capped at `CREDIT_CAP x intake`.
 * @param {Record<string, any>} intent the intent counters
 * @param {number} slot the slot
 * @param {number} intake the chance-discounted intake
 * @returns {number}
 */
function creditTerms(intent, slot, intake) {
    const cap = FITNESS_V2.CREDIT_CAP * intake;
    return (
        Math.min(cap, FITNESS_V2.ESCAPE * intent.respondedEscape[slot]) +
        Math.min(cap, FITNESS_V2.CONVERGED_KILL * intent.convergedKills[slot]) +
        Math.min(cap, FITNESS_V2.ALARM * intent.alarmCredits[slot]) +
        Math.min(cap, FITNESS_V2.HUNT_CALL * intent.huntCredits[slot])
    );
}

/**
 * Pays deliberate behaviour from the intent counters, discounts chance intake and charges waste.
 * @param {Record<string, any>} observer the eval observer; `observer.intent` holds the intent counters
 * @param {Record<string, any>} counters the life counters
 * @param {number} slot the slot (valid after the slot's agent died, until it is reused)
 * @param {Record<string, any>} config the validated sim config
 * @returns {number} the v2 fitness, at least 0
 */
export function fitnessV2(observer, counters, slot, config) {
    const { intent } = observer;
    const deliberate = intent.deliberateFood[slot] + intent.deliberateBite[slot];
    const chance = intent.chanceFood[slot] + intent.chanceBite[slot];
    const intake = deliberate + FITNESS_V2.CHANCE_WEIGHT * chance;
    const base = intake + FITNESS_V2.OFFSPRING * observer.children[slot];
    const survival =
        FITNESS_V2.SURVIVAL_RATE *
        Math.min(observer.ageTicks[slot], FITNESS_V2.SURVIVAL_CAP, FITNESS_V2.SURVIVAL_PER_DELIBERATE * deliberate);
    const spec = Math.min(specTermV2(observer, counters, slot, config), intake);
    const terms = survival + spec + creditTerms(intent, slot, intake);
    const gated = Math.min(1, deliberate / FITNESS_V2.GATE) * terms;
    const waste =
        FITNESS_V2.IDLE_SIGNAL * intent.idleSignal[slot] + FITNESS_V2.UNDEFENDED * intent.undefendedBite[slot];
    return Math.max(0, base + gated - Math.min(waste, FITNESS_V2.WASTE_CAP * (base + gated)));
}

/**
 * Binds the life counters so v2 fits the evals `fitness(observer, slot, config)` signature.
 * @param {Record<string, any>} counters the life counters
 * @returns {(observer: any, slot: number, config: any) => number}
 */
export function createFitnessV2(counters) {
    return (observer, slot, config) => fitnessV2(observer, counters, slot, config);
}
