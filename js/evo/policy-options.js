// Policy options: the per-run knobs a screen arm or an eval passes to a policy (`policyOptions`), validated before any
// worker starts and written in a stable form so they can be part of a resume key and a report.
// Pure: no files, no clock.

import { DESCRIPTORS } from './descriptors.js';
import { FITNESS_V6 } from './fitness-v6.js';
import { ARCHIVE_SHARE, CLONE_SHARE_END } from './policies/map-elites-seed.js';

const MIX_KEYS = ['archiveShare', 'cloneShareEnd'];

/** The option keys each policy takes; a policy not listed takes none. */
const ACCEPTED = Object.freeze({
    'map-elites-v1': MIX_KEYS,
    'map-elites-v1q': MIX_KEYS,
    'map-elites-v6': [...MIX_KEYS, 'fitnessOverrides', 'descriptor'],
});

/**
 * @param {unknown} value a value
 * @returns {boolean} whether it is a non-null, non-array object
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value an option value
 * @param {string} name the option, for the error
 * @returns {void}
 * @throws {Error} naming the option when it is not a finite number
 */
function needNumber(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`policyOptions: ${name} must be a finite number, got ${JSON.stringify(value)}`);
    }
}

/**
 * @param {unknown} overrides the `fitnessOverrides` value
 * @returns {void}
 * @throws {Error} naming the key when it is not a `FITNESS_V6` weight with a finite number value
 */
function checkWeights(overrides) {
    if (!isObject(overrides)) {
        throw new Error('policyOptions: fitnessOverrides must be an object of weights');
    }
    for (const [key, value] of Object.entries(/** @type {object} */ (overrides))) {
        if (!Object.hasOwn(FITNESS_V6, key)) {
            throw new Error(
                `policyOptions: fitnessOverrides.${key} is not a fitnessV6 weight; known: ${Object.keys(FITNESS_V6).join(', ')}`,
            );
        }
        needNumber(value, `fitnessOverrides.${key}`);
    }
}

/**
 * @param {Record<string, any>} options the options
 * @returns {void}
 * @throws {Error} naming the option when the shares break `0 <= archiveShare <= cloneShareEnd <= 1`
 */
function checkMix(options) {
    for (const key of MIX_KEYS) {
        if (Object.hasOwn(options, key)) {
            needNumber(options[key], key);
        }
    }
    const archiveShare = options.archiveShare ?? ARCHIVE_SHARE;
    const cloneShareEnd = options.cloneShareEnd ?? CLONE_SHARE_END;
    if (!(archiveShare >= 0 && archiveShare <= cloneShareEnd)) {
        throw new Error(
            `policyOptions: archiveShare ${archiveShare} must be from 0 to cloneShareEnd (${cloneShareEnd})`,
        );
    }
    if (!(cloneShareEnd <= 1)) {
        throw new Error(`policyOptions: cloneShareEnd ${cloneShareEnd} must be at most 1`);
    }
}

/**
 * Checks a run's policy options against the policy that will receive them.
 * @param {string} policyName a registered policy name (not `live`)
 * @param {unknown} options the `policyOptions` object (`undefined` for none)
 * @returns {Record<string, any>} the options (`{}` for none)
 * @throws {Error} naming the bad key or value: an option the policy does not take, a fitness weight that is not in
 *   `FITNESS_V6`, a descriptor that is not registered, or shares out of order
 */
export function validatePolicyOptions(policyName, options) {
    if (options === undefined) {
        return {};
    }
    if (!isObject(options)) {
        throw new Error('policyOptions: must be an object');
    }
    const given = /** @type {Record<string, any>} */ (options);
    const accepted = /** @type {Record<string, string[]>} */ (ACCEPTED)[policyName] ?? [];
    for (const key of Object.keys(given)) {
        if (!accepted.includes(key)) {
            const known = accepted.length > 0 ? accepted.join(', ') : 'none';
            throw new Error(`policyOptions: policy "${policyName}" does not take "${key}"; it takes: ${known}`);
        }
    }
    if (Object.hasOwn(given, 'fitnessOverrides')) {
        checkWeights(given.fitnessOverrides);
    }
    if (Object.hasOwn(given, 'descriptor') && !Object.hasOwn(DESCRIPTORS, given.descriptor)) {
        throw new Error(
            `policyOptions: descriptor "${given.descriptor}" is not registered; known: ${Object.keys(DESCRIPTORS).join(', ')}`,
        );
    }
    checkMix(given);
    return given;
}

/**
 * @param {unknown} value a JSON value
 * @returns {string} its JSON with object keys sorted, so equal options give equal text
 */
function sortedJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(sortedJson).join(',')}]`;
    }
    if (isObject(value)) {
        const entries = Object.entries(/** @type {object} */ (value)).sort(([a], [b]) => (a < b ? -1 : 1));
        return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${sortedJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * @param {Record<string, any> | undefined} options policy options, or none
 * @returns {string} the options as key-sorted JSON (`{}` for none), the form compared for a resume key
 */
export function canonicalOptions(options) {
    return sortedJson(options ?? {});
}

/**
 * Lays an arm's options over a base's; `fitnessOverrides` merge weight by weight, every other key is replaced.
 * @param {Record<string, any>} [base] the grid's base options
 * @param {Record<string, any>} [arm] the arm's options
 * @returns {Record<string, any>} the merged options
 */
export function mergeOptions(base = {}, arm = {}) {
    const merged = { ...base, ...arm };
    if (isObject(base.fitnessOverrides) && isObject(arm.fitnessOverrides)) {
        merged.fitnessOverrides = { ...base.fitnessOverrides, ...arm.fitnessOverrides };
    }
    return merged;
}
