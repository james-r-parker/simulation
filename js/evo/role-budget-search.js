// The one-setting search (docs/designs/role-budget.md, "The search"): for a hunter and prey that do not close, which
// single setting, scaled by a factor, makes them close, smallest relative change first. Each finding is a full
// overrides object in the format `audit:chase --config` reads. Pure; the script writes the files.

import { arenaConfig } from './chase-arena.js';
import { budgetChase } from './role-budget-chase.js';
import { roleParams } from './role-budget-params.js';

/** The factors each candidate is scaled by. */
export const FACTORS = Object.freeze([0.5, 0.75, 1.25, 1.5, 2]);

/**
 * The default candidates: a path with `<hunter>` and `<prey>` for the pair's two specialisation entries.
 * @type {readonly string[]}
 */
export const CANDIDATES = Object.freeze([
    'specialisations.<hunter>.sprintBoost',
    'specialisations.<hunter>.sprintDrainMultiplier',
    'specialisations.<hunter>.visionRange',
    'specialisations.<hunter>.rearVisionShare',
    'specialisations.<hunter>.turnMultiplier',
    'specialisations.<hunter>.maxEnergyMultiplier',
    'specialisations.<prey>.sprintBoost',
    'specialisations.<prey>.visionRange',
    'specialisations.<prey>.turnMultiplier',
    'maxVelocity',
    'maxThrust',
    'maxTurn',
    'damping',
    'sprintDrain',
    'sprintRefill',
    'sprintFloor',
    'killShare',
]);

/**
 * @param {any} root an object
 * @param {string} path a dotted path
 * @returns {any} the value at the path
 */
export function getPath(root, path) {
    return path.split('.').reduce((node, key) => node?.[key], root);
}

/**
 * @param {Record<string, any>} root an overrides object, not changed
 * @param {string} path a dotted path
 * @param {number} value the value to put at it
 * @returns {Record<string, any>} a copy of the object with the value at the path
 */
export function withPath(root, path, value) {
    const copy = structuredClone(root);
    const keys = path.split('.');
    let node = copy;
    for (const key of keys.slice(0, -1)) {
        node[key] ??= {};
        node = node[key];
    }
    node[keys[keys.length - 1]] = value;
    return copy;
}

/**
 * @typedef {object} Finding
 * @property {string} path the setting
 * @property {number} factor the factor it was scaled by
 * @property {number} value its new value
 * @property {number} margin the perfect hunter's broken-bound catch margin after the change, in px
 * @property {string} learnSlope the `learnSlope` after the change
 * @property {boolean} fit whether the pair is fit for the rung screen after it (reactive catches, slope ok)
 * @property {Record<string, any>} overrides the overrides object that makes the change, the base overrides included
 */

/**
 * @typedef {object} SearchOptions
 * @property {Record<string, any>} [overrides] the overrides that made the config
 * @property {import('./role-budget-model.js').RoleModel} model the model options
 * @property {readonly string[]} [candidates] the settings to try
 * @property {readonly number[]} [factors] the factors to scale them by
 */

/**
 * @param {Readonly<Record<string, any>>} config a validated config
 * @param {{hunter: string, prey: string}} pair the two specialisations
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {ReturnType<typeof budgetChase>} the pair's budget without the bearings
 */
function budgetOf(config, pair, model) {
    return budgetChase(roleParams(config, pair.hunter), roleParams(config, pair.prey), model, { bearings: false });
}

/**
 * @param {{hunter: string, prey: string, overrides: Record<string, any>, config: Readonly<Record<string, any>>,
 *   model: import('./role-budget-model.js').RoleModel}} from the pair and what to change it from
 * @param {string} path a candidate path
 * @param {number} factor the factor
 * @returns {Finding | null} the finding, null when the config refuses the value
 */
function tryChange(from, path, factor) {
    const value = getPath(from.config, path) * factor;
    const changed = withPath(from.overrides, path, value);
    let next;
    try {
        next = arenaConfig(changed);
    } catch {
        return null;
    }
    const budget = budgetOf(next, from, from.model);
    return {
        path,
        factor,
        value,
        margin: budget.catchMargin,
        learnSlope: budget.learnSlope,
        fit: budget.fit,
        overrides: changed,
    };
}

/**
 * Tries each candidate setting alone at each factor and keeps the changes that reach the goal: a pair that is not
 * catchable (the perfect hunter does not close the broken bound) must become catchable; one that is catchable but not
 * fit for the rung screen must become fit. Smallest relative change first.
 * @param {Readonly<Record<string, any>>} config the validated config of the pair
 * @param {{hunter: string, prey: string}} pair the two specialisations
 * @param {SearchOptions} options the overrides that made `config`, the model, and the settings and factors to try (the
 *   defaults above)
 * @returns {Finding[]} the findings, empty for a pair that is already catchable and fit
 */
export function searchSettings(config, pair, { overrides = {}, model, candidates = CANDIDATES, factors = FACTORS }) {
    const base = budgetOf(config, pair, model);
    if (base.fit) {
        return [];
    }
    const reached = (/** @type {Finding} */ f) => (base.catchable ? f.fit : f.margin >= 0);
    const paths = candidates.map((c) => c.replace('<hunter>', pair.hunter).replace('<prey>', pair.prey));
    const from = { ...pair, overrides, config, model };
    return paths
        .flatMap((path) => factors.map((factor) => tryChange(from, path, factor)))
        .filter((f) => f !== null)
        .filter(reached)
        .sort((a, b) => Math.abs(a.factor - 1) - Math.abs(b.factor - 1) || b.margin - a.margin);
}
