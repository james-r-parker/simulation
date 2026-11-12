// Policy registry: a name to a factory; an unknown name throws listing the known ones.

import { createMapElitesV6 } from './map-elites-v6.js';

/** The policy the browser and nightly evals run. */
export const LIVE_POLICY = 'map-elites-v6';

/** @type {Readonly<Record<string, {create: (options: Record<string, any>) => Record<string, any>}>>} */
export const POLICIES = Object.freeze({
    'map-elites-v6': Object.freeze({ create: createMapElitesV6 }),
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
    return /** @type {Record<string, any>} */ (POLICIES)[name];
}
