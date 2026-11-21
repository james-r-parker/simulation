// The rows of Phase 4 for the matrix (docs/designs/role-budget.md, "The matrix"): the forager and the reproducer against the
// hunter, the hunter's living, and the first meal and the sitter of each spec. Pure: it builds each row from a config, the
// model and the hunter's Phase 1 budgets.

import { SPEC_NAMES } from '../sim/specs.js';
import { PREY_SPECS } from './role-budget-chase.js';
import { normaliseMix } from './role-budget-choice.js';
import { budgetFirstMeal } from './role-budget-first-meal.js';
import { contextOf } from './role-budget-forage.js';
import { budgetIdle } from './role-budget-idle.js';
import { budgetLiving } from './role-budget-living.js';
import { roleParams } from './role-budget-params.js';
import { budgetThrive } from './role-budget-thrive.js';

/** The rows Phase 4 builds, in the order of the matrix. */
export const PHASE4_ROWS = Object.freeze([
    'forager:predator',
    'reproducer:predator',
    'predator:living',
    ...SPEC_NAMES.map((s) => `${s}:first-meal`),
    ...SPEC_NAMES.map((s) => `${s}:idle`),
]);

/**
 * @param {string} name a row name
 * @returns {readonly string[]} the prey whose Phase 1 budget the row reads: the forager or the reproducer for its own row, every
 *   prey for the hunter's living and first meal
 */
export function preysFor(name) {
    if (name === 'forager:predator' || name === 'reproducer:predator') {
        return [name.slice(0, name.indexOf(':'))];
    }
    return name === 'predator:living' || name === 'predator:first-meal' ? PREY_SPECS : [];
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} spec a specialisation
 * @param {'adult' | 'juvenile'} age the age the body's costs are read at
 * @returns {import('./role-budget-forage.js').Context} its context
 */
function contextAt(config, spec, age) {
    return contextOf(config, spec, roleParams(config, spec, {}, { age }));
}

/**
 * @param {string} name the row, one of `PHASE4_ROWS`
 * @param {{config: Readonly<Record<string, any>>, model: import('./role-budget-model.js').RoleModel,
 *   budgets: Record<string, import('./role-budget-chase.js').ChaseBudget>, mix?: Record<string, number>}} from the config, the
 *   model, the hunter's Phase 1 budgets (for the prey `preysFor` names) and the weights of the prey (equal by default)
 * @returns {{row: import('./role-budget-matrix.js').Row} & Record<string, any>} the
 *   row's budget, with `row` the matrix row
 */
export function phase4Budget(name, { config, model, budgets, mix }) {
    const [spec, kind] = name.split(':');
    if (kind === 'idle') {
        return budgetIdle(contextAt(config, spec, 'juvenile'));
    }
    const hunter = contextAt(config, 'predator', 'adult');
    if (kind === 'predator') {
        return budgetThrive(contextAt(config, spec, 'adult'), { chase: budgets[spec], hunter, model });
    }
    const preys = Object.fromEntries(PREY_SPECS.map((s) => [s, roleParams(config, s)]));
    const weights = mix === undefined ? undefined : normaliseMix(mix);
    const living = () => budgetLiving(hunter, { budgets, preys, mix: weights ?? equal(), model });
    if (name === 'predator:living') {
        return living();
    }
    const juvenile = contextAt(config, spec, 'juvenile');
    if (spec !== 'predator') {
        return budgetFirstMeal(juvenile, { model });
    }
    const l = living();
    const preySize = PREY_SPECS.reduce((sum, s) => sum + (weights ?? equal())[s] * preys[s].size, 0);
    return budgetFirstMeal(juvenile, { model, hunting: { preySize, net: l.chase.net, ticks: l.split.ticksPerChase } });
}

/** @returns {Record<string, number>} equal weights on the prey */
function equal() {
    return Object.fromEntries(PREY_SPECS.map((s) => [s, 1 / PREY_SPECS.length]));
}
