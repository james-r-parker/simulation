// The joint search over birth energy and the cost of sitting (docs/designs/role-budget.md, "The sitter"): a rise in birth energy
// helps a searcher reach food and lets a sitter live as long again, so a change to it is accepted only when the first-meal row
// turns `ok` and the sitter's life, as a ratio to the searcher's, does not rise. Each birth setting is tried alone and with each
// cold setting. Pure; the script writes the override files.

import { createConfig } from '../sim/config.js';
import { phase4Budget } from './role-budget-matrix-thrive.js';
import { getPath, withPath } from './role-budget-search.js';

/** The birth energies the search may move. */
export const BIRTH_SETTINGS = Object.freeze(['entrantEnergy', 'initialEnergy', 'childEnergyMin']);

/** The cold settings it may move alongside (the `chilled` keys of status-effects.md are skipped until the config has them). */
export const COLD_SETTINGS = Object.freeze([
    'temperatureStart',
    'temperatureLossPassive',
    'temperaturePassiveLossFactor',
    'coldStackRate',
    'coldStackMax',
]);

/** The factors each setting is scaled by. */
export const BIRTH_FACTORS = Object.freeze([0.5, 0.75, 1.25, 1.5, 2, 3, 4]);

/**
 * @typedef {object} BirthFinding
 * @property {{path: string, factor: number, value: number}[]} changes the settings changed: a birth setting, and a cold one or not
 * @property {string} firstMeal the status of the first-meal row after the change
 * @property {number} ratio the sitter's `idleRatio` after the change
 * @property {Record<string, any>} overrides the overrides that make the change, the base overrides included
 */

/**
 * @param {Readonly<Record<string, any>>} config a config
 * @param {{spec: string, model: import('./role-budget-model.js').RoleModel}} what the spec and the model
 * @returns {{firstMeal: string, ratio: number}} the status of the spec's first-meal row and its sitter's ratio
 */
function readOf(config, { spec, model }) {
    const first = phase4Budget(`${spec}:first-meal`, { config, model, budgets: {} });
    return { firstMeal: first.row.status, ratio: phase4Budget(`${spec}:idle`, { config, model, budgets: {} }).ratio };
}

/**
 * @param {Record<string, any>} overrides the overrides so far
 * @param {{path: string, factor: number}[]} changes the settings to scale
 * @param {Readonly<Record<string, any>>} config the config the overrides made
 * @returns {{overrides: Record<string, any>, config: Readonly<Record<string, any>>, changes: BirthFinding['changes']} | null} the
 *   overrides and config with every change applied; null when a setting is absent or 0 (nothing to scale) or the config
 *   refuses the value
 */
function apply(overrides, changes, config) {
    let next = overrides;
    const done = [];
    for (const { path, factor } of changes) {
        const base = getPath(config, path);
        if (typeof base !== 'number' || base === 0) {
            return null;
        }
        const value = BIRTH_SETTINGS.includes(path) ? Math.round(base * factor) : base * factor;
        next = withPath(next, path, value);
        done.push({ path, factor, value });
    }
    try {
        return { overrides: next, config: createConfig(next), changes: done };
    } catch {
        return null;
    }
}

/**
 * Looks for the birth and cold changes that turn a first-meal row `ok` without raising the sitter's ratio.
 * @param {Readonly<Record<string, any>>} config the validated world config
 * @param {{spec?: string, overrides?: Record<string, any>, model: import('./role-budget-model.js').RoleModel,
 *   factors?: readonly number[]}} options the spec (`forager`), the overrides that made the config, the model and the factors
 * @returns {BirthFinding[]} the findings, fewest and smallest changes first; empty when the row is already `ok`
 */
export function searchBirth(config, { spec = 'forager', overrides = {}, model, factors = BIRTH_FACTORS }) {
    const base = readOf(config, { spec, model });
    if (base.firstMeal === 'ok') {
        return [];
    }
    const cold = COLD_SETTINGS.flatMap((path) => factors.map((factor) => ({ path, factor })));
    const births = BIRTH_SETTINGS.flatMap((path) => factors.map((factor) => ({ path, factor })));
    const sets = births.flatMap((b) => [[b], ...cold.map((c) => [b, c])]);
    const found = [];
    for (const changes of sets) {
        const made = apply(overrides, changes, config);
        if (made !== null) {
            const read = readOf(made.config, { spec, model });
            if (read.firstMeal === 'ok' && read.ratio <= base.ratio) {
                found.push({
                    changes: made.changes,
                    firstMeal: read.firstMeal,
                    ratio: read.ratio,
                    overrides: made.overrides,
                });
            }
        }
    }
    const size = (/** @type {BirthFinding} */ f) => f.changes.reduce((sum, c) => sum + Math.abs(c.factor - 1), 0);
    return found.sort((a, b) => a.changes.length - b.changes.length || size(a) - size(b) || a.ratio - b.ratio);
}
