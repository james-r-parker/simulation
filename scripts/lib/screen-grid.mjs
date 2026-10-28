// Screen grid: reads a grid file (base config, seeds, ticks, policy, named arms) into the list of arms to run.
// Pure: no files, no clock.

import { LIVE_POLICY } from '../../js/evo/policies/index.js';
import { mergeOptions, validatePolicyOptions } from '../../js/evo/policy-options.js';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BASE_ARM = 'base';

/**
 * @typedef {object} GridFile
 * @property {Record<string, any>} [base] config overrides every arm starts from, default `{}`; its `policyOptions`
 *   key (not a config key) holds the policy options every arm starts from
 * @property {number} [seeds] seeds per arm, default 4
 * @property {number} [seedOffset] first seed index in `evals/seeds.json`, default 0
 * @property {number} ticks ticks per seed
 * @property {string} [policy] a policy name or `live`, default `live`
 * @property {string} [reference] the arm the others are compared with; default an added arm `base` (the base alone)
 * @property {Record<string, Record<string, any>>} [arms] named arms, each a config overlay on the base; an arm's
 *   `policyOptions` key holds its policy options (`fitnessOverrides`, `archiveShare`, `cloneShareEnd`,
 *   `descriptor`), laid over the base's and checked against the policy
 * @property {Record<string, any>} [each] each key alone: `key: [v1, v2]` makes arms `key-v1`, `key-v2`; `key: v` makes
 *   the arm `key`; an object value is one arm
 */

/**
 * @typedef {object} Arm
 * @property {string} name the arm name, also its file stem
 * @property {Record<string, any>} overrides the base with the arm's overlay on top (config keys only)
 * @property {Record<string, any>} policyOptions the policy options the arm runs with, `{}` for none
 */

/**
 * @typedef {object} ScreenPlan
 * @property {number} seeds seeds per arm
 * @property {number} seedOffset first seed index
 * @property {number} ticks ticks per seed
 * @property {string} policy policy name or `live`
 * @property {string} reference the reference arm's name
 * @property {Arm[]} arms the arms in run order, reference first when it was added
 */

/**
 * @param {unknown} value a value
 * @returns {boolean} whether it is a non-null, non-array object
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value a config overlay
 * @param {string} where its place in the grid, for the error
 * @returns {Record<string, any>} the overlay
 * @throws {Error} when it is not an object or sets `seed`
 */
function overlay(value, where) {
    if (!isObject(value)) {
        throw new Error(`grid: ${where} must be an object of config overrides`);
    }
    if (Object.hasOwn(/** @type {object} */ (value), 'seed')) {
        throw new Error(`grid: ${where} sets "seed"; seeds come from "seeds" and "seedOffset"`);
    }
    return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {Record<string, any>} value a config overlay that may hold `policyOptions`
 * @returns {{ config: Record<string, any>, options: Record<string, any> | undefined }} the config keys, and the options
 */
function splitOptions(value) {
    const { policyOptions, ...config } = value;
    return { config, options: policyOptions };
}

/**
 * @param {Record<string, any>} each the grid's `each`
 * @returns {Record<string, Record<string, any>>} the arms it makes: `key` or `key-value` mapped to the overlay
 */
export function eachArms(each) {
    /** @type {Record<string, Record<string, any>>} */
    const arms = {};
    for (const [key, value] of Object.entries(each)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                arms[`${key}-${String(item)}`] = { [key]: item };
            }
        } else if (isObject(value)) {
            arms[key] = overlay(value, `each.${key}`);
        } else {
            arms[key] = { [key]: value };
        }
    }
    return arms;
}

/**
 * @param {unknown} value a grid value that must be an integer
 * @param {string} key the key, for the error
 * @param {number} min the smallest allowed
 * @returns {number} the value
 */
function whole(value, key, min) {
    if (!Number.isInteger(value) || /** @type {number} */ (value) < min) {
        throw new Error(`grid: ${key} must be an integer >= ${min}, got ${String(value)}`);
    }
    return /** @type {number} */ (value);
}

/**
 * @param {GridFile} grid the parsed grid file
 * @returns {Record<string, Record<string, any>>} the named arms from `each` and `arms`, name-checked
 * @throws {Error} on a name in both, or an unsafe name
 */
function namedArms(grid) {
    const named = { ...eachArms(grid.each ?? {}) };
    for (const [name, value] of Object.entries(grid.arms ?? {})) {
        if (Object.hasOwn(named, name)) {
            throw new Error(`grid: arm "${name}" is made by both "each" and "arms"`);
        }
        named[name] = overlay(value, `arms.${name}`);
    }
    for (const name of Object.keys(named)) {
        if (!NAME.test(name)) {
            throw new Error(`grid: arm name "${name}" must match ${NAME}`);
        }
    }
    return named;
}

/**
 * @param {Record<string, Record<string, any>>} named the named arms; gains `base` when it is the implicit reference
 * @param {string | undefined} requested the grid's `reference`
 * @returns {{ reference: string, names: string[] }} the reference and the arm names in run order
 * @throws {Error} on an unknown reference or no arm besides the reference
 */
function withReference(named, requested) {
    const reference = requested ?? BASE_ARM;
    const names = Object.keys(named);
    if (reference === BASE_ARM && !names.includes(BASE_ARM)) {
        named[BASE_ARM] = {};
        names.unshift(BASE_ARM);
    }
    if (!names.includes(reference)) {
        throw new Error(`grid: reference "${reference}" is not an arm; arms: ${names.join(', ')}`);
    }
    if (names.length < 2) {
        throw new Error('grid: needs at least one arm besides the reference');
    }
    return { reference, names };
}

/**
 * @param {{ name: string, policy: string }} arm the arm's name and the grid's policy
 * @param {ReturnType<typeof splitOptions>} base the base's config and options
 * @param {Record<string, any>} overlayValue the arm's overlay
 * @returns {Arm} the arm, its policy options checked against the policy
 * @throws {Error} naming the arm and the bad option
 */
function armOf({ name, policy }, base, overlayValue) {
    const own = splitOptions(overlayValue);
    const policyOptions = mergeOptions(base.options, own.options);
    try {
        validatePolicyOptions(policy === 'live' ? LIVE_POLICY : policy, policyOptions);
    } catch (error) {
        throw new Error(`grid: arm "${name}": ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
        });
    }
    return { name, overrides: { ...base.config, ...own.config }, policyOptions };
}

/**
 * @param {GridFile} grid the parsed grid file
 * @returns {ScreenPlan} the plan
 * @throws {Error} naming the bad field: a missing ticks, a duplicate or unsafe arm name, an unknown reference, no arms
 */
export function expandGrid(grid) {
    if (!isObject(grid)) {
        throw new Error('grid: the file must hold an object');
    }
    const base = overlay(grid.base ?? {}, 'base');
    const split = splitOptions(base);
    const named = namedArms(grid);
    const { reference, names } = withReference(named, grid.reference);
    const policy = grid.policy ?? 'live';
    return {
        seeds: whole(grid.seeds ?? 4, 'seeds', 1),
        seedOffset: whole(grid.seedOffset ?? 0, 'seedOffset', 0),
        ticks: whole(grid.ticks, 'ticks', 1),
        policy,
        reference,
        arms: names.map((name) => armOf({ name, policy }, split, named[name])),
    };
}
