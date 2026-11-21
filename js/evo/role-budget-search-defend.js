// The one-setting search for the defender's row (docs/designs/role-budget.md, "The search"): for a defender that cannot do its
// job, which single setting, scaled by a factor, lets it, smallest relative change first. Two goals: the defence (hear, turn,
// run and intercept all possible) and the smoke (the defender's release possible). Each finding is a full overrides object in
// the format `audit:chase --config` reads. Pure; the script writes the files.

import { budgetDefend } from './role-budget-defend.js';
import { roleParams } from './role-budget-params.js';
import { FACTORS, getPath, scaled } from './role-budget-search.js';

/**
 * The default candidates. A setting that is 0 in the config (the shove at the defaults) is skipped: no factor moves it.
 * @type {readonly string[]}
 */
export const DEFENDER_CANDIDATES = Object.freeze([
    'defenderRepelEnergy',
    'defenderRepelImpulse',
    'specialisations.defender.turnMultiplier',
    'specialisations.defender.sprintBoost',
    'specialisations.defender.maxEnergyMultiplier',
    'specialisations.predator.sprintBoost',
    'specialisations.predator.visionRange',
    'specialisations.predator.turnMultiplier',
    'maxVelocity',
    'maxThrust',
    'maxTurn',
    'damping',
    'callRadius',
    'callTicks',
    'alarmBiteShare',
    'smokeRadius',
    'smokeTicks',
]);

/** The cells each goal needs possible. */
const GOALS = Object.freeze({
    defence: ['hear', 'turn', 'run', 'intercept'],
    smoke: ['smoke'],
});

/**
 * @typedef {'defence' | 'smoke'} Goal
 * @typedef {object} DefenderFinding
 * @property {string} path the setting
 * @property {number} factor the factor it was scaled by
 * @property {number} value its new value
 * @property {Goal} goal the goal it reaches
 * @property {Record<string, number | null>} margins the margin of each cell after the change, null for an impossible one
 * @property {string} status the row's status after the change
 * @property {Record<string, any>} overrides the overrides object that makes the change, the base overrides included
 */

/**
 * @typedef {object} SearchOptions
 * @property {Record<string, any>} [overrides] the overrides that made the config
 * @property {import('./role-budget-model.js').RoleModel} model the model options
 * @property {Goal} goal the goal
 * @property {readonly string[]} [candidates] the settings to try
 * @property {readonly number[]} [factors] the factors to scale them by
 */

/**
 * @param {Readonly<Record<string, any>>} config a validated config
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {ReturnType<typeof budgetDefend>} the defender's budget against the hunter and the forager
 */
function budgetOf(config, model) {
    const [defender, hunter, caller] = ['defender', 'predator', 'forager'].map((s) => roleParams(config, s));
    return budgetDefend(defender, hunter, caller, model);
}

/**
 * @param {ReturnType<typeof budgetDefend>} budget a budget
 * @param {Goal} goal the goal
 * @returns {boolean} whether every cell the goal needs is possible (not impossible, not unread)
 */
function reached(budget, goal) {
    return GOALS[goal].every((step) => ['ok', 'tight'].includes(budget.cells[step].status));
}

/**
 * @param {{config: Readonly<Record<string, any>>, overrides: Record<string, any>, model: import('./role-budget-model.js').RoleModel,
 *   goal: Goal}} from the config and what made it, the model and the goal
 * @param {string} path a candidate path
 * @param {number} factor the factor
 * @returns {DefenderFinding | null} the finding when the change reaches the goal, null when it does not or the config refuses it
 */
function tryChange(from, path, factor) {
    const next = scaled(from.config, { overrides: from.overrides, path, factor });
    if (next === null) {
        return null;
    }
    const budget = budgetOf(next.config, from.model);
    if (!reached(budget, from.goal)) {
        return null;
    }
    const margins = Object.fromEntries(Object.entries(budget.cells).map(([step, c]) => [step, c.margin]));
    return {
        path,
        factor,
        value: next.value,
        goal: from.goal,
        margins,
        status: budget.row.status,
        overrides: next.overrides,
    };
}

/**
 * Tries each candidate setting alone at each factor and keeps the changes that reach the goal, smallest relative change first.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {SearchOptions} options the overrides that made `config`, the model, the goal, and the settings and factors to
 *   try (the defaults above)
 * @returns {DefenderFinding[]} the findings, empty when the goal is already reached
 */
export function searchDefender(
    config,
    { overrides = {}, model, goal, candidates = DEFENDER_CANDIDATES, factors = FACTORS },
) {
    if (reached(budgetOf(config, model), goal)) {
        return [];
    }
    const from = { config, overrides, model, goal };
    return candidates
        .filter((path) => getPath(config, path) > 0)
        .flatMap((path) => factors.map((factor) => tryChange(from, path, factor)))
        .filter((f) => f !== null)
        .sort((a, b) => Math.abs(a.factor - 1) - Math.abs(b.factor - 1));
}
