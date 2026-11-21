// The body rules a stage's drills inherit from the stage world (docs/designs/fair-chase.md, Decisions). A drill is a staged
// scene in an arena of its own, but how a chase plays also depends on the bodies: with the sprint store a hunter that
// outlasts tiring prey wins, and under the default config nobody tires, so a drill cannot tell the two apart.

/**
 * The world-level config keys a stage's drills inherit: the sprint store. Only body rules carry over. Food, density, world
 * size and agent counts do not: each drill's arena sets those itself (a stage's world size would break the staged scenes).
 */
export const DRILL_BODY_KEYS = Object.freeze([
    'sprintStoreEnabled',
    'sprintDrain',
    'sprintRefill',
    'sprintRestThrust',
    'sprintFloor',
]);

/** The per-specialisation fields a stage's drills inherit (inside `specialisations.<name>`). */
export const DRILL_SPEC_BODY_KEYS = Object.freeze(['sprintDrainMultiplier']);

/**
 * @param {Record<string, any>} overrides a stage world's config overrides
 * @returns {Record<string, any>} only its body rules, to lay over a drill's arena (`{}` when it sets none)
 */
export function drillBodyRules(overrides) {
    /** @type {Record<string, any>} */
    const rules = {};
    for (const key of DRILL_BODY_KEYS) {
        if (key in overrides) {
            rules[key] = overrides[key];
        }
    }
    /** @type {Record<string, Record<string, any>>} */
    const specs = {};
    for (const [name, spec] of Object.entries(overrides.specialisations ?? {})) {
        const kept = Object.fromEntries(DRILL_SPEC_BODY_KEYS.filter((k) => k in spec).map((k) => [k, spec[k]]));
        if (Object.keys(kept).length > 0) {
            specs[name] = kept;
        }
    }
    return Object.keys(specs).length === 0 ? rules : { ...rules, specialisations: specs };
}

/**
 * Lays a drill's arena over a config, merging `specialisations` one specialisation deep so an arena that sets the forager's
 * sprint does not drop the predator's body rule. With no `specialisations` in the config it is the plain spread.
 * @param {Record<string, any> | undefined} config the config overrides (the stage's body rules)
 * @param {Record<string, any> | undefined} arena the drill's arena, which wins on its own keys
 * @returns {Record<string, any>} the merged overrides
 */
export function layerArena(config, arena) {
    const merged = { ...config, ...arena };
    if (config?.specialisations === undefined || arena?.specialisations === undefined) {
        return merged;
    }
    const specs = { ...config.specialisations };
    for (const [name, own] of Object.entries(arena.specialisations)) {
        specs[name] = { ...specs[name], ...own };
    }
    return { ...merged, specialisations: specs };
}
