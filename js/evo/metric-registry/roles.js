// The role tags of the metric registry (docs/designs/metric-noise.md, Phase 6): which role's job a metric reads.
// A tag is data beside `scenes`: it changes no value, direction or status, and `eval:compare --role <spec>` prints the
// metrics of one role. The roles are the five specialisations plus `herd`.

import { SPEC_NAMES } from '../../sim/specs.js';

/** Every role a `roles` field may hold: the specialisations of `SPECIALISATION_KEYS`, then `herd`. */
export const ROLES = Object.freeze([...SPEC_NAMES, 'herd']);

/**
 * The metrics each role's job is read from (the Phase 6 table of metric-noise.md); one metric may serve two roles.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ROLE_METRICS = Object.freeze({
    predator: Object.freeze([
        'eval.chase_catch_share',
        'eval.pursuit_kill_share',
        'eval.hunter_catches_per_1k_settled',
        'eval.hunter_kills_per_life_mean',
        'eval.bite_idle',
        'eval.hunter_juvenile_death_share',
    ]),
    forager: Object.freeze([
        'eval.deliberate_food_share',
        'eval.food_energy_per_1k',
        'eval.births_per_1k',
        'eval.chase_escape_share',
    ]),
    reproducer: Object.freeze(['eval.child_survival', 'eval.offspring_per_life', 'eval.childshare_by_condition']),
    scout: Object.freeze(['eval.alarm_lift', 'eval.alarm_response', 'eval.scout_alarm_lead_share']),
    defender: Object.freeze([
        'eval.defender_repel_per_1k',
        'eval.defender_bite_break_share',
        'eval.hunter_defender_bite_ratio',
    ]),
    herd: Object.freeze(['eval.herd_dodge_share', 'eval.trampled_share', 'eval.herd_stampede_rate']),
});

/**
 * @template {Record<string, import('./entry.js').MetricEntry>} T
 * @param {T} entries the registry
 * @param {Readonly<Record<string, readonly string[]>>} [tags] the role table
 * @returns {T} the registry with `roles` set on every tagged entry
 * @throws {Error} `role tag names an unknown metric <name>` for a tagged name that has no entry
 */
export function withRoles(entries, tags = ROLE_METRICS) {
    /** @type {Record<string, string[]>} */
    const byMetric = {};
    for (const [role, names] of Object.entries(tags)) {
        for (const name of names) {
            if (!Object.hasOwn(entries, name)) {
                throw new Error(`role tag names an unknown metric ${name}`);
            }
            (byMetric[name] ??= []).push(role);
        }
    }
    /** @type {Record<string, import('./entry.js').MetricEntry>} */
    const merged = { ...entries };
    for (const [name, roles] of Object.entries(byMetric)) {
        merged[name] = Object.freeze({ ...merged[name], roles: Object.freeze(roles) });
    }
    return /** @type {T} */ (/** @type {unknown} */ (Object.freeze(merged)));
}

/**
 * @param {Readonly<Record<string, import('./entry.js').MetricEntry>>} entries the registry
 * @param {string} role a member of `ROLES`
 * @returns {string[]} the metric names tagged with the role, in registry order
 * @throws {Error} `unknown role <role>` for a name outside `ROLES`
 */
export function metricsForRole(entries, role) {
    if (!ROLES.includes(role)) {
        throw new Error(`unknown role ${role} (one of ${ROLES.join(', ')})`);
    }
    return Object.entries(entries)
        .filter(([, entry]) => entry.roles?.includes(role))
        .map(([name]) => name);
}
