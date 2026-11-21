// The numbers that switch the social effects on (docs/designs/status-effects.md, "The social effects"). Every one is 0 by
// default, and an effect whose numbers are all 0 changes no lane and closes no gate, so the stacks it counts cannot reach
// the rest of the world. `worldHash` therefore leaves the stored stacks out until one of these is above 0 (Phase 3 turns
// them on and re-pins the goldens with the adoption). Pure: no world, no RNG.

/** The config keys that give a social effect its strength, each 0 for off. */
export const SOCIAL_KEYS = Object.freeze([
    'rallyThrust',
    'rallyBurn',
    'answeredBite',
    'alertBoost',
    'alertGraze',
    'huddleWarmth',
    'staggerThrust',
    'woundThrust',
    'panicThrust',
    'panicBurn',
    'shakenThrust',
    'coldStackRate',
]);

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {boolean} whether a call's own effects have a strength: `rallied` or `answered` above 0, or `hoarse` above a
 *   factor of 1. While none has, the hunt half of the hearing bookkeeping (`heardFrom`, the rally) and `settleCalls` are
 *   skipped: the stacks they keep reach no lane, no gate and no hash.
 */
export function callEffectsOn(config) {
    return config.rallyThrust > 0 || config.rallyBurn > 0 || config.answeredBite > 0 || config.hoarseFactor > 1;
}

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {boolean} whether any social effect has a strength above 0 (`hoarseFactor`: above 1), so its stored stacks can
 *   move the world
 */
export function socialEffectsOn(config) {
    if (config.hoarseFactor > 1) {
        return true;
    }
    for (let k = 0; k < SOCIAL_KEYS.length; k++) {
        if (config[SOCIAL_KEYS[k]] > 0) {
            return true;
        }
    }
    return false;
}
