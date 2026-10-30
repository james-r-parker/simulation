// Builds a validated, deeply frozen config from overrides, and hashes it (whole or rules-only).
import { DEFAULTS } from './config-defaults.js';
import { validateConfig } from './config-validate.js';
import { fnv64Hex, fnv64Init, fnv64String } from './fnv.js';

/** Keys that change population size or checking, not the physics or brains. */
const RULES_HASH_EXCLUDED = ['seed', 'maxAgents', 'initialAgents', 'minAgents', 'checkInvariants'];

/**
 * @param {unknown} value any value
 * @returns {boolean} whether it is a non-array object
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Clones a value; objects are copied key by key, arrays whole.
 * @param {any} value the value
 * @returns {any}
 */
function clone(value) {
    if (Array.isArray(value)) {
        return value.map(clone);
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
    }
    return value;
}

/**
 * Deep-merges `overrides` onto `base` into a new object; arrays in overrides replace whole.
 * @param {Record<string, any>} base the defaults
 * @param {Record<string, any>} overrides the overrides
 * @returns {Record<string, any>}
 */
function merge(base, overrides) {
    const result = clone(base);
    for (const [key, value] of Object.entries(overrides)) {
        const merged = isPlainObject(value) && isPlainObject(result[key]);
        result[key] = merged ? merge(result[key], value) : clone(value);
    }
    return result;
}

/**
 * Freezes an object tree in place.
 * @param {any} value the object or array
 * @returns {any} `value`
 */
function deepFreeze(value) {
    for (const child of Object.values(value)) {
        if (child !== null && typeof child === 'object') {
            deepFreeze(child);
        }
    }
    return Object.freeze(value);
}

/**
 * Merges overrides onto the defaults, validates and freezes the result.
 * @param {Record<string, any>} [overrides] config keys to change; objects merge key by key, arrays replace whole
 * @returns {Readonly<Record<string, any>>} the frozen config
 * @throws {Error} when the merged config breaks a validation rule
 */
export function createConfig(overrides = {}) {
    const config = merge(DEFAULTS, overrides);
    validateConfig(config);
    return deepFreeze(config);
}

/**
 * Canonical JSON: keys sorted at every level, arrays in order, numbers by `JSON.stringify`.
 * @param {any} value a JSON-compatible value
 * @returns {string}
 */
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (isPlainObject(value)) {
        const parts = Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
        return `{${parts.join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * @param {string} text ASCII text
 * @returns {string} its FNV-1a 64-bit hash as 16 hex characters
 */
function hashText(text) {
    return fnv64Hex(fnv64String(fnv64Init(new Uint32Array(2)), text));
}

/**
 * Hash of the whole config, stable across key order.
 * @param {Record<string, any>} config a config
 * @returns {string} 16 hex characters
 */
export function configHash(config) {
    return hashText(canonicalJson(config));
}

/**
 * Hash of the config without population-size and checking keys: equal hashes run the same physics and brains.
 * @param {Record<string, any>} config a config
 * @returns {string} 16 hex characters
 */
export function rulesHash(config) {
    const rules = Object.fromEntries(Object.entries(config).filter(([key]) => !RULES_HASH_EXCLUDED.includes(key)));
    return hashText(canonicalJson(rules));
}
