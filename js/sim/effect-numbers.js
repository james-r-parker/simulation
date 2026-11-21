// The numbers that switch the social effects on (docs/designs/status-effects.md, "The social effects"). Every one is 0 by
// default, and an effect whose numbers are all 0 changes no lane and closes no gate, so the stacks it counts cannot reach
// the rest of the world. `worldHash` therefore leaves the stored stacks out until one of these is above 0 (Phase 3 turns
// them on and re-pins the goldens with the adoption). Pure: no world, no RNG.

/** The config keys that give a social effect its strength, each 0 for off. */
export const SOCIAL_KEYS = Object.freeze([
    'rallyThrust',
    'rallyBurn',
    'answeredBite',
    'hoarseCost',
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
 * @returns {boolean} whether any social effect has a strength above 0, so its stored stacks can move the world
 */
export function socialEffectsOn(config) {
    for (let k = 0; k < SOCIAL_KEYS.length; k++) {
        if (config[SOCIAL_KEYS[k]] > 0) {
            return true;
        }
    }
    return false;
}
