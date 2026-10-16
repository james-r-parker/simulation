// Policy registry: a name to a factory; an unknown name throws listing the known ones.

import { createBaselineV5 } from './baseline-v5.js';

/** The policy the browser and nightly evals run. */
export const LIVE_POLICY = 'baseline-v5';

/** @type {Readonly<Record<string, {create: (options: Record<string, any>) => Record<string, any>}>>} */
export const POLICIES = Object.freeze({
    'baseline-v5': Object.freeze({ create: createBaselineV5 }),
});

/**
 * @param {string} name a key of `POLICIES`
 * @returns {{create: (options: Record<string, any>) => Record<string, any>}}
 * @throws {Error} when the name is unknown, listing the known names
 */
export function getPolicy(name) {
    if (!Object.hasOwn(POLICIES, name)) {
        throw new Error(`Unknown policy "${name}"; known: ${Object.keys(POLICIES).join(', ')}`);
    }
    return POLICIES[name];
}
